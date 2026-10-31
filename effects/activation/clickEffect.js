/**
 * Resolve an animation's clickEffect (per-click character burst before threshold).
 *
 * Schema (optional on animation manifest):
 *   clickEffect: {
 *     type: 'ghost-spores' | 'composite-spores' | 'image-spores',
 *     sporeImage?: string,   // for image-spores / override
 *     count?: number,
 *     scale?: number         // composite mini size vs character width
 *   }
 *
 * Default derivation:
 *   - elements.length > 0  → composite-spores (mini replicas of composited character)
 *   - else                 → ghost-spores
 */

export function resolveClickEffect(animation) {
  if (!animation) return { type: 'ghost-spores' };
  const raw = animation.clickEffect;
  if (raw && typeof raw === 'object' && raw.type) {
    return {
      type: raw.type,
      sporeImage: raw.sporeImage || null,
      count: raw.count ?? 16,
      scale: raw.scale ?? 0.18
    };
  }
  const hasElements = Array.isArray(animation.elements) && animation.elements.length > 0;
  if (hasElements || animation.playMode === 'character-overlay' || animation.overlayFlashMode === 'composite') {
    return { type: 'composite-spores', count: 16, scale: 0.18, sporeImage: null };
  }
  return { type: 'ghost-spores', count: 16, scale: null, sporeImage: null };
}

export default { resolveClickEffect };
