/** Original 16-bar loop at 100 BPM. No external recordings. */
export const musicStepSeconds = 0.15;
export interface MusicNote {
  midi: number;
  duration: number;
  gain: number;
  type: OscillatorType;
}
export function musicNotes(step: number): MusicNote[] {
  const roots = [48, 45, 53, 55],
    bar = Math.floor(step / 16) % 16,
    beat = step % 16;
  const root = roots[Math.floor(bar / 2) % 4],
    notes: MusicNote[] = [];
  if (beat === 0)
    for (const interval of [0, 7, bar % 4 === 3 ? 10 : 12])
      notes.push({ midi: root + interval, duration: 2.2, gain: 0.08, type: 'sine' });
  if (beat % 4 === 0)
    notes.push({
      midi: root - 12 + (beat === 8 ? 7 : 0),
      duration: 0.4,
      gain: 0.16,
      type: 'triangle',
    });
  const motif = [12, 19, 16, 24, 19, 16, 14, 19];
  if (beat % 2 === 0)
    notes.push({
      midi: root + motif[(Math.floor(beat / 2) + (bar % 2) * 3) % 8] + (bar >= 8 ? 12 : 0),
      duration: 0.22,
      gain: 0.09,
      type: 'sine',
    });
  if (beat === 4 || beat === 12)
    notes.push({ midi: root + 31, duration: 0.04, gain: 0.04, type: 'triangle' });
  return notes;
}
export class FlightMusic {
  nextStep = -1;
  lastTime = -1;
  voices = new Set<OscillatorNode>();
  constructor(
    private context: AudioContext,
    private output: GainNode,
  ) {}
  update(time: number, playing: boolean) {
    if (!playing) {
      this.stop();
      this.lastTime = time;
      return;
    }
    const step = Math.floor((time + 1e-6) / musicStepSeconds);
    if (this.nextStep < 0 || time < this.lastTime || step - this.nextStep > 2) this.nextStep = step;
    this.lastTime = time;
    if (step < this.nextStep) return;
    for (const note of musicNotes(step)) {
      const o = this.context.createOscillator(),
        g = this.context.createGain(),
        start = this.context.currentTime;
      o.type = note.type;
      o.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(note.gain, start + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
      o.connect(g).connect(this.output);
      this.voices.add(o);
      o.onended = () => {
        this.voices.delete(o);
        o.disconnect();
        g.disconnect();
      };
      o.start(start);
      o.stop(start + note.duration + 0.02);
    }
    this.nextStep = step + 1;
  }
  stop() {
    for (const o of this.voices) {
      o.stop();
    }
    this.voices.clear();
    this.nextStep = -1;
  }
}
