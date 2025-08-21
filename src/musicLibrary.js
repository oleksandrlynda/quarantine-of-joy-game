// Preset chiptune/8-bit drive songs for the playlist
// Each song customizes rhythm, harmony, tempo, and feel
// Drive A and Boss Standoff act as anchors while the other tracks
// reference a shared motif for a cohesive album vibe

export const SONGS = [
  {
    id: 'drive-a',
    name: 'Drive A',
    bpm: 132,
    swing: 0.12,
    baseFreq: 164.81, // E3
    progression: [0, 8, 3, 10, 0, 8, 10, 0], // Em C G D | Em C D Em
    kickPattern: [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0], // syncopated kicks on 1a,2e,3a,4e
    snarePattern: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // snare on 1&,2,3&,4
    hatPattern:   [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    clapPattern:  [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0], // claps on 2& and 4&
    ridePattern:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // ride on beats 1 and 3
    stabPattern:  [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], // stabs on 1,2&,3,4&
    leadArp: [0, 12, 7, 12],
    delayTime: 0.23,
    variations: { hat: 0.1, kick: 0.05 },
  },
  {
    id: 'drive-b',
    name: 'Drive B',
    bpm: 136,
    swing: 0.1,
    baseFreq: 174.61, // F3
    progression: [0, 5, 10, 7, 0, 7, 10, 0], // Fm Bb Eb C | Fm C Eb Fm - dorian chase
    kickPattern: [1,0,0,0, 0,1,0,0, 1,0,0,1, 0,0,1,0], // syncopated kick on 2e & 4&
    snarePattern: [0,0,0,1, 1,0,0,0, 0,0,0,1, 1,0,0,0], // snare on 1a,2,3a,4
    hatPattern:   [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0], // busier
    clapPattern:  [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0], // claps on 1a and 3a
    ridePattern:  [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], // ride on quarter notes
    stabPattern:  [0,0,1,0, 0,0,0,1, 0,0,1,0, 1,0,0,0], // stabs on 1&,2a,3&,4
    leadArp: [0, 7, 12, 9],
    delayTime: 0.21,
    variations: { hat: 0.15, clap: 0.05 },
  },
  {
    id: 'night-glide',
    name: 'Night Glide',
    bpm: 124,
    swing: 0.16,
    baseFreq: 155.56, // D#3/Eb3
    progression: [3, 10, 0, 8, 0, 10, 8, 0], // Gb Db Eb Cb | Ebm Db Cb Ebm - dreamy mixolydian drift
    kickPattern: [1,0,0,0, 0,1,0,0, 1,0,1,0, 0,0,1,0], // kick on 1,2e,3&,4&
    snarePattern: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1], // snare on 2,2a,4,4a
    hatPattern:   [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1], // syncopated
    clapPattern:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 1,0,0,0], // claps on 2a and 4
    ridePattern:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0], // ride on off-beat &s
    stabPattern:  [0,1,0,0, 0,0,1,0, 0,0,0,1, 0,0,1,0], // airy stabs on 1e,2&,3a,4&
    leadArp: [3, 15, 10, 15],
    delayTime: 0.27,
  },
  {
    id: 'sunset-rush',
    name: 'Sunset Rush',
    bpm: 140,
    swing: 0.08,
    baseFreq: 146.83, // D3
    progression: [7, 3, 10, 5, 0, 7, 3, 0], // A F C G | Dm A F Dm - mixolydian ride
    kickPattern: [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0], // kick adds 1a,2&,3a,4&
    snarePattern: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // snare on 1&,2,3&,4
    hatPattern:   [1,1,1,0, 1,0,1,1, 1,1,1,0, 1,0,1,1],
    clapPattern:  [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0], // claps on every &
    ridePattern:  [0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,1], // ride on every a
    stabPattern:  [0,0,0,1, 1,0,1,0, 0,0,0,1, 1,0,0,0], // stabs on 1a,2,2&,3a,4
    leadArp: [7, 14, 19, 14],
    delayTime: 0.19,
  },
  {
    id: 'boss-standoff',
    name: 'Boss Standoff',
    bpm: 128,
    swing: 0.06,
    baseFreq: 155.56, // Eb3
    progression: [0, 0, 10, 0, 0, 3, 10, 0], // pedal root with dark turns
    kickPattern: [1,0,1,0, 1,0,1,1, 1,0,1,0, 1,0,1,1], // driving 8ths with 2a & 4a
    snarePattern: [0,0,0,0, 1,0,0,1, 0,1,0,0, 1,0,0,1], // snare on 2,2a,3e,4,4a
    hatPattern:   [1,1,1,1, 1,0,1,1, 1,1,1,1, 1,0,1,1],
    clapPattern:  [0,0,0,0, 0,1,0,1, 0,0,0,0, 0,1,0,1], // claps on 2e/2a/4e/4a
    ridePattern:  [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1], // busy ride for tension
    stabPattern:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // relentless 8ths
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
    progression: [2, 9, 5, 0, 0, 5, 7, 3], // F# C# A E | Em A B G - Lydian lift into minor race
    kickPattern: [1,0,0,1, 1,0,1,0, 1,0,0,1, 0,1,0,0], // kick adds 1a & 4e
    snarePattern: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0], // snare on 2,2&,4,4&
    hatPattern:   [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    clapPattern:  [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], // claps on beats 2 and 4
    ridePattern:  [1,0,0,1, 1,0,0,1, 1,0,0,1, 1,0,0,1], // ride on beat and a
    stabPattern:  [0,1,0,0, 1,0,0,0, 0,1,0,0, 1,0,0,0], // stabs on 1e,2,3e,4
    leadArp: [2, 9, 14, 9],
    delayTime: 0.22,
  },
  {
    id: 'midnight-highway',
    name: 'Midnight Highway',
    bpm: 126,
    swing: 0.14,
    baseFreq: 174.61, // F3
    progression: [5, 10, 3, 8, 0, 7, 5, 3], // Bb Eb Ab Db | Fm C Bb Ab - midnight cruise with flat-seven descent
    kickPattern: [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1], // kick with 2a & 4a accents
    snarePattern: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // snare on 1&,2,3&,4
    hatPattern:   [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0],
    clapPattern:  [0,0,0,1, 0,0,1,0, 0,0,0,1, 0,0,1,0], // claps on 1a,2&,3a,4&
    ridePattern:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // ride steady 8ths
    stabPattern:  [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,1,0,0], // stabs on 1,2e,3&,4e
    leadArp: [5, 12, 10, 12],
    delayTime: 0.26,
  },
  {
    id: 'neon-sprint',
    name: 'Neon Sprint',
    bpm: 142,
    swing: 0.08,
    baseFreq: 155.56, // Eb3
    progression: [7, 2, 9, 5, 0, 10, 7, 0], // Bb F C Ab | Ebm Db Bb Ebm - pentatonic sprint
    kickPattern: [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0], // kick adds 1a,2&,3a,4&
    snarePattern: [0,0,0,0, 1,0,1,0, 0,0,0,0, 1,0,1,0], // snare on 2,2&,4,4&
    hatPattern:   [1,1,1,0, 1,0,1,1, 1,1,1,0, 1,0,1,1],
    clapPattern:  [0,0,0,0, 0,0,1,0, 0,0,0,0, 1,0,0,0], // claps on 2& and 4
    ridePattern:  [1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1], // driving ride pattern
    stabPattern:  [0,1,0,0, 1,0,1,0, 0,1,0,0, 1,0,1,0], // stabs on 1e,2,2&,3e,4,4&
    leadArp: [7, 14, 9, 14],
    delayTime: 0.2,
  },
  {
    id: 'pixel-pulse',
    name: 'Pixel Pulse',
    bpm: 120,
    swing: 0.18,
    baseFreq: 146.83, // D3
    progression: [2, 5, 0, 10, 0, 10, 5, 0], // E G D C | Dm C F Dm - quirky lydian spark
    kickPattern: [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,0,1,0], // kick on 1a,2&,3a,4&
    snarePattern: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // snare on 1&,2,3&,4
    hatPattern:   [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1],
    clapPattern:  [0,1,0,0, 1,0,0,0, 0,1,0,0, 1,0,0,0], // claps on 1e,2,3e,4
    ridePattern:  [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0], // ride with extra a accents
    stabPattern:  [1,0,1,0, 0,0,0,1, 1,0,1,0, 0,0,0,1], // quirky stabs on 1,1&,2a,3,3&,4a
    leadArp: [2, 14, 7, 14],
    delayTime: 0.28,
  },
  {
    id: 'sky-drive',
    name: 'Sky Drive',
    bpm: 130,
    swing: 0.12,
    baseFreq: 130.81, // C3
    progression: [5, 0, 8, 3, 0, 5, 7, 0], // F C Ab Eb | Cm F G Cm - minor blues ascent
    kickPattern: [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1], // kick on 1&,2a,3&,4a
    snarePattern: [0,0,0,0, 1,0,0,1, 0,0,0,0, 1,0,0,1], // snare on 2,2a,4,4a
    hatPattern:   [1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0],
    clapPattern:  [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,1,0], // claps on 2a and 4&
    ridePattern:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], // ride on beats 1 and 3
    stabPattern:  [1,0,0,1, 0,1,0,0, 1,0,0,1, 0,1,0,0], // bluesy stabs on 1,1a,2e,3,3a,4e
    leadArp: [5, 12, 8, 12],
    delayTime: 0.24,
  },
  {
    id: 'solar-dash',
    name: 'Solar Dash',
    bpm: 138,
    swing: 0.09,
    baseFreq: 138.59, // C#3/Db3
    progression: [11, 7, 0, 6, 0, 8, 5, 0], // G# F# C# A# | C#m A F# C#m - angular phrygian dash
    kickPattern: [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,1,0], // kick adds 2a & 4&
    snarePattern: [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // snare on 1&,2,3&,4
    hatPattern:   [1,1,0,1, 1,0,1,1, 1,1,0,1, 1,0,1,1],
    clapPattern:  [0,0,1,0, 1,0,0,0, 0,0,1,0, 1,0,0,0], // claps on 1&,2,3&,4
    ridePattern:  [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1], // ride with extra 4& accents
    stabPattern:  [0,0,1,0, 1,0,0,0, 0,1,0,0, 1,0,0,1], // angular stabs on 1&,2,3e,4,4a
    leadArp: [11, 18, 7, 18],
    delayTime: 0.21,
  },
  {
    id: 'twilight-echo',
    name: 'Twilight Echo',
    bpm: 128,
    swing: 0.1,
    baseFreq: 164.81, // E3
    progression: [9, 5, 0, 7, 0, 5, 10, 0], // C# A E B | Em A D Em - drifting pop cadence
    kickPattern: [1,0,0,1, 1,0,1,0, 1,0,0,1, 1,0,1,0], // kick adds 1a,2&,3a,4&
    snarePattern: [0,0,0,1, 1,0,0,0, 0,0,0,1, 1,0,0,0], // snare on 1a,2,3a,4
    hatPattern:   [1,0,1,0, 1,0,0,1, 1,0,1,0, 1,0,0,1],
    clapPattern:  [0,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], // claps on 2&,3,4&
    ridePattern:  [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], // ride on every &
    stabPattern:  [1,0,0,0, 0,1,0,1, 0,0,1,0, 1,0,0,0], // stabs on 1,2e,2a,3&,4
    leadArp: [9, 16, 14, 16],
    delayTime: 0.22,
  },
];


