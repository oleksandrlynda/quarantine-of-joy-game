export const THUNDER_NOISE_SECONDS = 0.5;

export function getThunderNoiseBuffer(audioContext, cache, rng = Math.random) {
  if (!audioContext || !cache) return null;
  const sampleRate = Math.max(1, Math.floor(audioContext.sampleRate || 44100));
  if (cache.buffer && cache.sampleRate === sampleRate) return cache.buffer;

  const bufferSize = Math.max(1, Math.floor(sampleRate * THUNDER_NOISE_SECONDS));
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rng() * 2 - 1;

  cache.sampleRate = sampleRate;
  cache.buffer = buffer;
  return buffer;
}
