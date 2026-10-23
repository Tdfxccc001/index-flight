import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MarketAnnotations } from './MarketAnnotations';
import * as THREE from 'three';
import { CameraController } from './CameraController';
import { columnX, type Row } from './Obstacles';
import type { Flight } from './FlightController';
import type { Settings } from '../ui/Settings';
import { B } from '../config/balance';
import { FlightEffects } from './FlightEffects';
import { AlignmentGuide } from './AlignmentGuide';
export class WorldRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  stage = new THREE.Group();
  camera = new CameraController();
  plane = new THREE.Group();
  columns: THREE.InstancedMesh;
  private acrylicMaterial: THREE.MeshPhysicalMaterial;
  private lightColumnMaterial: THREE.MeshStandardMaterial;
  edges: THREE.InstancedMesh;
  specials: THREE.InstancedMesh;
  ribs: THREE.InstancedMesh;
  effects: FlightEffects;
  guide: AlignmentGuide;
  annotations: MarketAnnotations;
  scenery: { mesh: THREE.Mesh; z: number }[] = [];
  dummy = new THREE.Object3D();
  grid: THREE.GridHelper;
  private rails: THREE.MeshBasicMaterial[] = [];
  propeller = new THREE.Group();
  pool = 128;
  private color = new THREE.Color();
  private slowFrames = 0;
  private lastEffects = true;
  pixelRatio = 1;
  constructor(root: HTMLElement) {
    this.scene.add(this.stage);
    this.stage.scale.y = B.visualHeightScale;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x142639);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    const pmrem = new THREE.PMREMGenerator(this.renderer),
      room = new RoomEnvironment();
    const columnEnvironment = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    root.prepend(this.renderer.domElement);
    this.renderer.domElement.id = 'world';
    this.scene.fog = new THREE.FogExp2(0x142639, 0.009);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(225, 20, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 v; void main(){float h=clamp(normalize(v).y*2.5,0.,1.);vec3 c=mix(vec3(.28,.34,.38),vec3(.025,.075,.13),sqrt(h));gl_FragColor=vec4(c,1.);}',
      }),
    );
    this.scene.add(sky);
    this.stage.add(new THREE.HemisphereLight(0xc4e8ff, 0x314660, 2.9));
    const sun = new THREE.DirectionalLight(0xffddab, 3.1);
    sun.position.set(-12, 22, 15);
    this.stage.add(sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ color: 0x172b3b, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.stage.add(ground);
    this.grid = new THREE.GridHelper(400, 100, 0x365468, 0x233e50);
    this.grid.position.y = 0.01;
    this.stage.add(this.grid);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.acrylicMaterial = new THREE.MeshPhysicalMaterial({
      roughness: 0.23,
      metalness: 0.035,
      clearcoat: 0.95,
      clearcoatRoughness: 0.14,
      ior: 1.49,
      reflectivity: 0.45,
      transmission: 0,
      transparent: false,
      opacity: 1,
      envMap: columnEnvironment,
      envMapIntensity: 0.2,
    });
    this.lightColumnMaterial = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.035 });
    this.columns = new THREE.InstancedMesh(
      new RoundedBoxGeometry(1, 1, 1, 2, 0.025),
      this.acrylicMaterial,
      this.pool,
    );
    this.columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.columns.frustumCulled = false;
    this.stage.add(this.columns);
    this.edges = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xe6fffa, transparent: true, opacity: 0.16 }),
      this.pool,
    );
    this.edges.frustumCulled = false;
    this.stage.add(this.edges);
    this.specials = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xffe4b0 }),
      64,
    );
    this.specials.frustumCulled = false;
    this.stage.add(this.specials);
    this.ribs = new THREE.InstancedMesh(
      box,
      new THREE.MeshBasicMaterial({ color: 0xd5fff1, transparent: true, opacity: 0.2 }),
      this.pool * 2,
    );
    this.ribs.frustumCulled = false;
    this.stage.add(this.ribs);
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(1, 18, 260),
        new THREE.MeshStandardMaterial({ color: 0x294155, transparent: true, opacity: 0.57 }),
      );
      wall.position.set(side * 11.5, 9, -100);
      this.stage.add(wall);
      for (const y of [0.18, 3, 8, 15]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.08, 260),
          new THREE.MeshBasicMaterial({ color: 0x72b9c3, transparent: true, opacity: 0.5 }),
        );
        this.rails.push(rail.material);
        rail.position.set(side * 11, y, -100);
        this.stage.add(rail);
      }
      for (let j = 0; j < 14; j++) {
        const tower = new THREE.Mesh(
          new THREE.BoxGeometry(3 + (j % 3), 8 + (j % 5) * 4, 5),
          new THREE.MeshStandardMaterial({ color: 0x20384c }),
        );
        tower.position.set(
          side * (20 + (j % 3) * 9),
          tower.geometry.parameters.height / 2,
          -j * 21,
        );
        this.stage.add(tower);
        this.scenery.push({ mesh: tower, z: -j * 21 });
      }
    }
    const orange = new THREE.MeshStandardMaterial({ color: 0xffb56a, roughness: 0.45 }),
      white = new THREE.MeshStandardMaterial({ color: 0xeef4ed, roughness: 0.6 }),
      dark = new THREE.MeshStandardMaterial({ color: 0x183447, metalness: 0.4, roughness: 0.2 });
    const part = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.plane.add(m);
      return m;
    };
    // Broad engine cowling toward the nose, tapered tail toward the camera.
    const body = part(new THREE.CylinderGeometry(0.28, 0.09, 1.65, 8), orange, 0, 0, 0);
    body.rotation.x = -Math.PI / 2;
    part(new THREE.BoxGeometry(1.75, 0.09, 0.48), white, 0, -0.02, 0.05);
    for (const side of [-1, 1])
      part(new THREE.BoxGeometry(0.16, 0.095, 0.48), orange, side * 0.8, -0.02, 0.05);
    part(new THREE.BoxGeometry(0.8, 0.07, 0.3), orange, 0, 0.06, 0.67);
    part(new THREE.SphereGeometry(0.23, 8, 6), dark, 0, 0.2, -0.15).scale.set(1, 0.75, 1.6);
    part(new THREE.BoxGeometry(0.08, 0.48, 0.4), orange, 0, 0.2, 0.65);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.06), dark);
    this.propeller.add(hub);
    this.propeller.add(
      new THREE.Mesh(
        new THREE.CircleGeometry(0.46, 16),
        new THREE.MeshBasicMaterial({
          color: 0xc8eff2,
          transparent: true,
          opacity: 0.09,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      ),
    );
    this.propeller.position.z = -1;
    this.plane.add(this.propeller);
    this.stage.add(this.plane);
    this.effects = new FlightEffects(this.stage);
    this.guide = new AlignmentGuide(this.stage);
    this.annotations = new MarketAnnotations(this.stage);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    this.pixelRatio = Math.min(devicePixelRatio, innerWidth < 700 ? 1.6 : 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.resize();
  }
  render(
    s: Flight,
    rows: Row[],
    distance: number,
    dt: number,
    settings: Settings,
    crashed = false,
    playing = true,
    time = 0,
    idle = false,
  ) {
    this.columns.material = settings.effects ? this.acrylicMaterial : this.lightColumnMaterial;
    if (settings.effects && !this.lastEffects) this.resize();
    this.lastEffects = settings.effects;
    if (!settings.effects && this.pixelRatio > 1) {
      this.pixelRatio = 1;
      this.renderer.setPixelRatio(1);
    }
    let count = 0,
      marks = 0;
    for (const row of rows)
      for (const c of row.columns) {
        if (count >= this.pool) break;
        const x = columnX(row, c);
        this.dummy.position.set(x, c.height / 2, row.z);
        this.dummy.scale.set(c.width, c.height, B.thickness);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.columns.setMatrixAt(count, this.dummy.matrix);
        const up = settings.reverse ? 0xc75767 : 0x219e83,
          down = settings.reverse ? 0x219e83 : 0xc75767;
        this.color.setHex(c.direction === 'up' ? up : c.direction === 'down' ? down : 0x8a9faf);
        this.columns.setColorAt(count, this.color);
        this.dummy.position.y = c.height + 0.025;
        this.dummy.scale.set(c.width + 0.035, 0.055, B.thickness + 0.035);
        this.dummy.updateMatrix();
        this.edges.setMatrixAt(count, this.dummy.matrix);
        for (let side = 0; side < 2; side++) {
          this.dummy.position.set(
            x + (side === 0 ? -1 : 1) * (c.width / 2 - 0.025),
            c.height / 2,
            row.z + B.thickness / 2 + 0.012,
          );
          this.dummy.scale.set(0.022, c.height, 0.022);
          this.dummy.updateMatrix();
          this.ribs.setMatrixAt(count * 2 + side, this.dummy.matrix);
        }
        count++;
        if (row.kind === 'rush' || row.kind === 'block')
          for (let j = 0; j < 3; j++) {
            this.dummy.position.set(x, 0.45 + j * 0.48, row.z + 1.065);
            this.dummy.scale.set(c.width * 0.9, 0.1, 0.04);
            this.dummy.updateMatrix();
            this.specials.setMatrixAt(marks++, this.dummy.matrix);
          }
      }
    this.columns.count = this.edges.count = count;
    this.ribs.count = count * 2;
    this.ribs.instanceMatrix.needsUpdate = true;
    this.specials.count = marks;
    this.columns.instanceMatrix.needsUpdate =
      this.edges.instanceMatrix.needsUpdate =
      this.specials.instanceMatrix.needsUpdate =
        true;
    if (this.columns.instanceColor) this.columns.instanceColor.needsUpdate = true;
    this.plane.position.set(s.x, s.y, 0);
    this.plane.rotation.z = -s.vx * 0.035;
    this.plane.rotation.x = s.vy * 0.025;
    this.plane.rotation.y = 0;
    if (s.stall > 0) this.plane.rotation.z += Math.sin(time * 45) * 0.04;
    if (crashed) {
      this.plane.rotation.z += 0.7;
      this.plane.rotation.x = 0.4;
    }
    if (playing) this.propeller.rotation.z = time * 45;
    else if (idle) this.propeller.rotation.z += dt * 45;
    const portrait = this.camera.portrait;
    const gridMaterial = this.grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = portrait ? 0.25 : 1;
    this.rails.forEach((material) => (material.opacity = portrait ? 0.16 : 0.5));
    this.grid.position.z = distance % 4;
    for (const item of this.scenery) item.mesh.position.z = item.z + (distance % 21);
    this.effects.update(s, distance, playing ? dt : 0, settings.effects, crashed, dt, portrait);
    this.plane.visible = !crashed;
    this.camera.update(s, dt, settings.shake && s.stall > 0 ? 0.018 : 0);
    this.guide.update(s, rows, time, playing && settings.showGuides, portrait);
    this.annotations.update(rows, settings.showChanges, settings.reverse, portrait);
    this.renderer.render(this.scene, this.camera.camera);
    if (dt > 0.027) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 100 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.2);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.slowFrames = 0;
    }
  }
}
