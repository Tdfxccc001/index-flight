import * as THREE from 'three';
import type { Flight } from './FlightController';
import { B } from '../config/balance';
export class CameraController {
  camera = new THREE.PerspectiveCamera(57, 1, 0.1, 260);
  portrait = false;
  constructor() {
    this.resize();
  }
  resize() {
    const aspect = innerWidth / innerHeight;
    this.portrait = aspect < 0.8;
    this.camera.aspect = aspect;
    // Portrait prioritizes the current channel; distant arrays remain in view.
    this.camera.fov = this.portrait ? B.cameraPortraitFov : B.cameraDesktopFov;
    this.camera.updateProjectionMatrix();
  }
  update(s: Flight, dt: number, shake = 0) {
    const k = 1 - Math.exp(-dt * 12);
    const back = this.portrait
      ? THREE.MathUtils.clamp(
          (B.cameraPortraitBack * B.cameraPortraitReferenceAspect) / this.camera.aspect,
          B.cameraPortraitMinBack,
          B.cameraPortraitMaxBack,
        )
      : B.cameraDesktopBack;
    const rise = this.portrait ? B.cameraPortraitRise : B.cameraRise;
    const aim = this.portrait ? B.cameraPortraitAimRise : B.cameraAimRise;
    // Match the already-interpolated aircraft position exactly: a second
    // horizontal smoothing pass would let the aircraft drift off screen center.
    this.camera.position.x = s.x * B.cameraFollowX;
    this.camera.position.y = THREE.MathUtils.lerp(
      this.camera.position.y,
      s.y * B.visualHeightScale + rise,
      k,
    );
    this.camera.position.z = back;
    if (shake) this.camera.position.y += Math.sin(performance.now() * 0.07) * shake;
    this.camera.lookAt(s.x * B.cameraFollowX, s.y * B.visualHeightScale + aim, -24);
  }
}
