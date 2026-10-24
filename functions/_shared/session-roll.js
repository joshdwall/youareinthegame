/**
 * Weighted random + assignment roll — shared by Pages Function and local gateway.
 */

/**
 * @param {Array<{ id: string, weight?: number }>} entries
 * @returns {string|null}
 */
export function weightedPickId(entries) {
  if (!entries?.length) return null;
  const pool = [];
  for (const entry of entries) {
    const w = Math.max(0, Number(entry.weight ?? 1));
    for (let i = 0; i < w; i++) pool.push(entry.id);
  }
  if (!pool.length) return entries[0].id;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * @param {string[]} ids
 * @param {Record<string, number>} weights
 */
export function weightedPickFromPool(ids, weights = {}) {
  const entries = ids.map((id) => ({ id, weight: weights[id] ?? 1 }));
  return weightedPickId(entries);
}

/**
 * @param {object} policy
 * @param {object} charactersRegistry
 * @param {object} vignettesRegistry
 */
export function rollNewAssignment(policy, charactersRegistry, vignettesRegistry) {
  const chars = (charactersRegistry.characters || []).filter((c) => c.visibleOnSite !== false);
  const characterId =
    policy?.characterSelection?.mode === 'weighted'
      ? weightedPickId(chars) || charactersRegistry.defaultCharacterId
      : charactersRegistry.defaultCharacterId;

  const character = chars.find((c) => c.id === characterId) || chars[0];
  const allowed = character?.allowedVignetteIds || [];
  const vignetteCandidates = (vignettesRegistry.vignettes || []).filter(
    (v) => allowed.includes(v.id) && v.visibleInPool !== false
  );
  const vignetteId =
    weightedPickId(vignetteCandidates) ||
    character?.defaultVignetteId ||
    vignettesRegistry.defaultVignetteId;

  const vignette = vignetteCandidates.find((v) => v.id === vignetteId);
  const transitionId = vignette?.transitions?.pool?.length
    ? weightedPickFromPool(vignette.transitions.pool, vignette.transitions.weights)
    : null;

  const ttlHours = Number(policy?.sessionTtlHours ?? 6);
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  return {
    characterId,
    vignetteId,
    transitionId,
    expiresAt,
    source: 'roll',
    assignmentVersion: 1
  };
}

/**
 * @param {object} policy
 * @param {object} charactersRegistry
 * @param {object} vignettesRegistry
 * @param {{ characterId?: string, vignetteId?: string, transitionId?: string }} override
 */
export function buildOverrideAssignment(policy, charactersRegistry, vignettesRegistry, override) {
  const character =
    charactersRegistry.characters.find((c) => c.id === override.characterId) ||
    charactersRegistry.characters.find((c) => c.isSiteDefault) ||
    charactersRegistry.characters[0];
  const characterId = override.characterId || character.id;
  const charRow = charactersRegistry.characters.find((c) => c.id === characterId) || character;
  const vignetteId =
    override.vignetteId || charRow.defaultVignetteId || vignettesRegistry.defaultVignetteId;
  // URL / harness override: only set transition when caller/query supplies it.
  // Do not auto-roll a transition (that would auto-play on every vignette Preview).
  let transitionId = null;
  if (Object.prototype.hasOwnProperty.call(override, 'transitionId')) {
    transitionId = override.transitionId || null;
  }
  return {
    characterId,
    vignetteId,
    transitionId,
    expiresAt: null,
    source: 'url-override',
    assignmentVersion: 1
  };
}

/**
 * @param {string} ip
 */
export function hashIp(ip) {
  if (!ip) return 'unknown';
  return `ip:${ip.replace(/^::ffff:/, '')}`;
}
