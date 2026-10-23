export interface Settings {
  reverse: boolean;
  invertKeyboard: boolean;
  invertTouch: boolean;
  mouseMove: boolean;
  showGuides: boolean;
  showChanges: boolean;
  music: number;
  sound: number;
  effects: boolean;
  shake: boolean;
  sensitivity: number;
}
export const defaults: Settings = {
  reverse: false,
  invertKeyboard: false,
  invertTouch: false,
  mouseMove: false,
  showGuides: true,
  showChanges: true,
  music: 0,
  sound: 0.3,
  effects: true,
  shake: false,
  sensitivity: 1,
};
export function readSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem('index-flight-settings') || '{}');
    return {
      reverse: typeof v.reverse === 'boolean' ? v.reverse : false,
      invertKeyboard: v.invertKeyboard === true,
      invertTouch: v.invertTouch === true,
      mouseMove: v.mouseMove === true,
      showGuides: typeof v.showGuides === 'boolean' ? v.showGuides : true,
      showChanges: typeof v.showChanges === 'boolean' ? v.showChanges : true,
      music: valid(v.music, 0, 1, 0),
      sound: valid(v.sound, 0, 1, 0.3),
      effects: typeof v.effects === 'boolean' ? v.effects : true,
      shake: typeof v.shake === 'boolean' ? v.shake : false,
      sensitivity: valid(v.sensitivity, 0.5, 1.7, 1),
    };
  } catch {
    return { ...defaults };
  }
}
function valid(x: unknown, a: number, b: number, f: number) {
  return typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b ? x : f;
}
export function saveSettings(s: Settings) {
  try {
    localStorage.setItem('index-flight-settings', JSON.stringify(s));
  } catch {
    /* Private browsing may prohibit storage. */
  }
}
export function bestScore() {
  try {
    return valid(Number(localStorage.getItem('index-flight-best')), 0, 1e12, 0);
  } catch {
    return 0;
  }
}
export function saveBest(n: number) {
  try {
    localStorage.setItem('index-flight-best', String(n));
  } catch {
    /* Gameplay remains available. */
  }
}
