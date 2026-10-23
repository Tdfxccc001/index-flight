import { PerformanceDiagnostics } from './PerformanceDiagnostics';
import { airObstacle, rotationSlot } from './AirObstacles';
import { HUD } from '../config/hud';
import { crossedMarketDay } from './CurrentMarket';
import { nextMarketRowZ, needsMarketRow } from './RowSpacing';
import { composeEncounter } from './EncounterComposer';
import { periodMarkers } from './MarketAnnotations';
import { B } from '../config/balance';
import { fly, initialFlight, type Flight, type Control } from './FlightController';
import { WorldRenderer } from './Renderer';
import { Random } from './SeededRandom';
import { MarketSequence, validateMarket, type Market } from './MarketData';
import { boundary, hits } from './CollisionSystem';
import { advance, rowPassed, type Row } from './Obstacles';
import { ScoreSystem } from './ScoreSystem';
import { InputManager } from '../input/InputManager';
import { Menus } from '../ui/Menus';
import { bestScore, saveBest } from '../ui/Settings';
import { AudioManager } from '../audio/AudioManager';
import { forwardSpeed, DifficultyDirector } from './DifficultyDirector';
import { PlannerClient } from './PlannerClient';
import { layoutColumns, gapCenters, blockadeColumns, sharedLowOpenings } from './RowLayout';
export class Game {
  readonly diagnostics =
    import.meta.env.DEV && new URLSearchParams(location.search).has('perf')
      ? new PerformanceDiagnostics()
      : undefined;
  ui = new Menus();
  world: WorldRenderer;
  audio = new AudioManager();
  input: InputManager;
  flight = initialFlight();
  previous = initialFlight();
  rows: Row[] = [];
  score = new ScoreSystem();
  time = 0;
  distance = 0;
  seed = 20221021;
  state: 'loading' | 'home' | 'ready' | 'playing' | 'paused' | 'dying' | 'dead' = 'loading';
  private pausedFromReady = false;
  private overlayRendered = false;
  private waitingRendered = false;
  crashEndsAt = 0;
  market!: Market;
  lastMarketDate = '';
  sequence!: MarketSequence;
  layout!: Random;
  nextId = 1;
  rowNumber = 0;
  accumulator = 0;
  lastFrame = 0;
  lastHud = 0;
  rewardUntil = 0;
  settingsBack = 'home';
  planner = new PlannerClient();
  director!: DifficultyDirector;
  planning = false;
  generation = 0;
  lastSpecialCheck = 0;
  lastPlanMs = 0;
  rejected = 0;
  pendingRow: Row | undefined;
  stagedSpawn:
    | {
        candidate?: Row;
        companions?: Row[];
        safe: boolean;
        startTime: number;
        startDistance: number;
        shiftedIds?: number[];
      }
    | undefined;
  planCommitTime = Infinity;
  constructor(readonly allObstaclesUnlocked = false) {
    this.world = new WorldRenderer(this.ui.root);
    this.ui.onAction = (a) => this.action(a);
    window.addEventListener('resize', () => {
      this.overlayRendered = false;
      this.waitingRendered = false;
    });
    this.ui.root.addEventListener('input', () => {
      this.overlayRendered = false;
      this.waitingRendered = false;
    });
    this.input = new InputManager(
      document.querySelector('#joystick')!,
      document.querySelector('#knob')!,
      () => this.state === 'playing' || this.state === 'ready',
      () => this.action('pause'),
      () => this.beginFlight(),
      () => this.ui.mouseMoveEnabled,
      () => this.state === 'playing',
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' && !e.repeat && this.state === 'paused' && this.ui.state === 'paused') {
        e.preventDefault();
        this.action('resume');
        this.beginFlight();
        return;
      }
      if ((e.target as HTMLElement).closest('button,input,select,textarea')) return;
      if (
        (e.key === 'Enter' || e.key === ' ') &&
        !e.repeat &&
        (this.state === 'dead' || this.state === 'home') &&
        this.ui.state !== 'settings'
      ) {
        e.preventDefault();
        this.start();
      }
    });
    this.ui.home(true);
    void this.load();
    requestAnimationFrame((t) => this.frame(t));
  }
  async load() {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}data/sse_composite_daily.json`);
      if (!r.ok) throw Error('静态行情文件未能读取');
      this.market = await r.json();
      validateMarket(this.market);
      await this.world.annotations.ready;
      this.reset();
      this.state = 'home';
      this.ui.home();
    } catch (e) {
      this.ui.error(e);
    }
  }
  reset() {
    this.world.effects.reset();
    this.crashEndsAt = 0;
    this.stagedSpawn = undefined;
    this.waitingRendered = false;
    this.planCommitTime = Infinity;
    this.pendingRow = undefined;
    this.generation++;
    this.planner.cancel();
    this.diagnostics?.endWait(this.time);
    this.diagnostics?.record('reset', this.time);
    this.planning = false;
    this.lastSpecialCheck = 0;
    this.rejected = 0;
    this.flight = initialFlight();
    this.previous = { ...this.flight };
    this.rows = [];
    this.time = 0;
    this.distance = 0;
    this.score = new ScoreSystem();
    this.nextId = 1;
    this.rowNumber = 0;
    this.accumulator = 0;
    this.layout = new Random(this.seed ^ 0x294a);
    this.director = new DifficultyDirector(
      new Random(this.seed ^ 0x321),
      this.allObstaclesUnlocked,
    );
    this.lastMarketDate = this.market.baseline.date;
    this.sequence = new MarketSequence(this.market.records, new Random(this.seed ^ 0x111));
    this.input.reset();
    this.rewardUntil = 0;
    this.ui.reward.textContent = '';
    this.ui.setMarket();
    this.ui.reward.getAnimations().forEach((animation) => animation.cancel());
    for (let z = B.firstRow; z <= B.lookAhead; z += B.rowSpacing) this.rows.push(this.makeRow(-z));
  }
  makeRow(z: number): Row {
    const days = this.sequence.next();
    const periods = periodMarkers(days, this.lastMarketDate);
    this.lastMarketDate = days[days.length - 1].date;
    return {
      periods,
      id: this.nextId++,
      z,
      kind: 'normal',
      columns: layoutColumns(days, this.rowNumber++, this.time, this.layout),
      lateral: 0,
      extraSpeed: 0,
      age: 0,
      scored: false,
      top: Infinity,
      side: Infinity,
      gap: false,
    };
  }
  async planSpawn(normal: boolean) {
    if (this.planning) return;
    this.planning = true;
    this.planCommitTime = this.time + B.spawnCommitDelay;
    const generation = this.generation;
    const nextZ = nextMarketRowZ(this.rows);
    const active = this.rows.filter((r) => r.kind !== 'normal' && r.z < 3).length;
    const kind = this.director.choose(this.time, active, normal);
    let candidate: Row | undefined = normal ? this.pendingRow || this.makeRow(nextZ) : undefined;
    if (candidate) candidate.z = nextZ;
    if (candidate) {
      const recent = this.rows
        .filter((r) => r.kind === 'normal')
        .sort((a, b) => a.z - b.z)
        .slice(0, 2);
      for (
        let retry = 0;
        retry < 3 && recent.length && sharedLowOpenings([...recent, candidate]).length;
        retry++
      ) {
        candidate.columns = layoutColumns(
          candidate.columns.map((c) => c.day!),
          this.rowNumber++,
          this.time,
          this.layout,
        );
      }
      if (recent.length >= 2 && sharedLowOpenings([...recent, candidate]).length) {
        this.pendingRow = candidate;
        this.planning = false;
        this.planCommitTime = Infinity;
        this.rejected++;
        return;
      }
    }
    let channels: number[] = [...B.lanes];
    const ordinaryColumns = candidate?.columns.map((c) => ({ ...c }));
    let shiftedIds: number[] = [];
    if (kind === 'moving' && candidate) {
      candidate.kind = 'moving';
      candidate.columns.forEach((c, i) => {
        c.x = (i - 2) * B.movingPitch;
        c.width = B.movingWidth;
      });
      const previousMoving = this.rows
        .filter((r) => r.kind === 'moving')
        .sort((a, b) => a.z - b.z)[0];
      const sign =
        this.time >= B.encounterUnlock
          ? previousMoving
            ? -Math.sign(previousMoving.lateral)
            : this.rowNumber % 2
              ? -1
              : 1
          : 1;
      candidate.lateral =
        sign * (B.movingBaseSpeed + Math.min(B.movingMaxIncrease, this.time / B.movingRamp));
    } else if ((kind === 'beam' || kind === 'rotor') && !normal) {
      const day = this.market.records[this.layout.int(this.market.records.length)];
      candidate = airObstacle(kind, this.nextId++, this.time, this.layout, day);
      if (kind === 'rotor') {
        const slot = rotationSlot(this.rows);
        if (!slot) candidate = undefined;
        else {
          candidate.z = slot.z;
          shiftedIds = slot.shiftedIds;
        }
      }
      if (candidate) {
        candidate.spawnState = { x: this.flight.x, y: this.flight.y };
        candidate.threatened = hits(this.flight, this.flight, { ...candidate, z: 0 }, 0, 0);
      }
    } else if ((kind === 'rush' || kind === 'block') && !normal) {
      const reachableBlock =
        kind === 'block' &&
        this.flight.y < B.blockMaxY &&
        this.flight.energy > B.blockMinEnergy &&
        this.flight.load < B.blockMaxLoad &&
        !this.flight.recover &&
        this.flight.stall === 0;
      if (kind === 'rush' || reachableBlock) {
        const source = this.rows
          .filter((r) => r.kind === 'normal' || r.kind === 'moving')
          .sort(
            (a, b) =>
              Math.abs(a.z + B.specialSpawnDistance) - Math.abs(b.z + B.specialSpawnDistance),
          )[0];
        channels = source ? gapCenters(source) : [...B.lanes];
        const lanes = channels.length === 4 ? channels : [...B.lanes];
        const nearest = lanes.reduce((a, b) =>
          Math.abs(a - this.flight.x) < Math.abs(b - this.flight.x) ? a : b,
        );
        candidate = {
          id: this.nextId++,
          z: -B.specialSpawnDistance,
          kind,
          columns:
            kind === 'block'
              ? blockadeColumns(lanes, this.flight.y + B.blockHeadroom)
              : [nearest].map((x) => ({
                  x,
                  width: B.rushWidth,
                  height: Math.min(B.rushMaxHeight, this.flight.y + B.rushHeightExtra),
                  direction: 'down',
                })),
          lateral: 0,
          extraSpeed:
            kind === 'block'
              ? B.blockExtraSpeed
              : B.rushBaseSpeed + Math.min(B.rushMaxIncrease, this.time / B.rushRamp),
          age: 0,
          scored: false,
          top: Infinity,
          side: Infinity,
          gap: false,
        };
        candidate.spawnState = { x: this.flight.x, y: this.flight.y };
        candidate.threatened = hits(this.flight, this.flight, { ...candidate, z: 0 }, 0, 0);
      }
    }
    if (!candidate) {
      this.planning = false;
      this.planCommitTime = Infinity;
      return;
    }
    let batch = composeEncounter(
      candidate,
      this.flight,
      channels,
      this.time,
      this.director.encounters,
      active,
      () => this.nextId++,
    );
    for (const row of batch)
      for (const column of row.columns) {
        if (!column.day && !column.quoteDay) {
          column.quoteDay = this.market.records[this.layout.int(this.market.records.length)];
          column.direction = column.quoteDay.direction;
        }
      }
    const startedDistance = this.distance,
      startedTime = this.time;
    const snapshotFlight = { ...this.flight },
      snapshotRows = structuredClone(this.rows);
    for (const row of snapshotRows) if (shiftedIds.includes(row.id)) row.z -= B.rowSpacing;
    const held = this.input.read(
      this.ui.settings.sensitivity,
      this.ui.settings.invertKeyboard,
      this.ui.settings.invertTouch,
    );
    // Include a reaction interval before any search action changes.
    const check = (rows: Row[]) => {
      const diagnostics = this.diagnostics;
      const started = diagnostics ? performance.now() : 0;
      const pending = this.planner.check(snapshotFlight, rows, startedTime, held);
      if (!diagnostics) return pending;
      return pending.then((result) => {
        diagnostics.record('plan', startedTime, performance.now() - started, result.durationMs);
        return result;
      });
    };
    let result = await check([...snapshotRows, ...batch]);
    if (generation !== this.generation) return;
    this.lastPlanMs = result.durationMs;
    if (!result.safe && batch.length > 1) {
      batch = [candidate];
      candidate.encounter = 'single';
      result = await check([...snapshotRows, candidate]);
      if (generation !== this.generation) return;
      this.lastPlanMs += result.durationMs;
    }
    if (!result.safe && normal) {
      this.rejected++;
      candidate.kind = 'normal';
      candidate.encounter = 'single';
      candidate.lateral = 0;
      const days = ordinaryColumns!.map((c) => c.day!);
      const recent = snapshotRows
        .filter((r) => r.kind === 'normal')
        .sort((a, b) => a.z - b.z)
        .slice(0, 2);
      // Change the route, not its distance: failed moving rows used to create
      // a second empty row of space here. Keep dates and the stream's pitch.
      for (let attempt = 0; attempt < B.normalLayoutRetries && !result.safe; attempt++) {
        candidate.columns =
          attempt === 0
            ? ordinaryColumns!
            : layoutColumns(days, this.rowNumber++, this.time, this.layout);
        if (recent.length >= 2 && sharedLowOpenings([...recent, candidate]).length) continue;
        result = await check([...snapshotRows, candidate]);
        if (generation !== this.generation) return;
        this.lastPlanMs += result.durationMs;
      }
    }
    if (!result.safe) {
      this.rejected++;
      if (normal) {
        // Preserve all five bound days for the next attempt, never consume rejected rows.
        this.pendingRow = candidate;
      }
    }
    this.stagedSpawn = {
      candidate: result.safe ? candidate : undefined,
      companions: result.safe ? batch.slice(1) : [],
      safe: result.safe,
      startTime: startedTime,
      startDistance: startedDistance,
      shiftedIds: result.safe ? shiftedIds : [],
    };
  }
  commitSpawn() {
    if (!this.planning || this.time < this.planCommitTime) return true;
    // Commit on a fixed logical tick, independent of worker/device speed. If a
    // slow device is still computing, retain this tick instead of skipping checks.
    if (!this.stagedSpawn) {
      this.diagnostics?.wait(this.time);
      return false;
    }
    this.diagnostics?.endWait(this.time);
    const p = this.stagedSpawn,
      c = p.candidate;
    if (c) {
      for (const row of this.rows) if (p.shiftedIds?.includes(row.id)) row.z -= B.rowSpacing;
      if (c.kind === 'rush' || c.kind === 'block') this.director.encounters++;
      for (const c of [p.candidate!, ...(p.companions || [])]) {
        c.z += this.distance - p.startDistance + c.extraSpeed * (this.time - p.startTime);
        c.age += this.time - p.startTime;
        this.rows.push(c);
      }
      if (c.kind === 'normal' || c.kind === 'moving') this.pendingRow = undefined;
    }
    this.stagedSpawn = undefined;
    this.planning = false;
    this.planCommitTime = Infinity;
    return true;
  }
  start() {
    if (!this.market) return;
    this.audio.unlock();
    this.reset();
    this.state =
      matchMedia('(any-pointer: fine)').matches || !matchMedia('(pointer: coarse)').matches
        ? 'ready'
        : 'playing';
    this.pausedFromReady = false;
    this.ui.play();
    this.ui.controlHint(this.state === 'ready');
  }
  beginFlight() {
    if (this.state !== 'ready') return;
    this.audio.unlock();
    this.state = 'playing';
    this.accumulator = 0;
    this.ui.controlHint(false);
  }
  action(a: string) {
    if (a === 'toggle-palette') {
      this.ui.togglePalette();
      this.overlayRendered = false;
      return;
    }
    if (a === 'start' || a === 'restart') {
      this.start();
      return;
    }
    if (a === 'pause') {
      if (this.state === 'playing' || this.state === 'ready') {
        this.pausedFromReady = this.state === 'ready';
        this.state = 'paused';
        this.input.reset();
        this.ui.pause();
      } else if (this.state === 'paused' && this.ui.state === 'paused') this.action('resume');
      return;
    }
    if (a === 'resume') {
      this.state = this.pausedFromReady || this.ui.mouseMoveEnabled ? 'ready' : 'playing';
      this.accumulator = 0;
      this.input.reset();
      this.ui.play();
      this.ui.controlHint(this.state === 'ready');
      return;
    }
    if (a === 'home') {
      this.state = 'home';
      if (this.market) this.reset();
      this.ui.home();
      return;
    }
    if (a === 'settings') {
      this.settingsBack = this.state === 'paused' ? 'back-pause' : 'home';
      this.ui.showSettings(this.settingsBack);
      return;
    }
    if (a === 'back-pause') {
      this.ui.pause();
      return;
    }
    if (a === 'reload') location.reload();
  }
  die() {
    this.state = 'dying';
    this.crashEndsAt = performance.now() + B.crashDuration * 1000;
    this.input.reset();
    this.audio.tone('crash', this.ui.settings.sound);
    const best = Math.max(bestScore(), Math.floor(this.score.score));
    saveBest(best);
    document.querySelector<HTMLElement>('#tutorial')!.hidden = true;
  }
  finishDeath() {
    this.state = 'dead';
    const best = bestScore();
    this.ui.dead(
      this.score.score,
      best,
      this.distance,
      this.score.maxCombo,
      this.score.gaps,
      this.score.edges,
      this.score.specials,
    );
    document.querySelector<HTMLElement>('#tutorial')!.hidden = true;
  }
  step(control: Control) {
    if (!this.commitSpawn()) return;
    const speed = forwardSpeed(this.time);
    this.previous = { ...this.flight };
    const next = fly(this.flight, control, B.dt);
    if (boundary(next) || this.rows.some((r) => hits(this.flight, next, r, speed, B.dt))) {
      this.flight = next;
      this.die();
      return;
    }
    const stalled = this.flight.stall === 0 && next.stall > 0;
    this.flight = next;
    if (stalled) this.audio.tone('stall', this.ui.settings.sound);
    this.time += B.dt;
    this.distance += speed * B.dt;
    this.score.update(speed * B.dt, this.time);
    for (const row of this.rows) {
      this.score.observe(this.flight, row);
      const previousZ = row.z;
      advance(row, speed, B.dt);
      const day = crossedMarketDay(row, previousZ, this.previous.x, this.flight.x, B.dt);
      if (day) this.ui.setMarket(day);
      this.score.observe(this.flight, row);
      if (rowPassed(row) && !row.scored) {
        this.diagnostics?.record('pass', this.time, undefined, row.id);
        const text = this.score.settle(row, this.time, this.flight);
        if (text) {
          this.ui.reward.textContent = text;
          this.ui.reward.getAnimations().forEach((animation) => animation.cancel());
          if (this.ui.settings.effects)
            this.ui.reward.animate(
              [
                { opacity: 0, transform: 'translateY(10px)' },
                { opacity: 1, transform: 'translateY(0)', offset: 0.15 },
                { opacity: 1, offset: 0.7 },
                { opacity: 0, transform: 'translateY(-12px)' },
              ],
              { duration: 1100, fill: 'forwards', easing: 'ease-out' },
            );
          this.rewardUntil = this.time + 1.2;
          this.audio.tone('reward', this.ui.settings.sound, this.score.combo);
        }
      }
    }
    this.rows = this.rows.filter((r) => r.z < 12);
    if (!this.planning && this.time - this.lastSpecialCheck > B.spawnPoll) {
      this.lastSpecialCheck = this.time;
      if (needsMarketRow(this.rows)) void this.planSpawn(true);
      else if (this.allObstaclesUnlocked || this.time > B.rushUnlock) void this.planSpawn(false);
    }
    if (this.time > this.rewardUntil) this.ui.reward.textContent = '';
  }
  frame(now: number) {
    if (this.state === 'dying' && now >= this.crashEndsAt) this.finishDeath();
    if (this.state !== 'playing') this.diagnostics?.endWait(this.time);
    const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
    if (this.lastFrame && this.state === 'playing')
      this.diagnostics?.record('frame', this.time, now - this.lastFrame);
    this.lastFrame = now;
    if (this.state === 'playing') {
      this.accumulator += dt;
      const c = this.input.read(
        this.ui.settings.sensitivity,
        this.ui.settings.invertKeyboard,
        this.ui.settings.invertTouch,
      );
      while (this.accumulator >= B.dt && this.state === 'playing') {
        this.step(c);
        this.accumulator -= B.dt;
      }
    } else this.accumulator = 0;
    if (now - this.lastHud > 70) {
      this.ui.update(
        this.score.score,
        this.flight.energy,
        this.score.combo,
        this.flight.stall > 0 || this.flight.recover
          ? '失速 · 松开上升恢复'
          : this.flight.load > 2
            ? '爬升过久 · 即将失速'
            : this.flight.energy < HUD.recoveryNotice && this.flight.y >= B.lowZone
              ? '↓ 降低高度，恢复能量'
              : this.flight.y > B.highZone
                ? '高空耗能 · ↓ 低空回能'
                : this.flight.y < B.lowZone
                  ? '低空恢复 · 保持低飞'
                  : '↓ 低空飞行可回能',
        this.flight.y,
      );
      this.lastHud = now;
    }
    const alpha = this.state === 'playing' ? this.accumulator / B.dt : 1;
    const visual = {
      ...this.flight,
      x: this.previous.x + (this.flight.x - this.previous.x) * alpha,
      y: this.previous.y + (this.flight.y - this.previous.y) * alpha,
    };
    // Cache the static scene beneath menus so the CSS blur needs no new 3D frames.
    const overlay = ['paused', 'dead'].includes(this.ui.state) || this.ui.state === 'settings';
    const waiting =
      this.state === 'playing' &&
      this.planning &&
      !this.stagedSpawn &&
      this.time >= this.planCommitTime;
    // A commit wait has no new physics to display. Redrawing the same scene
    // saturates software/integrated GPUs and competes with the worker that must
    // finish before play can continue. Keep input and rAF alive while it works.
    if ((!overlay || !this.overlayRendered) && (!waiting || !this.waitingRendered))
      this.world.render(
        visual,
        this.rows,
        this.distance,
        dt,
        this.ui.settings,
        this.state === 'dead' || this.state === 'dying',
        this.state === 'playing',
        this.time,
        this.state === 'home' && this.ui.state === 'home',
      );
    this.overlayRendered = overlay;
    this.waitingRendered = waiting;
    this.audio.levels(
      this.ui.settings.sound,
      this.ui.settings.music,
      this.state === 'playing',
      forwardSpeed(this.time),
      this.flight.vy,
      this.time,
    );
    requestAnimationFrame((t) => this.frame(t));
  }
}
