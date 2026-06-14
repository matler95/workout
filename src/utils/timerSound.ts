/**
 * timerSound.ts — Phase 5.1
 *
 * Generates timer-done and set-complete beep sounds using the Web Audio API.
 * No external files needed — all sounds are synthesized at runtime.
 *
 * Design choices:
 * - Uses AudioContext (created lazily on first call, requires user gesture first)
 * - Falls back silently if Web Audio is unavailable (older browsers, SSR)
 * - Offers two sounds: timerDone() and setComplete()
 * - Sound preference is persisted in localStorage under 'atlas_sound_enabled'
 */

// ─── Context singleton ────────────────────────────────────────────────────────

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx || _ctx.state === 'closed') {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _ctx;
  } catch {
    return null;
  }
}

// ─── Low-level tone helper ────────────────────────────────────────────────────

function beep(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  gainPeak: number = 0.3,
  type: OscillatorType = 'sine',
) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type      = type;
  osc.frequency.setValueAtTime(frequency, startTime);

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

// ─── Public sounds ────────────────────────────────────────────────────────────

/**
 * Play when the rest timer reaches zero.
 * Three rising tones → signals "time to go".
 */
export function playTimerDone(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    beep(ctx, 440, t,        0.12, 0.25);   // A4
    beep(ctx, 554, t + 0.15, 0.12, 0.25);   // C#5
    beep(ctx, 659, t + 0.30, 0.20, 0.30);   // E5 — held slightly longer
  } catch {
    // Ignore AudioContext errors (e.g. suspended before user gesture)
  }
}

/**
 * Play when a set is logged.
 * Single soft tick → confirms completion without being intrusive.
 */
export function playSetComplete(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const t = ctx.currentTime;
    beep(ctx, 880, t, 0.08, 0.15, 'sine');  // A5 — short, soft
  } catch {}
}

// ─── Preference persistence ───────────────────────────────────────────────────

const SOUND_PREF_KEY = 'atlas_sound_enabled';

export function getSoundEnabled(): boolean {
  try {
    const v = localStorage.getItem(SOUND_PREF_KEY);
    // Default ON — explicit 'false' string turns it off
    return v !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_PREF_KEY, String(enabled));
  } catch {}
}

/**
 * Guard wrapper: plays sound only when sound is enabled.
 */
export function maybePlayTimerDone(): void {
  if (getSoundEnabled()) playTimerDone();
}

export function maybePlaySetComplete(): void {
  if (getSoundEnabled()) playSetComplete();
}

/**
 * Warm up the AudioContext on the first user gesture.
 * Call this from a touch/click handler anywhere in the workout screen.
 * (iOS requires AudioContext.resume() inside a user gesture to unlock audio.)
 */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}
