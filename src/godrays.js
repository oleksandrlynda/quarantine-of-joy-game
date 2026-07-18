// GodRaysEffect: simple wrapper around three.js GodRaysPass
// Adds volumetric sun shafts ("god rays") for bright sunny weather
import { EffectComposer } from 'https://unpkg.com/three@0.159.0/examples/jsm/postprocessing/EffectComposer.js?module';
import { RenderPass } from 'https://unpkg.com/three@0.159.0/examples/jsm/postprocessing/RenderPass.js?module';
import { GodRaysPass } from 'https://unpkg.com/three@0.159.0/examples/jsm/postprocessing/GodRaysPass.js?module';

export class GodRaysEffect {
  constructor({ THREE, renderer, scene, camera, light }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    // Create a small sphere to mark the sun position
    const sunGeo = new THREE.SphereGeometry(4, 16, 8);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
    this.sun = new THREE.Mesh(sunGeo, sunMat);
    if (light && light.position) {
      this.sun.position.copy(light.position);
    } else {
      this.sun.position.set(20, 30, 10);
    }
    this.scene.add(this.sun);

    // Post-processing setup
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.godrays = new GodRaysPass(this.sun, this.camera, {
      resolution: 256,
      density: 0.96,
      decay: 0.93,
      weight: 0.4,
      exposure: 0.6,
      samples: 60,
      clampMax: 1.0
    });
    this.composer.addPass(this.godrays);
  }

  render() {
    this.composer.render();
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    if (this.godrays.setSize) this.godrays.setSize(w, h);
  }

  dispose() {
    this.scene.remove(this.sun);
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.composer.dispose();
  }
}

