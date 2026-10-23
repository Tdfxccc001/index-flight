import * as THREE from 'three';
import { B } from '../config/balance';
import type { Flight } from './FlightController';
import type { Row } from './Obstacles';
import { clearanceAt, type Clearance } from './Clearance';
export class AlignmentGuide {
  lines: THREE.LineSegments;
  result: Clearance | null = null;
  private data = new Float32Array(16 * 6);
  constructor(stage: THREE.Group) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.data, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x9deedc,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    stage.add(this.lines);
  }
  update(s: Flight, rows: Row[], time: number, active: boolean, compact = false) {
    const row = rows
      .filter((r) => (r.kind === 'normal' || r.kind === 'moving') && r.z < -3)
      .sort((a, b) => b.z - a.z)[0];
    this.lines.visible = active && !!row;
    (this.lines.material as THREE.LineBasicMaterial).opacity = compact ? 0.45 : 0.7;
    if (!this.lines.visible || !row) {
      this.result = null;
      return;
    }
    const result = (this.result = clearanceAt(s, row, time));
    const near = result.safe && Math.min(result.left, result.right, result.top) < B.guideNearMargin;
    const color = !result.safe ? 0xffaf76 : near ? 0xffdc95 : 0xa2f0df;
    (this.lines.material as THREE.LineBasicMaterial).color.setHex(color);
    const z = row.z + B.thickness / 2 + 0.06;
    let n = 0;
    const segment = (a: number[], b: number[]) => {
      this.data.set([...a, ...b], n++ * 6);
    };
    for (const box of compact ? [B.wing] : [B.body, B.wing]) {
      const l = s.x - box.x,
        r = s.x + box.x,
        b = s.y - box.y,
        t = s.y + box.y;
      segment([l, b, z], [r, b, z]);
      segment([r, b, z], [r, t, z]);
      segment([r, t, z], [l, t, z]);
      segment([l, t, z], [l, b, z]);
    }
    // Thin wing projection rails tie the aircraft directly to the distant frame.
    if (!compact)
      for (const side of [-1, 1])
        segment([s.x + side * B.wing.x, s.y, -0.8], [s.x + side * B.wing.x, s.y, z]);
    const opening = result.openings.find((o) => s.x > o.left && s.x < o.right);
    if (opening) {
      segment([opening.left, s.y - 0.35, z], [opening.right, s.y - 0.35, z]);
      for (const x of [opening.left, opening.right])
        segment([x, s.y - 0.45, z], [x, s.y - 0.25, z]);
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
