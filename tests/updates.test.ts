import test from 'node:test';
import assert from 'node:assert/strict';
import { periodMarkers, changeLabel } from '../src/game/MarketAnnotations';
import { musicNotes } from '../src/audio/FlightMusic';
import { DifficultyDirector } from '../src/game/DifficultyDirector';
import { Random } from '../src/game/SeededRandom';
import { B } from '../src/config/balance';
import type { Day } from '../src/game/MarketData';
const day = (date: string, change = 1): Day => ({
  date,
  change,
  close: 3000,
  direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
});
test('real calendar markers show year only on year transitions, including intra-row boundaries', () => {
  assert.deepEqual(
    periodMarkers([day('2022-01-04'), day('2022-01-05')], '2021-12-31').map((m) => m.label),
    ['Jan 2022'],
  );
  assert.deepEqual(periodMarkers([day('2022-07-29'), day('2022-08-01')], '2022-07-28'), [
    { label: 'Aug', index: 1, date: '2022-08-01' },
  ]);
  assert.deepEqual(
    periodMarkers([day('2022-12-30'), day('2023-01-03')], '2022-12-29').map((m) => m.label),
    ['Jan 2023'],
  );
  assert.equal(changeLabel(day('2022-01-04', -37.15)), '-37.15');
  assert.equal(changeLabel(day('2022-01-04', 7.45)), '+7.45');
  assert.equal(changeLabel(day('2022-01-04', 0)), '0.00');
});
test('director offers all special types frequently while respecting cooldown', () => {
  const d = new DifficultyDirector(new Random(42));
  const counts = { moving: 0, rush: 0, block: 0, beam: 0, rotor: 0 };
  let last = -100;
  for (let t = 0; t < 240; t += 0.5) {
    const kind = d.choose(t, 0, Math.round(t * 2) % 3 === 0);
    if (kind === 'normal') continue;
    assert.ok(t - last >= B.specialCooldown);
    last = t;
    counts[kind]++;
    if (kind === 'rush' || kind === 'block') d.encounters++; // Simulate accepted/committed events.
    if (kind === 'moving') assert.ok(t >= B.movingUnlock);
    if (kind === 'rush') assert.ok(t >= B.rushUnlock);
    if (kind === 'block') assert.ok(t >= B.blockUnlock);
    if (kind === 'beam') assert.ok(t >= B.beamUnlock);
    if (kind === 'rotor') assert.ok(t >= B.rotorUnlock);
  }
  assert.ok(
    Object.values(counts).every((n) => n >= 2),
    JSON.stringify(counts),
  );
  assert.ok(Object.values(counts).reduce((a, b) => a + b) > 25, JSON.stringify(counts));
});
test('original music has changing harmony, melody and bass with a repeatable loop', () => {
  const events = Array.from({ length: 256 }, (_, i) => musicNotes(i));
  assert.ok(new Set(events.flat().map((n) => n.midi)).size > 18);
  assert.ok(events.flat().some((n) => n.midi < 40));
  assert.ok(events.flat().every((n) => n.gain > 0 && n.gain < 1 && n.duration > 0));
  for (let i = 0; i < 256; i++) assert.deepEqual(musicNotes(i), musicNotes(i + 256));
});
