/** Read-aloud with the Web Speech API. Prefers an en-AU voice, then any English voice. Hidden when unsupported. */

export interface VoiceLike { lang: string; name: string; default?: boolean }

/** Pick the best voice: en-AU first, then other English (en-GB, en-NZ, en-US...), else null (let the browser choose). */
export function pickVoice<T extends VoiceLike>(voices: T[]): T | null {
  const norm = (l: string) => l.replace('_', '-').toLowerCase();
  return voices.find((v) => norm(v.lang) === 'en-au')
    ?? voices.find((v) => norm(v.lang).startsWith('en-au'))
    ?? voices.find((v) => norm(v.lang).startsWith('en'))
    ?? null;
}

export const speechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let speaking = false;
const listeners = new Set<(on: boolean) => void>();
const emit = (on: boolean) => { speaking = on; listeners.forEach((f) => f(on)); };
export const onSpeaking = (f: (on: boolean) => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const isSpeaking = () => speaking;

export function stop(): void {
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
  emit(false);
}

export function speak(text: string): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(synth.getVoices());
  u.lang = v?.lang ?? 'en-AU';
  if (v) u.voice = v;
  u.rate = 0.9;
  u.onend = () => emit(false);
  u.onerror = () => emit(false);
  emit(true);
  synth.speak(u);
}
