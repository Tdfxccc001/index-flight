import { findPath } from './SpawnPlanner';
import type { Flight, Control } from './FlightController';
import type { Row } from './Obstacles';
self.onmessage = (
  event: MessageEvent<{ id: number; flight: Flight; rows: Row[]; time: number; held: Control }>,
) => {
  const { id, flight, rows, time, held } = event.data;
  self.postMessage({ id, ...findPath(flight, rows, time, held) });
};
