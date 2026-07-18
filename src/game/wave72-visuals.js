export function createWave72Visuals({ THREE, scene, hemi, dir, skyMat }) {
  let active = false;
  let group = null;
  let snapshot = null;

  function start() {
    if (active) return;
    active = true;
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
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), coreMaterial);
    core.position.set(0, 5, 0);
    group.add(core);

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcf58,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), haloMaterial);
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
    scene.add(group);
  }

  function update() {
    if (!active) return;
    hemi.intensity = 0.012;
    dir.intensity = 0.02;
    if (scene.fog) {
      scene.fog.color.setHex(0x010706);
      scene.fog.near = 5;
      scene.fog.far = 42;
    }
    skyMat?.uniforms?.top?.value?.setHex?.(0x000203);
    skyMat?.uniforms?.bottom?.value?.setHex?.(0x010605);
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
  }

  return {
    start,
    update,
    stop,
    get active() { return active; }
  };
}
