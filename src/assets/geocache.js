// Simple geometry cache to avoid reallocating identical BufferGeometries
// Usage: import { getBox } from './geocache.js'; new THREE.Mesh(getBox(THREE, w,h,d), mat)

const _boxCache = new Map(); // key: `${w}|${h}|${d}` -> BufferGeometry

export function getBox(THREE, w, h, d){
	const key = `${w}|${h}|${d}`;
	let geo = _boxCache.get(key);
	if (!geo) { geo = new THREE.BoxGeometry(w, h, d); _boxCache.set(key, geo); }
	return geo;
}


