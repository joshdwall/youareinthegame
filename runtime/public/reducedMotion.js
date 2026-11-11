/**
 * Live Reduce Motion profile for spore / activation timing.
 * Defaults match Reduce Motion off (timeScale 1 = equal speed).
 * Values come from runtime-config settings.reducedMotion (Cambio / KV)
 * with code defaults when the key is missing, so production stays safe
 * without a KV write.
 */

export const DEFAULT_REDUCED_MOTION = Object.freeze({
  timeScale: 1,
  sporeCount: null,
  equipMs: null,
  activationMs: null,
  exitMs: null,
  fadeMs: null,
  explodeMs: null,
  fireworkLifespanSec: null,
  fireworkSpeedScale: 1,
  skipLightning: false,
  skipBehaviors: false,
  skipMainCharacterLaunch: false,
  freezeBurst: false
});

function clampNum(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalNum(value, min, max) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** @param {unknown} raw */
export function normalizeReducedMotion(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const sporeCount = optionalNum(src.sporeCount, 0, 32);
  return {
    timeScale: clampNum(src.timeScale, 1, 0.05, 8),
    sporeCount: sporeCount == null ? null : Math.floor(sporeCount),
    equipMs: optionalNum(src.equipMs, 0, 10000),
    activationMs: optionalNum(src.activationMs, 0, 10000),
    exitMs: optionalNum(src.exitMs, 0, 10000),
    fadeMs: optionalNum(src.fadeMs, 0, 10000),
    explodeMs: optionalNum(src.explodeMs, 0, 10000),
    fireworkLifespanSec: optionalNum(src.fireworkLifespanSec, 0.05, 30),
    fireworkSpeedScale: clampNum(src.fireworkSpeedScale, 1, 0, 8),
    skipLightning: src.skipLightning === true,
    skipBehaviors: src.skipBehaviors === true,
    skipMainCharacterLaunch: src.skipMainCharacterLaunch === true,
    freezeBurst: src.freezeBurst === true
  };
}

let liveProfile = { ...DEFAULT_REDUCED_MOTION };
let prefersReduce = false;
let watching = false;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn(prefersReduce, liveProfile); } catch (_) { /* ignore */ }
  }
}

function readMedia() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Subscribe to OS Reduce Motion and keep a live flag. Safe to call more than once. */
export function initReducedMotionWatch() {
  prefersReduce = readMedia();
  if (watching || typeof matchMedia !== 'function') return;
  watching = true;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    prefersReduce = mq.matches;
    emit();
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
  else if (typeof mq.addListener === 'function') mq.addListener(onChange);
}

/** @param {unknown} raw */
export function setLiveReducedMotionConfig(raw) {
  liveProfile = normalizeReducedMotion(raw);
  emit();
  return liveProfile;
}

export function getReducedMotionProfile() {
  return liveProfile;
}

export function prefersReducedMotion() {
  if (!watching) prefersReduce = readMedia();
  return prefersReduce;
}

/** Snapshot at the start of an activation so in-flight timing stays stable. */
export function snapshotReducedMotion() {
  if (!watching) prefersReduce = readMedia();
  return { prefersReduce, profile: { ...liveProfile } };
}

/**
 * @param {boolean} prefers
 * @param {typeof DEFAULT_REDUCED_MOTION} profile
 * @param {number} ms
 * @param {number|null|undefined} overrideMs
 */
export function scaleReducedTime(prefers, profile, ms, overrideMs) {
  if (overrideMs != null && Number.isFinite(Number(overrideMs))) {
    return Math.max(0, Number(overrideMs));
  }
  const base = Math.max(0, Number(ms) || 0);
  if (!prefers) return base;
  return base * (profile?.timeScale ?? 1);
}

/** @param {(prefers: boolean, profile: object) => void} fn */
export function onReducedMotionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export default {
  DEFAULT_REDUCED_MOTION,
  normalizeReducedMotion,
  initReducedMotionWatch,
  setLiveReducedMotionConfig,
  getReducedMotionProfile,
  prefersReducedMotion,
  snapshotReducedMotion,
  scaleReducedTime,
  onReducedMotionChange
};
