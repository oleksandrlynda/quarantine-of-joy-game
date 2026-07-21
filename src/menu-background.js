import { createPropagandaPelican } from './assets/propaganda-pelican.js';

export const MENU_BACKGROUND_ASSET_IDS = Object.freeze([
  'cornershop',
  'clinic',
  'roadblock'
]);

export const MENU_BACKGROUND_ACTOR_IDS = Object.freeze(['gruntbot', 'winged_drone']);

const ENVIRONMENT_PLACEMENTS = Object.freeze([
  { id: 'clinic', position: [17.1, 0, -12.7], scale: .9, rotationY: -.13 },
  { id: 'cornershop', position: [8.4, 0, -4.2], scale: .98, rotationY: .1 },
  { id: 'roadblock', position: [12.9, 0, 3.5], scale: .56, rotationY: -.34 }
]);

export const MENU_BACKGROUND_ACTOR_PLACEMENTS = Object.freeze([
  { id: 'gruntbot', position: [16.5, 0, 1.2], scale: .46, rotationY: 0, motion: { type: 'patrol', axis: 'z', range: 1.8, speed: .51, phase: .4 } },
  {
    id: 'propaganda_pelican',
    position: [12.1, 5, -2.2],
    scale: .5,
    rotationY: 0,
    motion: {
      type: 'fly', phase: .2,
      route: [
        [10.6, 5.1, -2.7],
        [15.8, 6.0, -1.2],
        [18.2, 5.6, -5.0],
        [15.3, 6.7, -8.5],
        [10.4, 6.1, -7.4],
        [6.4, 5.0, -5.9]
      ],
      perch: {
        position: [8.4, 3.82, -4.2], yaw: 0,
        flightDuration: 48, landingDuration: 4.8, duration: 3.4, takeoffDuration: 4.2,
        landingControls: [[5.9, 4.8, -5.4], [7.6, 4.2, -4.45]],
        takeoffControls: [[8.5, 4.2, -3.7], [9.6, 5.1, -3.1]]
      }
    }
  },
  { id: 'winged_drone', position: [15.7, 6.6, -10.8], scale: .21, rotationY: 0, motion: { type: 'fly', radiusX: 1.1, radiusZ: .58, speed: -.28, phase: 2.7 } },
  { id: 'winged_drone', position: [16.8, 8.2, -11.6], scale: .18, rotationY: 0, motion: { type: 'fly', radiusX: .9, radiusZ: .46, speed: .25, phase: 4.1 } },
  { id: 'winged_drone', position: [17.9, 7.2, -10.5], scale: .2, rotationY: 0, motion: { type: 'fly', radiusX: 1.15, radiusZ: .64, speed: -.3, phase: 1.5 } }
]);

const smoothUnitInterval = value => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

export function sampleMenuPerchCycle(time, perch) {
  if (!perch) return { phase: 'flight', progress: 0, resting: false };
  const flightDuration = Math.max(.1, perch.flightDuration ?? 48);
  const landingDuration = Math.max(.1, perch.landingDuration ?? 4.5);
  const duration = Math.max(0, perch.duration ?? 3.5);
  const takeoffDuration = Math.max(.1, perch.takeoffDuration ?? 4);
  const landingEnd = flightDuration + landingDuration;
  const restEnd = landingEnd + duration;
  const interval = restEnd + takeoffDuration;
  const cycleTime = ((time % interval) + interval) % interval;

  if (cycleTime < flightDuration) {
    return { phase: 'flight', progress: cycleTime / flightDuration, resting: false };
  }
  if (cycleTime < landingEnd) {
    return { phase: 'landing', progress: (cycleTime - flightDuration) / landingDuration, resting: false };
  }
  if (cycleTime < restEnd) {
    return { phase: 'perched', progress: duration ? (cycleTime - landingEnd) / duration : 1, resting: true };
  }
  return { phase: 'takeoff', progress: (cycleTime - restEnd) / takeoffDuration, resting: false };
}

