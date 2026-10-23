/** Opt-in, bounded development diagnostics: open the dev build with ?perf=1. */
export class PerformanceDiagnostics {
  readonly events: {
    type: string;
    at: number;
    time: number;
    durationMs?: number;
    detail?: number;
  }[] = [];
  waitMs = 0;
  private waitingAt: number | undefined;
  constructor() {
    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          this.record('longtask', -1, entry.duration, undefined, entry.startTime);
      }).observe({ type: 'longtask' });
    }
  }
  record(type: string, time: number, durationMs?: number, detail?: number, at = performance.now()) {
    if (this.events.length === 4096) this.events.splice(0, 1024);
    this.events.push({ type, at, time, durationMs, detail });
  }
  wait(time: number) {
    if (this.waitingAt === undefined) {
      this.waitingAt = performance.now();
      this.record('wait-start', time);
    }
  }
  endWait(time: number) {
    if (this.waitingAt === undefined) return;
    const duration = performance.now() - this.waitingAt;
    this.waitMs += duration;
    this.record('wait-end', time, duration);
    this.waitingAt = undefined;
  }
}
