export function createWave72Visuals({ THREE, scene, hemi, dir, skyMat }) {
  let active = false;
  let group = null;
  let snapshot = null;
  let locatorRing = null;
  let wardenFill = null;
  let searchLight = null;
  let searchTarget = null;
  let core = null;
  let halo = null;
  let locatorAge = Infinity;
  let finalSearchlight = false;
  let completed = false;

  function start() {
    if (active) return;
    active = true;
    completed = false;
    finalSearchlight = false;
    locatorAge = Infinity;
    snapshot = {
      hemiIntensity: hemi.intensity,
      dirIntensity: dir.intensity,
      fogColor: scene.fog?.color?.clone?.(),
      fogNear: scene.fog?.near,
      fogFar: scene.fog?.far,
      skyTop: skyMat?.uniforms?.top?.value?.clone?.(),
      skyBottom: skyMat?.uniforms?.bottom?.value?.clone?.()
    };

    group = new THREE.Group();
    group.name = 'wave72LastLight';

    // The blackout uses almost no global light, so the centre needs both real
    // illumination and unlit geometry. The latter keeps the landmark readable
    // even on environment assets that do not react to PointLight.
    const overheadLight = new THREE.PointLight(0xffe7a0, 18, 22, 2);
    overheadLight.position.set(0, 5, 0);
    overheadLight.castShadow = false;
    group.add(overheadLight);

    const groundFill = new THREE.PointLight(0xffc85a, 5, 12, 2);
    groundFill.position.set(0, 1.4, 0);
    groundFill.castShadow = false;
    group.add(groundFill);

    const innerPoolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc94f,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4
    });
    const innerPool = new THREE.Mesh(new THREE.CircleGeometry(5, 48), innerPoolMaterial);
    innerPool.rotation.x = -Math.PI / 2;
    innerPool.position.y = 0.07;
    innerPool.renderOrder = 2;
    group.add(innerPool);

    const outerPoolMaterial = new THREE.MeshBasicMaterial({
      color: 0xffdc79,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -3
    });
    const outerPool = new THREE.Mesh(new THREE.RingGeometry(5, 10, 48), outerPoolMaterial);
    outerPool.rotation.x = -Math.PI / 2;
    outerPool.position.y = 0.06;
    outerPool.renderOrder = 1;
    group.add(outerPool);

    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffe6a0,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 32, 1, true), beamMaterial);
    beam.position.set(0, 2.5, 0);
    group.add(beam);

    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
    core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), coreMaterial);
    core.name = 'last-light-core';
    core.position.set(0, 5, 0);
    group.add(core);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcf58,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), haloMaterial);
    halo.name = 'last-light-halo';
    halo.position.set(0, 5, 0);
    group.add(halo);

    const ringSpecs = [
      { radius: 5, color: 0xfff0a0, opacity: 0.82, thickness: 0.11 },
      { radius: 10, color: 0x65d9d0, opacity: 0.34, thickness: 0.08 }
    ];
    for (const spec of ringSpecs) {
      const material = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.thickness, 6, 64), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.09;
      group.add(ring);
    }

    const locatorMaterial = new THREE.MeshBasicMaterial({
      color: 0x42e6dc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    locatorRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, .08, 6, 48), locatorMaterial);
    locatorRing.name = 'warden-locator-pulse';
    locatorRing.rotation.x = Math.PI / 2;
    locatorRing.position.y = .16;
    locatorRing.visible = false;
    group.add(locatorRing);

    // Keep the carrier readable throughout the encounter, not only during the
    // final searchlight phase. This follows just below the airborne Warden and
    // catches its underside without illuminating a large part of the arena.
    wardenFill = new THREE.PointLight(0x8ffff6, 0, 26, 1.55);
    wardenFill.name = 'warden-tracking-fill';
    wardenFill.castShadow = false;
    group.add(wardenFill);

    searchTarget = new THREE.Object3D();
    searchTarget.name = 'warden-searchlight-target';
    group.add(searchTarget);
    searchLight = new THREE.SpotLight(0x75fff4, 0, 42, Math.PI / 9, .42, 1.4);
    searchLight.name = 'warden-final-searchlight';
    searchLight.position.set(0, 6.4, 0);
    searchLight.target = searchTarget;
    searchLight.castShadow = false;
    group.add(searchLight);
    scene.add(group);
    update();
  }

  function locatorPulse(position) {
    if (!active || !locatorRing || !Array.isArray(position)) return;
    locatorRing.position.set(position[0], .16, position[2]);
    locatorRing.scale.setScalar(1);
    locatorRing.material.opacity = .92;
    locatorRing.visible = true;
    locatorAge = 0;
  }

  function setFinalSearchlight(enabled = true) {
    finalSearchlight = !!enabled;
    if (searchLight && !finalSearchlight) searchLight.intensity = 0;
  }

  function complete() {
    if (!active) return;
    completed = true;
    finalSearchlight = false;
    if (searchLight) searchLight.intensity = 0;
    if (core?.material?.color?.setHex) core.material.color.setHex(0xc7ff73);
    if (halo?.material?.color?.setHex) halo.material.color.setHex(0x8dff6a);
    update();
  }

  function update({ wardenPosition = null, dt = 1 / 60 } = {}) {
    if (!active) return;
    if (completed) {
      hemi.intensity = .34;
      dir.intensity = .28;
      if (scene.fog) {
        scene.fog.color.setHex(0x233b35);
        scene.fog.near = 18;
        scene.fog.far = 96;
      }
      skyMat?.uniforms?.top?.value?.setHex?.(0x162d2d);
      skyMat?.uniforms?.bottom?.value?.setHex?.(0x48635a);
      return;
    }
    hemi.intensity = 0.035;
    dir.intensity = 0.045;
    if (scene.fog) {
      scene.fog.color.setHex(0x02100e);
      scene.fog.near = 8;
      scene.fog.far = 52;
    }
    skyMat?.uniforms?.top?.value?.setHex?.(0x010707);
    skyMat?.uniforms?.bottom?.value?.setHex?.(0x03100d);

    if (locatorRing?.visible) {
      locatorAge += Math.max(0, dt);
      const progress = Math.min(1, locatorAge / 1.35);
      locatorRing.scale.setScalar(1 + progress * 7.5);
      locatorRing.material.opacity = (1 - progress) * .92;
      if (progress >= 1) locatorRing.visible = false;
    }
    const hasWarden = !!wardenPosition;
    if (wardenFill) {
      wardenFill.intensity = hasWarden ? 28 : 0;
      if (hasWarden) {
        wardenFill.position.set(
          wardenPosition.x,
          Math.max(1.5, (wardenPosition.y || 1.5) - 2.2),
          wardenPosition.z
        );
      }
    }
    if (searchLight) {
      const tracking = finalSearchlight && hasWarden;
      searchLight.intensity = tracking ? 42 : 0;
      if (tracking) searchTarget.position.set(wardenPosition.x, Math.max(.5, wardenPosition.y || .5), wardenPosition.z);
    }
  }

  function stop() {
    if (!active) return;
    active = false;
    if (snapshot) {
      hemi.intensity = snapshot.hemiIntensity;
      dir.intensity = snapshot.dirIntensity;
      if (scene.fog) {
        if (snapshot.fogColor) scene.fog.color.copy(snapshot.fogColor);
        scene.fog.near = snapshot.fogNear;
        scene.fog.far = snapshot.fogFar;
      }
      if (snapshot.skyTop) skyMat?.uniforms?.top?.value?.copy?.(snapshot.skyTop);
      if (snapshot.skyBottom) skyMat?.uniforms?.bottom?.value?.copy?.(snapshot.skyBottom);
    }
    if (group) {
      scene.remove(group);
      group.traverse?.(node => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(material => material?.dispose?.());
        else node.material?.dispose?.();
      });
    }
    group = null;
    snapshot = null;
    locatorRing = null;
    wardenFill = null;
    searchLight = null;
    searchTarget = null;
    core = null;
    halo = null;
    locatorAge = Infinity;
    finalSearchlight = false;
    completed = false;
  }

  return {
    start,
    locatorPulse,
    setFinalSearchlight,
    complete,
    update,
    stop,
    get active() { return active; },
    get diagnostics() {
      return {
        active,
        completed,
        finalSearchlight,
        hemiIntensity: hemi.intensity,
        dirIntensity: dir.intensity,
        fog: scene.fog ? { color: scene.fog.color.getHex?.(), near: scene.fog.near, far: scene.fog.far } : null,
        skyTop: skyMat?.uniforms?.top?.value?.getHex?.(),
        skyBottom: skyMat?.uniforms?.bottom?.value?.getHex?.()
      };
    }
  };
}
