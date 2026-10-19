export interface EffectPreferences { quality: 'auto' | 'low' | 'high'; reducedMotion: boolean }
export interface EffectProfile { glow: boolean; ripple: boolean; particles: number; motion: boolean }
const KEY = 'yierBubuEffectsV1';
let memory: EffectPreferences | undefined;
const listeners = new Set<() => void>();
const media = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
export function getEffectPreferences(): EffectPreferences {
  if (!memory) {
    memory = { quality: 'auto', reducedMotion: media('(prefers-reduced-motion: reduce)') };
    try {
      const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      if (['auto', 'low', 'high'].includes(value?.quality)) memory.quality = value.quality;
      if (typeof value?.reducedMotion === 'boolean') memory.reducedMotion = value.reducedMotion;
    } catch { /* Visual settings never block gameplay. */ }
  }
  return { ...memory };
}
export function setEffectPreferences(value: EffectPreferences): void {
  if (!['auto', 'low', 'high'].includes(value.quality) || typeof value.reducedMotion !== 'boolean') return;
  memory = { ...value };
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* Keep session preferences. */ }
  listeners.forEach((listener) => listener());
}
export function subscribeEffectPreferences(listener: () => void): () => void {
  listeners.add(listener); return () => listeners.delete(listener);
}
export function effectProfile(webgl: boolean, coarse = media('(pointer: coarse)'), preferences = getEffectPreferences()): EffectProfile {
  const high = webgl && (preferences.quality === 'high' || (preferences.quality === 'auto' && !coarse));
  return { glow: high, ripple: high && !preferences.reducedMotion,
    particles: preferences.quality === 'low' || !webgl ? 0.35 : high ? 1 : 0.6, motion: !preferences.reducedMotion };
}