function createFeatherTexture(THREE, kind) {
  const width = 128;
  const height = kind === 'road' ? 64 : 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(width, height);
  const smoothstep = value => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const v = y / (height - 1);
      let alpha;
      if (kind === 'road') {
        const edgeX = Math.min(u, 1 - u) / .12;
        const edgeY = Math.min(v, 1 - v) / .28;
        alpha = smoothstep(Math.min(edgeX, edgeY)) * (.95 + Math.sin(u * 19 + v * 7) * .035);
      } else {
        const px = (u - .5) * 2;
        const py = (v - .5) * 2;
        const warp = 1 + Math.sin(Math.atan2(py, px) * 3 + 1.2) * .07;
        alpha = smoothstep((1 - Math.sqrt(px * px + py * py) / warp) / .78);
      }
      const offset = (y * width + x) * 4;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function placeAsset(THREE, root, placement) {
  root.scale.setScalar(placement.scale);
  root.rotation.y = placement.rotationY;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  root.position.set(placement.position[0], placement.position[1] - bounds.min.y, placement.position[2]);
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  return root;
}

export function createMenuBackground({ THREE, canvas, clonePrefab }) {
  if (!THREE || !canvas || typeof clonePrefab !== 'function') return null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x314f5e);
  scene.fog = new THREE.FogExp2(0x172a2f, .0125);

  const camera = new THREE.PerspectiveCamera(44, 1, .08, 180);
  const baseCamera = new THREE.Vector3(10.8, 4.8, 18.8);
  const baseTarget = new THREE.Vector3(10.2, 2.25, -4.6);
  const lookTarget = baseTarget.clone();
  camera.position.copy(baseCamera);
  camera.lookAt(lookTarget);

  scene.add(new THREE.HemisphereLight(0xdce9e9, 0x15201d, 1.6));
  const key = new THREE.DirectionalLight(0xffd7a1, 3.4);
  key.position.set(7, 13, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, near: 1, far: 55 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00035;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x61f0b0, 3.1);
  rim.position.set(-8, 7, -12);
  scene.add(rim);

  const disposableObjects = [];
  const sharedAssetRoots = [];
  const ownedActorRoots = [];
  const animatedActors = [];
  const pointer = new THREE.Vector2();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  let visible = false;
  let frameHandle = 0;
  let elapsed = 0;
  let previousTime = performance.now();

  const addDisposable = object => {
    scene.add(object);
    disposableObjects.push(object);
    return object;
  };

  const floor = addDisposable(new THREE.Mesh(
    new THREE.PlaneGeometry(58, 58),
    new THREE.MeshStandardMaterial({ color: 0x263532, roughness: .96, metalness: .03 })
  ));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(7, -.015, -4);
  floor.receiveShadow = true;

  const grid = addDisposable(new THREE.GridHelper(42, 12, 0x4c7467, 0x4c7467));
  grid.position.set(7, .012, -4);
  grid.material.transparent = true;
  grid.material.opacity = .08;

  const road = addDisposable(new THREE.Mesh(
    new THREE.PlaneGeometry(25, 8.5),
    new THREE.MeshBasicMaterial({
      color: 0x131d1d,
      map: createFeatherTexture(THREE, 'road'),
      transparent: true,
      opacity: .82,
      depthWrite: false
    })
  ));
  road.rotation.set(-Math.PI / 2, 0, -.055);
  road.position.set(11.8, .008, 1.5);

  const lane = addDisposable(new THREE.Mesh(
    new THREE.PlaneGeometry(.055, 38),
    new THREE.MeshBasicMaterial({ color: 0x61f0b0, transparent: true, opacity: .055 })
  ));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(10.8, .025, -3);

  const lightPool = addDisposable(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      color: 0x76eee1,
      map: createFeatherTexture(THREE, 'light'),
      transparent: true,
      opacity: .055,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  ));
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.position.set(17.1, .025, -9.2);
  lightPool.scale.set(4.5, 2.15, 1);

  const clinicLight = new THREE.PointLight(0x76eee1, 3.4, 11, 2);
  clinicLight.position.set(17.1, 3.2, -9.2);
  scene.add(clinicLight);

  function createContactShadow(root, opacity = .2) {
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const shadow = addDisposable(new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x020605, transparent: true, opacity, depthWrite: false })
    ));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(center.x, .035, center.z);
    shadow.scale.set(Math.max(.5, size.x * .5), Math.max(.35, size.z * .42), 1);
    return shadow;
  }

  function registerActor(root, placement, shadow = null) {
    const wingRoots = [];
    if (placement.motion.type === 'fly') {
      root.traverse(node => {
        const authoredWingSide = Number(node.userData?.menuWingSide) || 0;
        if (node.isGroup && (authoredWingSide || (Math.abs(node.position.x) > .35 && node.position.y > .8))) {
          wingRoots.push({ node, baseZ: node.rotation.z, side: authoredWingSide || Math.sign(node.position.x) || 1 });
        }
      });
    }
    const routePoints = placement.motion.route?.map(point => new THREE.Vector3(...point)) || [];
    const perch = placement.motion.perch;
    let flightRoute = null;
    let landingRoute = null;
    let takeoffRoute = null;
    if (routePoints.length >= 2 && perch) {
      flightRoute = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', .18);
      flightRoute.arcLengthDivisions = 80;
      flightRoute.updateArcLengths();
      const perchPoint = new THREE.Vector3(...perch.position);
      const landingControls = perch.landingControls.map(point => new THREE.Vector3(...point));
      const takeoffControls = perch.takeoffControls.map(point => new THREE.Vector3(...point));
      landingRoute = new THREE.CubicBezierCurve3(routePoints.at(-1), landingControls[0], landingControls[1], perchPoint);
      takeoffRoute = new THREE.CubicBezierCurve3(perchPoint, takeoffControls[0], takeoffControls[1], routePoints[0]);
    }
    animatedActors.push({
      root,
      motion: placement.motion,
      base: root.position.clone(),
      baseRotationY: root.rotation.y,
      currentYaw: root.rotation.y,
      shadow,
      wingRoots,
      flightRoute,
      landingRoute,
      takeoffRoute,
      routePoint: new THREE.Vector3(),
      routeTangent: new THREE.Vector3(),
      nextRouteTangent: new THREE.Vector3()
    });
  }

  function createActorRoot(placement) {
    if (placement.id !== 'propaganda_pelican') return clonePrefab(placement.id);
    const built = createPropagandaPelican({ THREE });
    built.refs.leftWing.userData.menuWingSide = 1;
    built.refs.rightWing.userData.menuWingSide = -1;
    ownedActorRoots.push(built.root);
    return built.root;
  }

  for (const placement of ENVIRONMENT_PLACEMENTS) {
    const root = clonePrefab(placement.id);
    if (!root) continue;
    placeAsset(THREE, root, placement);
    scene.add(root);
    sharedAssetRoots.push(root);
    createContactShadow(root, .22);
  }

  for (const placement of MENU_BACKGROUND_ACTOR_PLACEMENTS) {
    const root = createActorRoot(placement);
    if (!root) continue;
    placeAsset(THREE, root, placement);
    scene.add(root);
    sharedAssetRoots.push(root);
    const shadow = placement.motion.type === 'fly' ? null : createContactShadow(root, .16);
    registerActor(root, placement, shadow);
  }

  function resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 700 ? 53 : width < 1050 ? 48 : 44;
    camera.updateProjectionMatrix();
  }

  function animateActors(time) {
    if (reducedMotion) return;
    for (const actor of animatedActors) {
      const { root, motion, base, baseRotationY, wingRoots, shadow } = actor;
      const speed = motion.speed ?? .5;
      const phase = motion.phase ?? 0;
      const t = time * speed + phase;
      if (motion.type === 'fly') {
        if (actor.flightRoute && motion.perch) {
          const perchState = sampleMenuPerchCycle(time, motion.perch);
          const progress = perchState.progress;
          let routeProgress = progress;
          if (perchState.phase === 'landing') routeProgress = progress + progress * progress - progress * progress * progress;
          else if (perchState.phase === 'takeoff') routeProgress = 2 * progress * progress - progress * progress * progress;
          let route = actor.flightRoute;
          if (perchState.phase === 'landing') route = actor.landingRoute;
          else if (perchState.phase === 'takeoff') route = actor.takeoffRoute;

          if (perchState.phase === 'perched') {
            root.position.set(...motion.perch.position);
            root.position.y += Math.sin(time * 1.4) * .01;
            actor.routeTangent.set(Math.sin(motion.perch.yaw), 0, Math.cos(motion.perch.yaw));
          } else {
            route.getPointAt(routeProgress, actor.routePoint);
            route.getTangentAt(routeProgress, actor.routeTangent);
            root.position.copy(actor.routePoint);
            if (perchState.phase === 'flight') {
              root.position.y += Math.sin(time * .85 + phase) * .08 * Math.sin(Math.PI * routeProgress);
            }
          }

          const horizontalSpeed = Math.hypot(actor.routeTangent.x, actor.routeTangent.z);
          root.rotation.y = Math.atan2(actor.routeTangent.x, actor.routeTangent.z);
          root.rotation.x = horizontalSpeed > .001
            ? Math.max(-.18, Math.min(.18, -Math.atan2(actor.routeTangent.y, horizontalSpeed)))
            : 0;
          root.rotation.z = 0;

          let wingAmplitude = 0;
          let wingFrequency = 7.5;
          let wingFlare = 0;
          if (perchState.phase === 'flight') {
            wingAmplitude = .22;
            actor.flightRoute.getTangentAt(Math.min(1, routeProgress + .02), actor.nextRouteTangent);
            const turn = actor.routeTangent.x * actor.nextRouteTangent.z - actor.routeTangent.z * actor.nextRouteTangent.x;
            root.rotation.z = Math.max(-.14, Math.min(.14, turn * 3));
          } else if (perchState.phase === 'landing') {
            wingAmplitude = .2 * (1 - smoothUnitInterval(perchState.progress));
            wingFrequency = 5.2;
            wingFlare = Math.sin(Math.PI * perchState.progress) * .14;
            root.rotation.x = -Math.sin(Math.PI * perchState.progress) * .14;
          } else if (perchState.phase === 'takeoff') {
            wingAmplitude = .28 * smoothUnitInterval(perchState.progress);
            wingFrequency = 9.2;
            wingFlare = Math.sin(Math.PI * perchState.progress) * .08;
          }
          wingRoots.forEach(({ node, baseZ, side }, index) => {
            const flap = Math.sin(time * wingFrequency + phase + index * .15) * wingAmplitude;
            node.rotation.z = baseZ + side * (flap + wingFlare);
          });
          continue;
        }

        const radiusX = motion.radiusX ?? 2.5;
        const radiusZ = motion.radiusZ ?? 1.2;
        root.position.x = base.x + Math.cos(t) * radiusX;
        root.position.z = base.z + Math.sin(t) * radiusZ;
        root.position.y = base.y + Math.sin(t * 2.15) * .22;
        root.rotation.x = 0;
        root.rotation.y = Math.atan2(-Math.sin(t) * radiusX * speed, Math.cos(t) * radiusZ * speed);
        root.rotation.z = Math.sin(t) * .09;
        wingRoots.forEach(({ node, baseZ, side }, index) => {
          node.rotation.z = baseZ + side * Math.sin(time * 7.5 + phase + index * .15) * .22;
        });
        continue;
      }
      const travel = Math.sin(t) * (motion.range ?? 2);
      const velocity = Math.cos(t) * speed;
      root.position.x = base.x + (motion.axis === 'z' ? 0 : travel);
      root.position.z = base.z + (motion.axis === 'z' ? travel : 0);
      root.position.y = base.y + Math.abs(Math.sin(t * 4)) * .035;
      const facing = motion.axis === 'z' ? (velocity >= 0 ? 0 : Math.PI) : (velocity >= 0 ? Math.PI / 2 : -Math.PI / 2);
      const targetYaw = baseRotationY + facing;
      actor.currentYaw += Math.atan2(Math.sin(targetYaw - actor.currentYaw), Math.cos(targetYaw - actor.currentYaw)) * .08;
      root.rotation.y = actor.currentYaw;
      if (shadow) {
        shadow.position.x = root.position.x;
        shadow.position.z = root.position.z;
      }
    }
  }

  function render(now) {
    if (!visible) return;
    const delta = Math.min(.04, (now - previousTime) / 1000);
    previousTime = now;
    elapsed += delta;
    const drift = reducedMotion ? 0 : Math.sin(elapsed * .17) * .24;
    camera.position.x += ((baseCamera.x + pointer.x * .34 + drift) - camera.position.x) * .025;
    camera.position.y += ((baseCamera.y - pointer.y * .19) - camera.position.y) * .025;
    lookTarget.x += ((baseTarget.x + pointer.x * .18) - lookTarget.x) * .03;
    lookTarget.y += ((baseTarget.y - pointer.y * .1) - lookTarget.y) * .03;
    camera.lookAt(lookTarget);
    animateActors(elapsed);
    renderer.render(scene, camera);
    frameHandle = requestAnimationFrame(render);
  }

  function onPointerMove(event) {
    if (!visible) return;
    pointer.x = (event.clientX / window.innerWidth - .5) * 2;
    pointer.y = (event.clientY / window.innerHeight - .5) * 2;
  }

  function show() {
    if (visible) return;
    visible = true;
    document.body.classList.add('menu-background-active');
    previousTime = performance.now();
    resize();
    frameHandle = requestAnimationFrame(render);
  }

  function hide() {
    visible = false;
    document.body.classList.remove('menu-background-active');
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  }

  function destroy() {
    hide();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onPointerMove);
    for (const root of sharedAssetRoots) scene.remove(root);
    const ownedGeometries = new Set();
    const ownedMaterials = new Set();
    for (const root of ownedActorRoots) {
      root.traverse(object => {
        if (object.geometry) ownedGeometries.add(object.geometry);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(Boolean).forEach(material => ownedMaterials.add(material));
      });
    }
    ownedGeometries.forEach(geometry => geometry.dispose?.());
    ownedMaterials.forEach(material => material.dispose?.());
    for (const object of disposableObjects) {
      scene.remove(object);
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach(material => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    }
    renderer.dispose();
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  resize();

  return { show, hide, destroy, renderer, scene, camera };
}
