import { FlightMusic } from './FlightMusic';
/** Synthesized locally, no external media or autoplay. */
export class AudioManager {
  score: FlightMusic | null = null;
  context: AudioContext | null = null;
  wind: GainNode | null = null;
  music: GainNode | null = null;
  engine: OscillatorNode | null = null;
  engineGain: GainNode | null = null;
  windFilter: BiquadFilterNode | null = null;
  unlock() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    try {
      const c = (this.context = new AudioContext());
      const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.15;
      const src = c.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      this.windFilter = filter;
      this.wind = c.createGain();
      this.wind.gain.value = 0;
      src.connect(filter).connect(this.wind).connect(c.destination);
      src.start();
      this.engine = c.createOscillator();
      this.engine.type = 'triangle';
      this.engine.frequency.value = 64;
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      this.engine.connect(this.engineGain).connect(c.destination);
      this.engine.start();
      this.music = c.createGain();
      this.music.gain.value = 0;
      this.music.connect(c.destination);
      this.score = new FlightMusic(c, this.music);
    } catch {
      /* Audio is optional. */
    }
  }
  levels(sound: number, music: number, playing: boolean, speed = 14, climb = 0, time = 0) {
    const c = this.context;
    if (!c) return;
    if (this.wind)
      this.wind.gain.setTargetAtTime(playing ? sound * (0.3 + speed / 70) : 0, c.currentTime, 0.1);
    if (this.windFilter)
      this.windFilter.frequency.setTargetAtTime(
        300 + speed * 18 + Math.abs(climb) * 35,
        c.currentTime,
        0.15,
      );
    if (this.engine)
      this.engine.frequency.setTargetAtTime(55 + speed * 1.3 + climb * 0.8, c.currentTime, 0.1);
    if (this.engineGain)
      this.engineGain.gain.setTargetAtTime(playing ? sound * 0.035 : 0, c.currentTime, 0.1);
    if (this.music)
      this.music.gain.setTargetAtTime(playing ? music * 0.3 : 0, c.currentTime, 0.025);
    this.score?.update(time, playing && music > 0);
  }
  tone(type: 'reward' | 'crash' | 'stall', volume: number, combo = 1) {
    const c = this.context;
    if (!c || !volume) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type === 'crash' ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(
      type === 'reward'
        ? 440 * Math.pow(2, Math.min(4, combo - 1) / 3)
        : type === 'stall'
          ? 210
          : 100,
      c.currentTime,
    );
    o.frequency.exponentialRampToValueAtTime(type === 'reward' ? 990 : 40, c.currentTime + 0.22);
    g.gain.setValueAtTime(volume * 0.16, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.32);
    if (type === 'reward' && combo >= 2) {
      const overtone = c.createOscillator(),
        gain = c.createGain();
      overtone.frequency.value = 880 * Math.pow(2, (combo - 2) / 4);
      gain.gain.setValueAtTime(volume * 0.045, c.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.32);
      overtone.connect(gain).connect(c.destination);
      overtone.start(c.currentTime + 0.06);
      overtone.stop(c.currentTime + 0.34);
    }
  }
}
