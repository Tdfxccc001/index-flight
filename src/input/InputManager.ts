import { B } from '../config/balance';
import { shapeTouchDrag } from './TouchControl';
import type { Control } from '../game/FlightController';
export class InputManager {
  keys = new Set<string>();
  pointer: number | null = null;
  pointerType = 'mouse';
  origin = { x: 0, y: 0 };
  drag: Control = { x: 0, y: 0 };
  constructor(
    private pad: HTMLElement,
    private knob: HTMLElement,
    private active: () => boolean,
    private pause: () => void,
    private begin: () => void = () => {},
    private mouseMove: () => boolean = () => false,
    private flying: () => boolean = active,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) this.pause();
        return;
      }
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      if ((e.target as HTMLElement).closest('button') && !this.active()) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
        e.preventDefault();
      const key = e.key.toLowerCase();
      if (
        [' ', 'w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)
      )
        this.begin();
      if (this.active()) this.keys.add(key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.reset();
      if (this.active()) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.reset();
        if (this.active()) this.pause();
      }
    });
    document.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button,input,select,textarea,dialog,#panel')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.mouseMove() && e.pointerType === 'mouse') {
        this.origin = { x: e.clientX, y: e.clientY };
        this.drag = { x: 0, y: 0 };
        this.pointerType = 'mouse';
        this.begin();
        return;
      }
      if (this.mouseMove() && !this.flying()) return;
      this.begin();
      if (
        !this.active() ||
        this.pointer !== null ||
        (e.target as HTMLElement).closest('button,input,select,dialog')
      )
        return;
      this.pointer = e.pointerId;
      this.pointerType = e.pointerType;
      this.origin = { x: e.clientX, y: e.clientY };
      this.pad.style.left = `${e.clientX - 64}px`;
      this.pad.style.top = `${e.clientY - 64}px`;
      this.pad.classList.add('dragging');
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && this.mouseMove() && this.flying() && this.pointer === null) {
        // Relative to the start click (or viewport centre for a space-key start).
        const radius = Math.max(80, Math.min(innerWidth, innerHeight) * 0.22);
        const dx = (e.clientX - this.origin.x) / radius;
        const dy = (this.origin.y - e.clientY) / radius;
        const length = Math.max(1, Math.hypot(dx, dy));
        this.drag = { x: dx / length, y: dy / length };
        return;
      }
      if (e.pointerId !== this.pointer) return;
      const radius = this.pointerType === 'touch' ? B.touchRadius : 52;
      const dx = (e.clientX - this.origin.x) / radius,
        dy = (this.origin.y - e.clientY) / radius;
      const len = Math.max(1, Math.hypot(dx, dy));
      this.drag =
        this.pointerType === 'touch' ? shapeTouchDrag(dx, dy) : { x: dx / len, y: dy / len };
      this.knob.style.transform = `translate(${(dx / len) * 40}px,${(-dy / len) * 40}px)`;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      window.addEventListener(type, (e) => {
        if ((e as PointerEvent).pointerId === this.pointer) this.resetPointer();
      });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  resetPointer() {
    this.pointer = null;
    this.drag = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.pad.classList.remove('dragging');
    this.pad.style.left = '';
    this.pad.style.top = '';
  }
  reset() {
    this.keys.clear();
    this.resetPointer();
    this.origin = { x: innerWidth / 2, y: innerHeight / 2 };
  }
  read(sensitivity = 1, invertKeyboard = false, invertTouch = false): Control {
    let x =
      Number(this.keys.has('d') || this.keys.has('arrowright')) -
      Number(this.keys.has('a') || this.keys.has('arrowleft'));
    let y =
      Number(this.keys.has('w') || this.keys.has('arrowup')) -
      Number(this.keys.has('s') || this.keys.has('arrowdown'));
    const keyboard = !!(x || y);
    if (!keyboard) {
      x = this.drag.x * sensitivity;
      y = this.drag.y * sensitivity;
    }
    if (keyboard ? invertKeyboard : invertTouch) y = -y;
    const n = Math.max(1, Math.hypot(x, y));
    return { x: x / n, y: y / n };
  }
}
