// Deterministic RNG utilities
// - mulberry32 PRNG (fast, 32-bit) seeded via a hashed string

// 32-bit string hash (xmur3)
function xmur3(str){
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function(){
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0; // unsigned 32-bit
  };
}

// mulberry32 PRNG, returns [0,1)
export function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Create RNG from an arbitrary seed string
export function makeSeededRng(seedString){
  const seedInt = xmur3(String(seedString))();
  const rand = mulberry32(seedInt);
  // helper methods for convenience
  rand.int = (min, max) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(rand() * (hi - lo + 1)) + lo;
  };
  rand.range = (min, max) => rand() * (max - min) + min;
  return rand;
}

// Create a deterministic RNG for a namespace derived from a base seed string
export function makeNamespacedRng(seedString, namespace){
  return makeSeededRng(`${seedString}:${namespace}`);
}

// Generate a shareable short seed (A–Z0–9)
export function generateSeedString(len = 6){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  // Prefer crypto if available for better uniqueness
  const useCrypto = typeof crypto !== 'undefined' && crypto.getRandomValues;
  for (let i = 0; i < len; i++){
    let idx;
    if (useCrypto){
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      idx = buf[0] % alphabet.length;
    } else {
      idx = Math.floor(Math.random() * alphabet.length);
    }
    out += alphabet[idx];
  }
  return out;
}


