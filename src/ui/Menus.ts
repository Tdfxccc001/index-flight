import { gameOverTitle } from './GameOverTitle';
import { HUD } from '../config/hud';
import type { Day } from '../game/MarketData';
import { B } from '../config/balance';
import { bestScore, readSettings, saveSettings, type Settings } from './Settings';
export class Menus {
  settings = readSettings();
  state = 'home';
  root: HTMLElement;
  panel: HTMLElement;
  hud: HTMLElement;
  reward: HTMLElement;
  private lastCombo = 1;
  private completedRuns = 0;
  private marketAnimation?: Animation;
  private finePointer = matchMedia('(any-pointer: fine)');
  get mouseMoveEnabled() {
    return this.settings.mouseMove && this.finePointer.matches;
  }
  controlHint(visible: boolean) {
    const tutorial = document.querySelector<HTMLElement>('#tutorial')!;
    tutorial.hidden = !visible;
    this.root.classList.toggle('controls-visible', visible);
    tutorial.setAttribute(
      'aria-label',
      this.mouseMoveEnabled
        ? '使用 WASD、方向键或鼠标模拟飞行，单击左键或按空格也可开始'
        : '使用 WASD、方向键或摇杆控制，按空格键也可开始飞行',
    );
    this.root.classList.toggle('mouse-mode', this.mouseMoveEnabled);
    this.text(
      '#tutorial p',
      this.mouseMoveEnabled
        ? '按下操作键、空格或单击左键，开始飞行'
        : '按下操作键、空格或按住画面，开始飞行',
    );
  }
  private marketDay?: Day;
  private comboAnimations: Animation[] = [];
  private hudElements = new Map<string, HTMLElement>();
  private scoreFormatter = new Intl.NumberFormat();
  private closeFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private hudNode(selector: string) {
    let node = this.hudElements.get(selector);
    if (!node) {
      node = document.querySelector<HTMLElement>(selector)!;
      this.hudElements.set(selector, node);
    }
    return node;
  }
  private text(selector: string, value: string) {
    const node = this.hudNode(selector);
    if (node.textContent !== value) node.textContent = value;
  }
  private attribute(node: HTMLElement, key: string, value: string) {
    if (node.getAttribute(key) !== value) node.setAttribute(key, value);
  }
  private style(node: HTMLElement, key: string, value: string) {
    if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value);
  }
  onAction: (action: string) => void = () => {};
  constructor() {
    document.querySelector('#app')!.innerHTML =
      `<div id="vignette"></div><header id="brand"><span class="brandmark">↗</span><span>指数飞行<small>INDEX FLIGHT</small></span><span class="version">v${__APP_VERSION__}</span></header><div id="hud" hidden><div class="score"><small>FLIGHT SCORE</small><strong id="score">0</strong></div><div id="combo-anchor"><span id="combo" data-tier="0" data-boosted="false" title="风险得分倍率"><b id="combo-value">x1.00</b><i class="combo-sparks" aria-hidden="true"></i></span></div><div class="energy"><div><span>飞行能量</span><b id="energy-value">100%</b></div><div class="track" role="progressbar" aria-label="飞行能量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="energy-fill"></i></div><small id="status">↓ 低空飞行可回能</small></div><aside id="current-market" aria-label="当前上证指数行情"><small><b class="market-name">上证指数</b> <time id="market-date">---</time></small><strong id="market-close">—<em>点</em></strong><span id="market-change"><b id="market-symbol">—</b><span id="market-change-text"></span></span></aside><button id="pause" aria-label="暂停游戏">Ⅱ</button></div><main id="panel"></main><div id="reward" aria-live="polite"></div><div id="tutorial" hidden aria-label="使用 WASD、方向键或拖动摇杆开始飞行"><div class="control-options"><div class="key-cluster" aria-label="WASD"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span class="control-or">/</span><div class="key-cluster" aria-label="方向键"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div><span class="control-or">/</span><div class="pointer-demo"><div class="stick-demo" aria-label="拖动摇杆"><i></i></div><div class="mouse-demo" aria-label="左右移动鼠标"><span>←</span><i class="mouse-body"></i><span>→</span></div></div></div><p>按下操作键、空格或按住画面，开始飞行</p></div><div id="joystick" aria-label="飞行摇杆"><div id="knob"></div></div><footer id="footer"><span id="build-status">v${__APP_VERSION__}</span><span>纯前端 · 无尽飞行</span></footer>`;
    this.root = document.querySelector('#app')!;
    this.panel = document.querySelector('#panel')!;
    this.hud = document.querySelector('#hud')!;
    this.reward = document.querySelector('#reward')!;
    try {
      this.completedRuns = Math.max(
        0,
        Number(localStorage.getItem('index-flight-completed-runs')) || 0,
      );
    } catch {}
    this.finePointer.addEventListener('change', () => {
      this.controlHint(!document.querySelector<HTMLElement>('#tutorial')!.hidden);
      const row = document.querySelector<HTMLElement>('#mouse-move-setting');
      if (row) row.hidden = !this.finePointer.matches;
      this.updateMouseSettingHint();
    });
    this.root.classList.toggle('low-effects', !this.settings.effects);
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      if (b) this.onAction(b.dataset.action!);
    });
    document.querySelector('#pause')!.addEventListener('click', () => this.onAction('pause'));
    this.reducedMotion.addEventListener('change', (event) => {
      if (event.matches) {
        this.marketAnimation?.cancel();
        this.comboAnimations.forEach((animation) => animation.cancel());
        this.comboAnimations = [];
      }
    });
  }
  home(loading = false) {
    this.state = 'home';
    this.root.classList.add('menu-open');
    this.controlHint(false);
    this.hud.hidden = true;
    this.root.classList.remove('playing');
    this.panel.hidden = false;
    this.panel.innerHTML = `<section class="hero"><div class="eyebrow"><i></i> A FLIGHT THROUGH THE MARKET</div><h1>在涨跌之间<br>自由<span>穿行。</span></h1><p class="intro">驾驶你的飞机，穿越真实行情构成的峡谷。<br>贴近一点，飞得更险，赢得更多。</p><div class="home-actions"><button class="primary" data-action="start" ${loading ? 'disabled' : ''}>${loading ? '正在检查飞行数据…' : '开始飞行'}<span>↗</span></button><button class="settings-button" data-action="settings" aria-label="打开设置">⚙</button></div><div class="home-bottom"><div><small>PERSONAL BEST</small><strong>${Math.floor(bestScore()).toLocaleString()}<em>分</em></strong></div><div class="home-colors">${this.paletteSwitch()}<div class="legend">${this.legend()}</div></div></div><div class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键</span><span>触屏或鼠标按住拖动</span></div><small class="guide-help">细线 = 机翼投影 · 前框 = 预计净空</small></section><aside class="flight-note"><span>01 — TAKE THE RISK</span><h2>每一次擦肩<br>都值得加分。</h2><p>柱顶掠过 / 机翼擦边 / 连续穿隙</p><div class="note-line"></div><small>柱高来自上证指数每日涨跌点数<br>游戏仅作娱乐，无交易功能</small></aside>`;
  }
  paletteSwitch(id = '') {
    return `<button ${id ? `id="${id}"` : ''} type="button" class="palette-switch" role="switch" aria-checked="${this.settings.reverse}" aria-label="红涨绿跌配色" data-action="toggle-palette"><span>绿涨红跌</span><i aria-hidden="true"></i><span>红涨绿跌</span></button>`;
  }
  legend() {
    return `<span><i style="color:${this.settings.reverse ? '#f0787a' : '#39c6a0'}">▲</i>${this.settings.reverse ? '红' : '绿'}色上涨</span><span><i style="color:${this.settings.reverse ? '#39c6a0' : '#f0787a'}">▼</i>${this.settings.reverse ? '绿' : '红'}色下跌</span>`;
  }
  play() {
    this.state = 'playing';
    this.root.classList.remove('menu-open');
    this.panel.hidden = true;
    this.hud.hidden = false;
    this.root.classList.add('playing');
  }
  pause() {
    this.state = 'paused';
    this.root.classList.add('menu-open');
    this.controlHint(false);
    this.panel.hidden = false;
    this.panel.innerHTML = `<section class="dialog"><span class="eyebrow">TAKE A BREATH</span><h2>暂停片刻。</h2><p>航线会在这里等你。</p><small class="keyboard-hint">空格 / Esc 继续飞行</small><button class="primary" data-action="resume">继续飞行 <span>→</span></button><div class="button-row"><button data-action="restart">重新开始</button><button data-action="settings">设置</button><button data-action="home">返回首页</button></div></section>`;
  }
  dead(
    score: number,
    best: number,
    distance: number,
    combo: number,
    gaps: number,
    edges: number,
    specials: number,
  ) {
    const title = gameOverTitle(this.completedRuns);
    this.completedRuns++;
    try {
      localStorage.setItem('index-flight-completed-runs', String(this.completedRuns));
    } catch {}
    this.state = 'dead';
    this.root.classList.add('menu-open');
    this.controlHint(false);
    this.root.classList.remove('playing');
    this.panel.hidden = false;
    this.panel.innerHTML = `<section class="dialog result"><span class="eyebrow">FLIGHT COMPLETE</span><h2>${title}</h2><small>本次飞行得分</small><strong class="result-score">${Math.floor(score).toLocaleString()}</strong><p>个人最佳 ${Math.floor(best).toLocaleString()} 分</p><div class="stats"><div><b>${Math.floor(distance)}</b><span>飞行米数</span></div><div><b>×${combo.toFixed(2)}</b><span>最高倍率</span></div><div><b>${gaps}</b><span>穿隙</span></div><div><b>${edges}</b><span>擦边</span></div><div><b>${specials}</b><span>特殊闪避</span></div></div><button class="primary" data-action="restart">再来一次 <span>↗</span></button><button class="text-button" data-action="home">返回首页</button><small class="keyboard-hint">Enter / 空格快速重开</small></section>`;
  }
  showSettings(back: string) {
    this.state = 'settings';
    this.root.classList.add('menu-open');
    this.controlHint(false);
    this.panel.hidden = false;
    const s = this.settings;
    this.panel.innerHTML = `<section class="dialog settings"><span class="eyebrow">FLIGHT PREFERENCES</span><h2>按你的方式飞行。</h2><div class="setting-row"><span>行情配色</span>${this.paletteSwitch('setting-reverse')}</div><label>背景音量<input id="setting-music" type="range" min="0" max="1" step=".05" value="${s.music}"></label><label>音效音量（0 为静音）<input id="setting-sound" type="range" min="0" max="1" step=".05" value="${s.sound}"></label><label id="mouse-move-setting" ${this.finePointer.matches ? '' : 'hidden'}>鼠标模拟飞行<input id="setting-mouseMove" type="checkbox" ${s.mouseMove ? 'checked' : ''}></label><p id="mouse-move-setting-hint" role="status" hidden>无需按住左键，移动鼠标即可操控。回到游戏后，可按操作键、空格或单击左键开始飞行。</p><label>操控灵敏度<input id="setting-sensitivity" type="range" min=".5" max="1.7" step=".1" value="${s.sensitivity}"></label>${(['invertKeyboard', 'invertTouch', 'showGuides', 'showChanges'] as const).map((key, i) => `<label>${['键盘上下反向（S / ↓ 向上）', '触控 / 鼠标上下反向', '显示提示线', '显示柱上涨跌点数'][i]}<input id="setting-${key}" type="checkbox" ${s[key] ? 'checked' : ''}></label>`).join('')}<label>完整视觉效果<input id="setting-effects" type="checkbox" ${s.effects ? 'checked' : ''}></label><label>失速镜头轻微抖动<input id="setting-shake" type="checkbox" ${s.shake ? 'checked' : ''}></label><button class="primary" data-action="${back}">完成 <span>✓</span></button></section>`;
    this.updateMouseSettingHint();
    for (const key of [
      'music',
      'sound',
      'sensitivity',
      'effects',
      'shake',
      'invertKeyboard',
      'invertTouch',
      'mouseMove',
      'showGuides',
      'showChanges',
    ] as const) {
      document.querySelector(`#setting-${key}`)!.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement;
        const value = [
          'effects',
          'shake',
          'invertKeyboard',
          'invertTouch',
          'mouseMove',
          'showGuides',
          'showChanges',
        ].includes(key)
          ? el.checked
          : Number(el.value);
        (s as unknown as Record<string, unknown>)[key] = value;
        saveSettings(s);
        this.root.classList.toggle('low-effects', !s.effects);
        this.updateMouseSettingHint();
        if (!s.effects) {
          this.marketAnimation?.cancel();
          this.comboAnimations.forEach((animation) => animation.cancel());
          this.comboAnimations = [];
        }
      });
    }
  }
  private updateMouseSettingHint() {
    const hint = document.querySelector<HTMLElement>('#mouse-move-setting-hint');
    if (hint) hint.hidden = !this.mouseMoveEnabled;
  }
  togglePalette() {
    this.settings.reverse = !this.settings.reverse;
    saveSettings(this.settings);
    this.panel
      .querySelectorAll('[data-action="toggle-palette"]')
      .forEach((toggle) => toggle.setAttribute('aria-checked', String(this.settings.reverse)));
    const legend = this.panel.querySelector('.legend');
    if (legend) legend.innerHTML = this.legend();
    this.updateMarketColor();
  }
  update(score: number, energy: number, combo: number, status: string, height: number = B.startY) {
    this.updateMarketColor();
    const scoreLabel = this.scoreFormatter.format(Math.floor(score));
    this.text('#score', scoreLabel);
    this.style(
      this.hudNode('.score'),
      '--score-units',
      String(Math.max(2.6, scoreLabel.length * 0.62)),
    );
    const badge = this.hudNode('#combo');
    let tier = 0;
    HUD.comboTiers.forEach((entry, index) => {
      if (combo >= entry.min) tier = index;
    });
    this.attribute(badge, 'data-tier', String(tier));
    this.attribute(badge, 'data-boosted', String(combo > 1));
    this.style(badge, '--combo-color', HUD.comboTiers[tier].color);
    this.attribute(badge, 'aria-label', `风险得分倍率 ${combo.toFixed(2)} 倍`);
    this.text('#combo-value', `x${combo.toFixed(2)}`);
    if (combo !== this.lastCombo) {
      this.comboAnimations.forEach((animation) => animation.cancel());
      this.comboAnimations = [];
      if (combo > this.lastCombo && this.settings.effects && !this.reducedMotion.matches) {
        const duration = combo >= 4 ? HUD.highPulseDuration : HUD.pulseDuration,
          scale = combo >= 5 ? 1.22 : combo >= 3 ? 1.16 : 1.1;
        this.comboAnimations.push(
          badge.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
            duration,
            easing: 'cubic-bezier(.2,.7,.25,1)',
          }),
        );
        if (combo >= 3)
          this.comboAnimations.push(
            this.hudNode('.combo-sparks').animate(
              [
                { opacity: 0, transform: 'scale(.9)' },
                { opacity: 0.8, offset: 0.22 },
                { opacity: 0, transform: 'scale(1.65)' },
              ],
              { duration: HUD.sparksDuration, easing: 'ease-out' },
            ),
          );
      }
    }
    this.lastCombo = combo;
    const value = Math.max(0, Math.min(100, energy));
    this.text('#energy-value', `${Math.round(value)}%`);
    const panel = this.hudNode('.energy');
    this.attribute(
      panel,
      'data-level',
      value < HUD.energyCritical ? 'critical' : value < HUD.energyLow ? 'low' : 'healthy',
    );
    this.attribute(
      panel,
      'data-mode',
      height < B.lowZone ? 'recovering' : height > B.highZone ? 'draining' : 'cruise',
    );
    const fill = this.hudNode('#energy-fill');
    this.style(fill, 'width', `${value}%`);
    this.attribute(this.hudNode('.track'), 'aria-valuenow', String(Math.round(value)));
    this.text('#status', status);
  }
  setMarket(day?: Day) {
    this.marketDay = day;
    const panel = this.hudNode('#current-market');
    this.attribute(panel, 'data-direction', day?.direction ?? 'waiting');
    this.text('#market-date', day?.date ?? '---');
    const close = this.hudNode('#market-close').firstChild as Text;
    const closeLabel = day ? this.closeFormatter.format(day.close) : '—';
    if (close.data !== closeLabel) close.data = closeLabel;
    this.text(
      '#market-symbol',
      day?.direction === 'up' ? '▲' : day?.direction === 'down' ? '▼' : day ? '▬' : '—',
    );
    this.text(
      '#market-change-text',
      day
        ? ` ${day.direction === 'up' ? '+' : day.direction === 'down' ? '−' : ''}${Math.abs(day.change).toFixed(2)} 点 · ${day.direction === 'up' ? '上涨' : day.direction === 'down' ? '下跌' : '平盘'}`
        : '',
    );
    this.marketAnimation?.cancel();
    if (day && day.direction !== 'flat' && this.settings.effects && !this.reducedMotion.matches) {
      const offset = day.direction === 'up' ? 10 : -10;
      this.marketAnimation = this.hudNode('#market-symbol').animate(
        [
          { opacity: 0, transform: `translateY(${offset}px)` },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    }
    this.updateMarketColor();
  }
  private updateMarketColor() {
    const direction = this.marketDay?.direction;
    const up = this.settings.reverse ? '#f0787a' : '#39c6a0';
    const down = this.settings.reverse ? '#39c6a0' : '#f0787a';
    this.style(
      this.hudNode('#current-market'),
      '--market-color',
      direction === 'up' ? up : direction === 'down' ? down : '#bfd0da',
    );
  }
  error(e: unknown) {
    this.panel.hidden = false;
    this.panel.innerHTML =
      '<section class="dialog"><h2>暂时无法起飞</h2><p id="error-message"></p><button data-action="reload">重新载入</button></section>';
    document.querySelector('#error-message')!.textContent = String(e);
  }
}
