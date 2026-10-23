import type { Flight, Control } from './FlightController';
import type { Row } from './Obstacles';
import type { PlanResult } from './SpawnPlanner';
export class PlannerClient {
  private worker: Worker;
  private serial = 0;
  private pending = new Map<number, (result: PlanResult) => void>();
  constructor() {
    this.worker = this.createWorker();
  }
  private createWorker() {
    const worker = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (this.worker !== worker) return;
      const { id, ...result } = e.data;
      this.pending.get(id)?.(result);
      this.pending.delete(id);
    };
    worker.onerror = () => {
      if (this.worker !== worker) return;
      for (const resolve of this.pending.values())
        resolve({ safe: false, path: [], visited: 0, durationMs: 0 });
      this.pending.clear();
    };
    return worker;
  }
  /** Search is synchronous inside the worker, so a message cannot interrupt it. */
  cancel() {
    if (!this.pending.size) return;
    this.worker.terminate();
    for (const resolve of this.pending.values())
      resolve({ safe: false, path: [], visited: 0, durationMs: 0 });
    this.pending.clear();
    this.worker = this.createWorker();
  }
  check(flight: Flight, rows: Row[], time: number, held: Control): Promise<PlanResult> {
    const id = ++this.serial;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, flight, rows, time, held });
    });
  }
}
