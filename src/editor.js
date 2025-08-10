// Simple FPV Level Editor
// Usage: add ?editor=1 to URL. Provides fly controls, grid snap placement, delete, import/export JSON.

export function startEditor({ THREE, scene, camera, renderer, mats, objects = [], initialMap = null }) {
  // --- State ---
  const state = {
    walls: [], // {shape:'box', w,h,d, x,y,z, rotY}
    obstacles: [], // {type, x,y,z, rotY?}
    enemySpawns: [], // {x,y,z}
    playerSpawn: { x: 0, y: 1.7, z: 8 },
    mode: 'wall-box', // 'wall-box' | 'crate' | 'barricade' | 'barrel' | 'enemy-spawn' | 'player-spawn'
    wallDims: { w: 6, h: 2, d: 1, rotY: 0 },
    rotYObstacle: 0,
    snap: 1.0,
    speed: 14,
    offsetY: 0, // vertical offset for placement (T/G to change)
  };

  // --- Scene helpers ---
  const grid = new THREE.GridHelper(80, 80, 0x888888, 0xcccccc);
  grid.position.y = 0; scene.add(grid);
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(0, 0); // center
  const invisiblePlane = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ visible: false }));
  invisiblePlane.rotation.x = -Math.PI / 2; invisiblePlane.position.y = 0; scene.add(invisiblePlane);

  // --- Controls (pointer lock FPV + fly) ---
  let isLocked = false;
  let yaw = 0, pitch = 0;
  const vel = new THREE.Vector3();
  const dirF = new THREE.Vector3();
  const dirR = new THREE.Vector3();
  const keys = new Set();
  camera.rotation.order = 'YXZ';
  const canvas = renderer.domElement;
  canvas.style.cursor = 'crosshair';
  canvas.addEventListener('click', ()=>{ if (!isLocked) canvas.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', ()=>{ isLocked = (document.pointerLockElement === canvas); });
  document.addEventListener('mousemove', (e)=>{
    if (!isLocked) return;
    const sens = 0.0022;
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens;
    pitch = Math.max(-Math.PI/2 + 0.01, Math.min(Math.PI/2 - 0.01, pitch));
    camera.rotation.set(pitch, yaw, 0);
  });
  // Mouse wheel: rotate current placement around Y
  function normalizeAngle(a){ const twoPi = Math.PI*2; a = a % twoPi; if (a < 0) a += twoPi; return a; }
  window.addEventListener('wheel', (e)=>{
    // Only when interacting with editor (pointer locked preferred)
    if (!isLocked) return;
    const step = e.shiftKey ? (Math.PI/36) : (Math.PI/12); // 5° fine, 15° coarse
    const dir = e.deltaY > 0 ? 1 : -1;
    if (state.mode === 'wall-box') {
      state.wallDims.rotY = normalizeAngle(state.wallDims.rotY + dir * step);
      const rotInput = document.getElementById('rotY'); if (rotInput) rotInput.value = state.wallDims.rotY.toFixed(3);
    } else if (state.mode === 'barricade' || state.mode === 'crate' || state.mode === 'barrel') {
      state.rotYObstacle = normalizeAngle(state.rotYObstacle + dir * step);
    }
    // update preview orientation instantly
    if (preview) {
      if (state.mode === 'wall-box') preview.rotation.y = state.wallDims.rotY;
      else if (state.mode === 'barricade' || state.mode === 'crate' || state.mode === 'barrel') preview.rotation.y = state.rotYObstacle;
    }
  }, { passive: true });
  window.addEventListener('keydown', (e)=>{
    keys.add(e.code);
    if (e.code === 'BracketLeft') state.speed = Math.max(2, state.speed - 2);
    if (e.code === 'BracketRight') state.speed = Math.min(60, state.speed + 2);

    // Placement vertical offset: raise/lower with T/G — step by element height (ramp: stepH; wall: H)
    const getOffsetStep = () => {
      if (state.mode === 'ramp') { return Number(document.getElementById('rampStepH')?.value || 0.3) || 0.3; }
      if (state.mode === 'wall-box') { return Math.max(0.01, state.wallDims.h || 1); }
      if (state.mode === 'crate') { return 2; }
      if (state.mode === 'barricade') { return 2; }
      if (state.mode === 'barrel') { return 1.2; }
      return 0.5;
    };
    if (e.code === 'KeyT' || e.code === 'KeyG') {
      const unit = getOffsetStep();
      const fine = Math.max(0.01, unit * 0.2); // Shift = 20% of unit
      const delta = e.shiftKey ? fine : unit;
      state.offsetY += (e.code === 'KeyT' ? +delta : -delta);
      const oy = document.getElementById('offsetY'); if (oy) oy.value = state.offsetY.toFixed(2);
      if (preview) preview.position.y = getDefaultYForCurrentMode() + state.offsetY;
    }

    // Dimension edits for wall boxes: height (R/F), width (Z/X), depth (C/V)
    const applyDims = ()=>{
      const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
      const step = e.shiftKey ? 0.1 : 0.5;
      let changed = false;
      if (state.mode === 'wall-box') {
        if (e.code === 'KeyR') { state.wallDims.h = clamp(state.wallDims.h + step, 0.2, 20); changed = true; }
        if (e.code === 'KeyF') { state.wallDims.h = clamp(state.wallDims.h - step, 0.2, 20); changed = true; }
        if (e.code === 'KeyZ') { state.wallDims.w = clamp(state.wallDims.w - step, 0.2, 80); changed = true; }
        if (e.code === 'KeyX') { state.wallDims.w = clamp(state.wallDims.w + step, 0.2, 80); changed = true; }
        if (e.code === 'KeyC') { state.wallDims.d = clamp(state.wallDims.d - step, 0.2, 80); changed = true; }
        if (e.code === 'KeyV') { state.wallDims.d = clamp(state.wallDims.d + step, 0.2, 80); changed = true; }
        if (changed) {
          // Sync inputs
          const wI = document.getElementById('wallW'); if (wI) wI.value = state.wallDims.w.toFixed(2);
          const hI = document.getElementById('wallH'); if (hI) hI.value = state.wallDims.h.toFixed(2);
          const dI = document.getElementById('wallD'); if (dI) dI.value = state.wallDims.d.toFixed(2);
          refreshPreview();
          e.preventDefault();
        }
      }
      // Universal Y offset controls (T/G)
      if (e.code === 'KeyT') { state.offsetY = clamp(state.offsetY + step, -0.5, 30); refreshPreview(); e.preventDefault(); }
      if (e.code === 'KeyG') { state.offsetY = clamp(state.offsetY - step, -0.5, 30); refreshPreview(); e.preventDefault(); }
    };
    applyDims();
  });
  window.addEventListener('keyup', (e)=>{ keys.delete(e.code); });

  function updateCamera(dt){
    // Build basis from camera yaw (ignore pitch for horizontal plane)
    dirF.set(0,0,-1).applyEuler(new THREE.Euler(0, camera.rotation.y, 0)).normalize();
    dirR.crossVectors(dirF, new THREE.Vector3(0,1,0)).normalize();
    const acc = new THREE.Vector3();
    if (keys.has('KeyW')) acc.add(dirF);
    if (keys.has('KeyS')) acc.add(dirF.clone().multiplyScalar(-1));
    if (keys.has('KeyA')) acc.add(dirR.clone().multiplyScalar(-1));
    if (keys.has('KeyD')) acc.add(dirR);
    if (keys.has('Space')) acc.y += 1;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) acc.y -= 1;
    if (acc.lengthSq() > 0) acc.normalize().multiplyScalar(state.speed);
    const damp = Math.pow(0.0001, dt); // very light damping
    vel.multiplyScalar(damp).addScaledVector(acc, dt * 8);
    camera.position.addScaledVector(vel, dt);
  }

  // --- UI ---
  const ui = document.createElement('div'); ui.id = 'editorUI';
  ui.style.position = 'fixed'; ui.style.top = '10px'; ui.style.left = '10px'; ui.style.background = '#ffffffee'; ui.style.padding = '10px'; ui.style.borderRadius = '10px'; ui.style.font = '12px system-ui, sans-serif'; ui.style.zIndex = 10; ui.style.maxWidth = '320px';
  ui.innerHTML = `
    <div style="display:flex; gap:6px; flex-wrap:wrap">
      <button data-mode="wall-box">Wall Box</button>
      <button data-mode="crate">Crate</button>
      <button data-mode="barricade">Barricade</button>
      <button data-mode="ramp">Ramp</button>
      <button data-mode="barrel">Barrel</button>
      <button data-mode="enemy-spawn">Enemy Spawn</button>
      <button data-mode="player-spawn">Player Spawn</button>
    </div>
    <div style="margin-top:6px; display:grid; grid-template-columns: auto 1fr; gap:6px; align-items:center">
      <label>Snap</label><input id="snap" type="number" step="0.1" value="1" />
      <label>Speed</label><input id="speed" type="number" step="1" value="14" />
      <label>Wall W</label><input id="wallW" type="number" step="0.1" value="6" />
      <label>Wall H</label><input id="wallH" type="number" step="0.1" value="2" />
      <label>Wall D</label><input id="wallD" type="number" step="0.1" value="1" />
      <label>Ramp Steps</label><input id="rampSteps" type="number" step="1" value="6" />
      <label>Step H</label><input id="rampStepH" type="number" step="0.1" value="0.3" />
      <label>Step D</label><input id="rampStepD" type="number" step="0.1" value="1.0" />
      <label>Rot Y</label><input id="rotY" type="number" step="0.1" value="0" />
      <label>Offset Y</label><input id="offsetY" type="number" step="0.1" value="0" />
    </div>
    <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; align-items:center">
      <button id="export">Export JSON</button>
      <label style="display:inline-flex; gap:6px; align-items:center; cursor:pointer">
        <span>Import</span>
        <input id="import" type="file" accept="application/json" style="display:none" />
      </label>
      <div style="margin-left:auto; font-size:11px; color:#333; padding:4px 6px; border:1px solid #e5e7eb; border-radius:8px; background:#f8fafc">Offset step: <b id="offsetStepLabel">0.50</b></div>
      <button id="clearAll">Clear</button>
    </div>
    <div style="margin-top:6px; color:#333">Tips: Click to lock mouse. WASD to move, Space/Shift up/down, [ ] speed, Wheel rotate (Shift=5°). T/G raises/lowers by the Offset step above (Shift=20%). Left-click place, Q delete.</div>
  `;
  document.body.appendChild(ui);
  ui.querySelectorAll('button[data-mode]').forEach(btn=> btn.onclick = ()=>{ state.mode = btn.getAttribute('data-mode'); refreshPreview(); const off=document.getElementById('offsetStepLabel'); if(off) off.textContent = getOffsetStep().toFixed(2); });
  ui.querySelector('#snap').oninput = (e)=>{ state.snap = Math.max(0.1, Number(e.target.value)||1); };
  ui.querySelector('#speed').oninput = (e)=>{ state.speed = Math.max(1, Number(e.target.value)||14); };
  const setWall = ()=>{
    state.wallDims.w = Math.max(0.1, Number(document.getElementById('wallW').value)||6);
    state.wallDims.h = Math.max(0.1, Number(document.getElementById('wallH').value)||2);
    state.wallDims.d = Math.max(0.1, Number(document.getElementById('wallD').value)||1);
    state.wallDims.rotY = Number(document.getElementById('rotY').value)||0;
    refreshPreview();
  };
  ui.querySelector('#wallW').oninput = ()=>{ setWall(); const off=document.getElementById('offsetStepLabel'); if(off) off.textContent = getOffsetStep().toFixed(2); };
  ui.querySelector('#wallH').oninput = ()=>{ setWall(); const off=document.getElementById('offsetStepLabel'); if(off) off.textContent = getOffsetStep().toFixed(2); };
  ui.querySelector('#wallD').oninput = ()=>{ setWall(); const off=document.getElementById('offsetStepLabel'); if(off) off.textContent = getOffsetStep().toFixed(2); };
  ui.querySelector('#rotY').oninput = setWall;
  ui.querySelector('#offsetY').oninput = (e)=>{ state.offsetY = Number(e.target.value)||0; refreshPreview(); };
  ui.querySelector('#export').onclick = ()=>{
    const data = exportJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'level.json'; a.click(); URL.revokeObjectURL(url);
  };
  ui.querySelector('#import').onchange = async (e)=>{
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const text = await f.text();
    try { const json = JSON.parse(text); importJSON(json); } catch(err){ alert('Invalid JSON'); }
  };
  ui.querySelector('#clearAll').onclick = ()=>{ clearAll(); };

  // --- Placement Preview ---
  let preview = null;
  function disposePreview(){ if (!preview) return; scene.remove(preview); preview.geometry?.dispose?.(); preview.material?.dispose?.(); preview = null; }
  function refreshPreview(){
    disposePreview();
    const tr = new THREE.MeshBasicMaterial({ color: 0x00aaee, transparent: true, opacity: 0.35, depthWrite: false });
    if (state.mode === 'wall-box') {
      preview = new THREE.Mesh(new THREE.BoxGeometry(state.wallDims.w, state.wallDims.h, state.wallDims.d), tr);
      preview.rotation.y = state.wallDims.rotY;
    } else if (state.mode === 'crate') {
      preview = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), tr);
      preview.rotation.y = state.rotYObstacle;
    } else if (state.mode === 'barricade') {
      preview = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), tr);
      preview.rotation.y = state.rotYObstacle;
    } else if (state.mode === 'barrel') {
      preview = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14, 1), tr);
      preview.rotation.y = state.rotYObstacle;
    } else if (state.mode === 'ramp') {
      // Visualize ramp as a translucent stack to match placement exactly
      const steps = Math.max(1, Math.floor(Number(document.getElementById('rampSteps')?.value || 6)));
      const stepH = Number(document.getElementById('rampStepH')?.value || 0.3);
      const stepD = Number(document.getElementById('rampStepD')?.value || 1.0);
      const w = state.wallDims.w;
      const totalD = steps * stepD;
      const group = new THREE.Group();
      for (let i=0;i<steps;i++){
        const sy = stepH; const sz = stepD * (i+1);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, sy, sz), tr);
        seg.position.set(0, (sy*0.5) + (stepH*i) + (state.offsetY||0), (sz*0.5) - (totalD*0.5) + stepD*i);
        group.add(seg);
      }
      group.rotation.y = state.wallDims.rotY;
      preview = group;
    } else if (state.mode === 'enemy-spawn' || state.mode === 'player-spawn') {
      preview = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), new THREE.MeshBasicMaterial({ color: state.mode==='player-spawn'?0x22c55e:0xef4444, transparent:true, opacity:0.6, depthWrite:false }));
    }
    if (preview) { preview.position.y = getDefaultYForCurrentMode() + (state.offsetY||0); scene.add(preview); }
  }
  function getDefaultYForCurrentMode(){
    switch(state.mode){
      case 'wall-box': return state.wallDims.h*0.5 + state.offsetY;
      case 'crate': return 1.0 + state.offsetY;
      case 'barricade': return 1.0 + state.offsetY;
      case 'barrel': return 0.6 + state.offsetY;
      case 'enemy-spawn': return 0.8 + state.offsetY;
      case 'player-spawn': return 1.7 + state.offsetY;
      default: return 0;
    }
  }
  refreshPreview();

  // --- Utils ---
  function snap(v){ const s = state.snap; return Math.round(v / s) * s; }
  function getAimPoint(){
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    raycaster.set(origin, dir); raycaster.far = 500;
    const hits = raycaster.intersectObjects([invisiblePlane, grid, ...objects], true);
    if (hits && hits.length) return hits[0].point;
    return origin.clone().addScaledVector(dir, 5);
  }
  function placeAt(point){
    const x = snap(point.x); const z = snap(point.z);
    const y = getDefaultYForCurrentMode() + (state.offsetY||0);
    if (state.mode === 'wall-box') {
      const { w, h, d, rotY } = state.wallDims;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
      mesh.position.set(x, (h*0.5) + (state.offsetY||0), z); mesh.rotation.y = rotY; scene.add(mesh);
      mesh.userData.editor = { type: 'wall' };
      state.walls.push({ shape:'box', w, h, d, x, y: (h*0.5) + (state.offsetY||0), z, rotY });
    } else if (state.mode === 'ramp') {
      const steps = Math.max(1, Math.floor(Number(document.getElementById('rampSteps')?.value || 6)));
      const stepH = Number(document.getElementById('rampStepH')?.value || 0.3);
      const stepD = Number(document.getElementById('rampStepD')?.value || 1.0);
      const w = state.wallDims.w;
      // Visualize and add colliders inline so gameplay matches immediately
      const totalD = steps * stepD;
      const group = new THREE.Group();
      for (let i=0;i<steps;i++){
        const sy = stepH; const sz = stepD * (i+1);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(w, sy, sz), mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
        seg.position.set(0, (sy*0.5) + (stepH*i), (sz*0.5) - (totalD*0.5) + stepD*i);
        group.add(seg);
      }
      group.position.set(x, y, z); group.rotation.y = state.wallDims.rotY; scene.add(group); group.userData.editor = { type: 'ramp' };
      if (objects) objects.push(group);
      // Save into export array so the map reproduces it
      if (!state._ramps) state._ramps = [];
      state._ramps.push({ w, steps, stepH, stepD, x, y, z, rotY: state.wallDims.rotY });
    } else if (state.mode === 'crate' || state.mode === 'barricade' || state.mode === 'barrel') {
      const type = state.mode;
      let mesh = null;
      if (type === 'crate') mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats?.crate || new THREE.MeshLambertMaterial({ color: 0xC6A15B }));
      if (type === 'barricade') mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
      if (type === 'barrel') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14, 1), new THREE.MeshLambertMaterial({ color: 0xCC3333 }));
      mesh.position.set(x, y, z); mesh.rotation.y = state.rotYObstacle; scene.add(mesh); mesh.userData.editor = { type: 'obstacle', obstacleType: type };
      state.obstacles.push({ type, x, y, z, rotY: state.rotYObstacle });
    } else if (state.mode === 'enemy-spawn') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 })); s.position.set(x, y, z); scene.add(s); s.userData.editor = { type: 'enemySpawn' };
      state.enemySpawns.push({ x, y, z });
    } else if (state.mode === 'player-spawn') {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0x22c55e })); s.position.set(x, y, z); scene.add(s); s.userData.editor = { type: 'playerSpawn' };
      state.playerSpawn = { x, y, z };
    }
  }
  function deleteAimed(){
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    raycaster.set(origin, dir); raycaster.far = 500;
    const hits = raycaster.intersectObjects(scene.children, true);
    for (const h of hits) {
      const obj = h.object;
      if (obj && obj.userData && obj.userData.editor) {
        // Remove from scene and state
        scene.remove(obj);
        const ed = obj.userData.editor;
        if (ed.type === 'wall') {
          // find a wall at same position roughly
          state.walls = state.walls.filter(w => Math.hypot((w.x - obj.position.x), (w.z - obj.position.z)) > 0.5 || Math.abs((w.y||0) - obj.position.y) > 0.51);
        } else if (ed.type === 'obstacle') {
          const pos = obj.position; const t = ed.obstacleType;
          state.obstacles = state.obstacles.filter(o => o.type !== t || Math.hypot((o.x - pos.x), (o.z - pos.z)) > 0.5);
        } else if (ed.type === 'enemySpawn') {
          const pos = obj.position;
          state.enemySpawns = state.enemySpawns.filter(s => Math.hypot((s.x - pos.x), (s.z - pos.z)) > 0.5);
        } else if (ed.type === 'playerSpawn') {
          state.playerSpawn = null;
        }
        return;
      }
    }
  }
  window.addEventListener('keydown', (e)=>{ if (e.code === 'KeyQ') deleteAimed(); });

  // --- Import/Export ---
  function exportJSON(){
    return {
      name: 'Edited Level',
      playerSpawn: state.playerSpawn || { x: 0, y: 1.7, z: 8 },
      enemySpawns: state.enemySpawns.slice(),
      walls: state.walls.slice(),
      obstacles: state.obstacles.slice(),
      ramps: (state._ramps||[]).slice()
    };
  }
  function importJSON(json){
    clearAll();
    try {
      if (json.playerSpawn) state.playerSpawn = { x: json.playerSpawn.x||0, y: json.playerSpawn.y||1.7, z: json.playerSpawn.z||8 };
      if (Array.isArray(json.enemySpawns)) state.enemySpawns = json.enemySpawns.map(s => ({ x: s.x||0, y: s.y||0.8, z: s.z||0 }));
      if (Array.isArray(json.walls)) state.walls = json.walls.map(w => ({ shape:'box', w:w.w||1, h:w.h||1, d:w.d||1, x:w.x||0, y:w.y||0.5, z:w.z||0, rotY:w.rotY||0 }));
      if (Array.isArray(json.obstacles)) state.obstacles = json.obstacles.map(o => ({ type:o.type||'crate', x:o.x||0, y:o.y!=null?o.y:(o.type==='barrel'?0.6:1.0), z:o.z||0, rotY:o.rotY||0 }));
      if (Array.isArray(json.ramps)) state._ramps = json.ramps.map(r => ({ w:r.w||4, steps:Math.max(1, Math.floor(r.steps||6)), stepH:(r.stepH!=null? r.stepH : ((r.h||2)/(Math.max(1, Math.floor(r.steps||6))))), stepD:(r.stepD!=null? r.stepD : ((r.d||6)/(Math.max(1, Math.floor(r.steps||6))))), x:r.x||0, y:r.y!=null?r.y:(((r.stepH!=null? r.stepH : ((r.h||2)/(Math.max(1, Math.floor(r.steps||6)))))*(Math.max(1, Math.floor(r.steps||6))) * 0.5)), z:r.z||0, rotY:r.rotY||0 }));
    } catch(_) {}
    // Rebuild scene
    for (const w of state.walls) { const m = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 })); m.position.set(w.x, w.y, w.z); m.rotation.y = w.rotY||0; scene.add(m); m.userData.editor = { type:'wall' }; }
    for (const o of state.obstacles) {
      let mesh = null;
      if (o.type === 'crate') mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats?.crate || new THREE.MeshLambertMaterial({ color: 0xC6A15B }));
      else if (o.type === 'barricade') mesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 1), mats?.wall || new THREE.MeshLambertMaterial({ color: 0x8ecae6 }));
      else mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14, 1), new THREE.MeshLambertMaterial({ color: 0xCC3333 }));
      mesh.position.set(o.x, o.y, o.z); mesh.rotation.y = o.rotY||0; scene.add(mesh); mesh.userData.editor = { type:'obstacle', obstacleType:o.type };
    }
    // Visual hint for ramps (simple translucent box volume)
    if (state._ramps && state._ramps.length) {
      for (const r of state._ramps) {
        const totalH = r.steps * r.stepH; const totalD = r.steps * r.stepD;
        const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, totalH, totalD), new THREE.MeshBasicMaterial({ color: 0x00aaee, transparent:true, opacity:0.15, depthWrite:false }));
        g.position.set(r.x, r.y, r.z); g.rotation.y = r.rotY||0; scene.add(g); g.userData.editor = { type:'ramp' };
      }
    }
    if (state.playerSpawn) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), new THREE.MeshBasicMaterial({ color: 0x22c55e })); s.position.set(state.playerSpawn.x, state.playerSpawn.y, state.playerSpawn.z); scene.add(s); s.userData.editor = { type:'playerSpawn' };
    }
    for (const s of state.enemySpawns) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 })); e.position.set(s.x, s.y, s.z); scene.add(e); e.userData.editor = { type:'enemySpawn' }; }
  }
  function clearAll(){
    // remove editor-tagged objects
    const toRemove = [];
    scene.traverse(obj => { if (obj.userData && obj.userData.editor) toRemove.push(obj); });
    toRemove.forEach(o => scene.remove(o));
    state.walls = []; state.obstacles = []; state.enemySpawns = []; state.playerSpawn = { x: 0, y: 1.7, z: 8 };
  }

  // --- Mouse place ---
  window.addEventListener('mousedown', (e)=>{
    if (!isLocked) return; if (e.button !== 0) return;
    const p = getAimPoint(); placeAt(p);
  });

  // --- Loop ---
  const clock = new THREE.Clock();
  function step(){
    const dt = Math.min(0.033, clock.getDelta());
    updateCamera(dt);
    // Update preview position at aim point
    if (preview) {
      const p = getAimPoint();
      preview.position.x = snap(p.x);
      preview.position.z = snap(p.z);
      preview.position.y = getDefaultYForCurrentMode() + (state.offsetY||0);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  // Auto-import if provided
  try { if (initialMap) importJSON(initialMap); } catch(_) {}
}


