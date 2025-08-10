// Preset chiptune/8-bit drive songs for the playlist
// Each song config customizes rhythm, harmony, tempo, and feel

export const SONGS = [
  {
    id: 'drive-a',
    name: 'Drive A',
    bpm: 132,
    swing: 0.12,
    baseFreq: 164.81, // E3
    progression: [0, 8, 3, 10, 0, 8, 10, 0], // Em C G D | Em C D Em
    kickPattern: [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    leadArp: [0, 12, 7, 12],
    delayTime: 0.23,
  },
  {
    id: 'drive-b',
    name: 'Drive B',
    bpm: 136,
    swing: 0.1,
    baseFreq: 174.61, // F3
    progression: [0, 7, 5, 3, 0, 10, 7, 5], // Fm C Bb Ab | Fm Eb C Bb
    kickPattern: [1,0,0,0, 1,0,0,0, 1,0,0,1, 0,0,0,0], // small variation
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0], // busier
    leadArp: [0, 7, 12, 7],
    delayTime: 0.21,
  },
  {
    id: 'night-glide',
    name: 'Night Glide',
    bpm: 124,
    swing: 0.16,
    baseFreq: 155.56, // D#3/Eb3
    progression: [0, 10, 3, 8, 0, 10, 8, 0], // Ebm Db Gbm B | Ebm Db B Ebm
    kickPattern: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1], // syncopated
    leadArp: [0, 12, 15, 12],
    delayTime: 0.27,
  },
  {
    id: 'sunset-rush',
    name: 'Sunset Rush',
    bpm: 140,
    swing: 0.08,
    baseFreq: 146.83, // D3
    progression: [0, 7, 10, 5, 0, 7, 3, 0], // Dm A C G | Dm A F Dm
    kickPattern: [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,1,1,0, 1,0,1,1, 1,1,1,0, 1,0,1,1],
    leadArp: [0, 12, 7, 19],
    delayTime: 0.19,
  },
  {
    id: 'boss-standoff',
    name: 'Boss Standoff',
    bpm: 128,
    swing: 0.06,
    baseFreq: 155.56, // Eb3
    progression: [0, 0, 10, 0, 0, 3, 10, 0], // pedal root with dark turns
    kickPattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // driving 8ths
    snarePattern: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1], // 2 & 4 + extra hit
    hatPattern:   [1,1,1,1, 1,0,1,1, 1,1,1,1, 1,0,1,1],
    leadArp: [0, 12, 7, 15],
    delayTime: 0.18,
    isBoss: true,
  },
  // Additional main themes
  {
    id: 'circuit-runner',
    name: 'Circuit Runner',
    bpm: 134,
    swing: 0.1,
    baseFreq: 164.81, // E3
    progression: [0, 5, 3, 10, 0, 5, 7, 3], // Em Am G D | Em Am Bm G
    kickPattern: [1,0,0,0, 1,0,1,0, 1,0,0,1, 0,0,0,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    leadArp: [0, 12, 7, 14],
    delayTime: 0.22,
  },
  {
    id: 'midnight-highway',
    name: 'Midnight Highway',
    bpm: 126,
    swing: 0.14,
    baseFreq: 174.61, // F3
    progression: [0, 10, 5, 3, 0, 7, 5, 3], // Fm Eb Bb Ab | Fm C Bb Ab
    kickPattern: [1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0],
    leadArp: [0, 12, 15, 12],
    delayTime: 0.26,
  },
  {
    id: 'neon-sprint',
    name: 'Neon Sprint',
    bpm: 142,
    swing: 0.08,
    baseFreq: 155.56, // Eb3
    progression: [0, 7, 10, 5, 0, 10, 7, 0], // Ebm Bb Db Ab | Ebm Db Bb Ebm
    kickPattern: [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,1,1,0, 1,0,1,1, 1,1,1,0, 1,0,1,1],
    leadArp: [0, 12, 7, 19],
    delayTime: 0.2,
  },
  {
    id: 'pixel-pulse',
    name: 'Pixel Pulse',
    bpm: 120,
    swing: 0.18,
    baseFreq: 146.83, // D3
    progression: [0, 10, 3, 7, 0, 10, 7, 0], // Dm C F A | Dm C A Dm
    kickPattern: [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1],
    leadArp: [0, 12, 5, 12],
    delayTime: 0.28,
  },
  {
    id: 'sky-drive',
    name: 'Sky Drive',
    bpm: 130,
    swing: 0.12,
    baseFreq: 130.81, // C3
    progression: [0, 7, 3, 10, 0, 5, 7, 0], // Cm G Eb Bb | Cm F G Cm
    kickPattern: [1,0,0,0, 1,0,0,1, 1,0,0,0, 1,0,0,1],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    leadArp: [0, 12, 7, 14],
    delayTime: 0.24,
  },
  {
    id: 'solar-dash',
    name: 'Solar Dash',
    bpm: 138,
    swing: 0.09,
    baseFreq: 138.59, // C#3/Db3
    progression: [0, 8, 3, 10, 0, 8, 5, 0], // C#m A E B | C#m A F# C#m
    kickPattern: [1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,0,0],
    snarePattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hatPattern:   [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1],
    leadArp: [0, 12, 16, 12],
    delayTime: 0.21,
  },
];


