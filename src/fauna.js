export function createFauna({ scene, THREE }) {
  const group = new THREE.Group();
  scene.add(group);

  const max = 50;
  const geo = new THREE.ConeGeometry(0.1, 0.3, 3);
  const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const phases = new Float32Array(max);
  const speeds = new Float32Array(max);
  const radii = new Float32Array(max);
  const heights = new Float32Array(max);
  let active = 0;
  let isNight = false;

  function randomize(i) {
    phases[i] = Math.random() * Math.PI * 2;
    speeds[i] = 0.5 + Math.random() * 1.5;
    radii[i] = 5 + Math.random() * 15;
    heights[i] = 2 + Math.random() * 4;
  }

  function setDensity(count) {
    active = Math.max(0, Math.min(max, count|0));
    for (let i = 0; i < active; i++) {
      randomize(i);
      dummy.position.set(
        Math.cos(phases[i]) * radii[i],
        heights[i],
        Math.sin(phases[i]) * radii[i]
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = active;
    mesh.instanceMatrix.needsUpdate = true;
    group.visible = active > 0;
  }

  function update(dt) {
    if (active === 0) return;
    for (let i = 0; i < active; i++) {
      const speed = speeds[i] * (isNight ? 0.3 : 1);
      phases[i] += speed * dt;
      const x = Math.cos(phases[i]) * radii[i];
      const z = Math.sin(phases[i]) * radii[i];
      const amp = isNight ? 0.2 : 0.5;
      const y = heights[i] + Math.sin(phases[i] * 2) * amp;
      dummy.position.set(x, y, z);
      dummy.lookAt(
        Math.cos(phases[i] + Math.PI/2) * radii[i],
        y,
        Math.sin(phases[i] + Math.PI/2) * radii[i]
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function setNight(n){
    isNight = !!n;
  }

  return { group, update, setDensity, setNight };
}
