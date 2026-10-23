import * as THREE from 'three';
import type { Flight } from './FlightController';
/** Small fixed buffers; effects never take part in collision or generation. */
export class FlightEffects {
  markers: THREE.InstancedMesh;
  streaks: THREE.LineSegments;
  trail: THREE.LineSegments;
  debris: THREE.InstancedMesh;
  shadow: THREE.Mesh;
  private dummy = new THREE.Object3D();
  private streakData = new Float32Array(48 * 6);
  private trailData = new Float32Array(28 * 2 * 6);
  private history: { x: number; y: number; distance: number }[] = [];
  private particles: { x: number; y: number; z: number; vx: number; vy: number; vz: number }[] = [];
  private impactAge = 99;
  private previousCrash = false;
  constructor(private stage: THREE.Group) {
    const cube = new THREE.BoxGeometry(1, 1, 1);
    this.markers = new THREE.InstancedMesh(
      cube,
      new THREE.MeshBasicMaterial({ color: 0x99e2dc, transparent: true, opacity: 0.48 }),
      144,
    );
    this.markers.frustumCulled = false;
    stage.add(this.markers);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute(
      'position',
      new THREE.BufferAttribute(this.streakData, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.streaks = new THREE.LineSegments(
      sg,
      new THREE.LineBasicMaterial({
        color: 0xc2e5ed,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    );
    this.streaks.frustumCulled = false;
    stage.add(this.streaks);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute(
      'position',
      new THREE.BufferAttribute(this.trailData, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.trail = new THREE.LineSegments(
      tg,
      new THREE.LineBasicMaterial({
        color: 0xc6f5ed,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    this.trail.frustumCulled = false;
    stage.add(this.trail);
    this.debris = new THREE.InstancedMesh(
      cube,
      new THREE.MeshStandardMaterial({
        color: 0xffb974,
        emissive: 0x7c3319,
        emissiveIntensity: 0.6,
      }),
      24,
    );
    this.debris.frustumCulled = false;
    this.debris.count = 0;
    stage.add(this.debris);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({
        color: 0x020c14,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.set(1.05, 0.58, 1);
    stage.add(this.shadow);
  }
  reset() {
    this.history = [];
    this.impactAge = 99;
    this.previousCrash = false;
    this.debris.count = 0;
  }
  private impact(s: Flight) {
    this.impactAge = 0;
    this.particles = Array.from({ length: 24 }, (_, i) => {
      const angle = i * 2.39996;
      return {
        x: s.x,
        y: s.y,
        z: 0,
        vx: Math.sin(angle) * (1.5 + (i % 4)),
        vy: 1.5 + (i % 5) * 0.45,
        vz: Math.cos(angle) * 2 + 2,
      };
    });
  }
  update(
    s: Flight,
    distance: number,
    dt: number,
    full: boolean,
    crashed: boolean,
    visualDt: number,
    portrait = false,
  ) {
    if (crashed && !this.previousCrash) this.impact(s);
    this.previousCrash = crashed;
    let index = 0;
    for (let i = 0; i < (portrait ? 24 : 36); i++)
      for (const side of [-1, 1]) {
        const pitch = portrait ? 6 : 4;
        const z = 18 - i * pitch + (distance % pitch);
        this.dummy.position.set(side * 10.85, 0.07, z);
        this.dummy.scale.set(0.1, 0.08, 1.1);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.markers.setMatrixAt(index++, this.dummy.matrix);
        if (portrait) continue;
        this.dummy.position.set(side * 11.03, 2.8, z);
        this.dummy.scale.set(0.045, 5.6, 0.06);
        this.dummy.updateMatrix();
        this.markers.setMatrixAt(index++, this.dummy.matrix);
      }
    this.markers.count = index;
    (this.markers.material as THREE.MeshBasicMaterial).opacity = portrait ? 0.22 : 0.48;
    (this.trail.material as THREE.LineBasicMaterial).opacity = portrait ? 0.1 : 0.28;
    this.markers.instanceMatrix.needsUpdate = true;
    this.streaks.visible = full && !crashed && !portrait;
    this.trail.visible = full && !crashed;
    for (let i = 0; i < 48; i++) {
      const side = i % 2 === 0 ? -1 : 1,
        x = side * (9.8 + (i % 3) * 0.25),
        y = 0.8 + ((i * 1.73) % 12),
        z = 20 - ((((i * 7.97 - distance * 1.7) % 145) + 145) % 145);
      this.streakData.set([x, y, z, x, y, z - 1.4 - (i % 4) * 0.5], i * 6);
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
    if (dt > 0 && (this.history.length === 0 || distance - this.history[0].distance > 0.25))
      this.history.unshift({ x: s.x, y: s.y, distance });
    this.history.length = Math.min(this.history.length, portrait ? 9 : 29);
    let segment = 0;
    for (let i = 0; i < this.history.length - 1; i++)
      for (const side of [-1, 1]) {
        const a = this.history[i],
          b = this.history[i + 1];
        this.trailData.set(
          [
            a.x + side * 0.82,
            a.y - 0.03,
            distance - a.distance + 0.25,
            b.x + side * 0.82,
            b.y - 0.03,
            distance - b.distance + 0.25,
          ],
          segment++ * 6,
        );
      }
    this.trail.geometry.setDrawRange(0, segment * 2);
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.shadow.position.set(s.x, 0.035, 0);
    this.shadow.visible = !crashed;
    if (crashed && this.impactAge < 1) {
      this.impactAge += Math.min(0.05, visualDt);
      this.debris.count = full ? 24 : 8;
      this.particles.forEach((p, i) => {
        const t = this.impactAge;
        this.dummy.position.set(
          p.x + p.vx * t,
          Math.max(0.05, p.y + p.vy * t - 5 * t * t),
          p.z + p.vz * t,
        );
        this.dummy.rotation.set(t * ((i % 4) + 1), t * 3, t * (i % 3));
        this.dummy.scale.setScalar(Math.max(0.01, 0.12 * (1 - t)));
        this.dummy.updateMatrix();
        this.debris.setMatrixAt(i, this.dummy.matrix);
      });
      this.debris.instanceMatrix.needsUpdate = true;
    } else if (!crashed) this.debris.count = 0;
  }
}
