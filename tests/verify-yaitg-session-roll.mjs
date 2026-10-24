#!/usr/bin/env node
/**
 * Smoke test — session roll produces valid assignment shape.
 */
import assert from 'node:assert/strict';
import {
  rollNewAssignment,
  buildOverrideAssignment
} from '../functions/_shared/session-roll.js';

const policy = { sessionTtlHours: 6, characterSelection: { mode: 'weighted' } };
const charactersRegistry = {
  defaultCharacterId: 'mushroom',
  characters: [
    { id: 'mushroom', visibleOnSite: true, weight: 10, allowedVignetteIds: ['spores'], defaultVignetteId: 'spores' },
    { id: 'pirate-mushroom', visibleOnSite: true, weight: 5, allowedVignetteIds: ['cannons'], defaultVignetteId: 'cannons' }
  ]
};
const vignettesRegistry = {
  defaultVignetteId: 'spores',
  vignettes: [
    { id: 'spores', visibleInPool: true, weight: 10, transitions: { pool: ['lightning'], weights: { lightning: 1 } } },
    { id: 'cannons', visibleInPool: true, weight: 5, transitions: { pool: ['feather-poof'], weights: { 'feather-poof': 1 } } }
  ]
};

const a = rollNewAssignment(policy, charactersRegistry, vignettesRegistry);
assert.ok(a.characterId);
assert.ok(a.vignetteId);
assert.ok(a.expiresAt);

const vignetteOnly = buildOverrideAssignment(policy, charactersRegistry, vignettesRegistry, {
  characterId: 'pirate-mushroom',
  vignetteId: 'cannons'
});
assert.equal(vignetteOnly.source, 'url-override');
assert.equal(vignetteOnly.vignetteId, 'cannons');
assert.equal(vignetteOnly.transitionId, null, 'vignette-only override must not auto-roll transition');

const withTransition = buildOverrideAssignment(policy, charactersRegistry, vignettesRegistry, {
  characterId: 'mushroom',
  vignetteId: 'spores',
  transitionId: 'lightning'
});
assert.equal(withTransition.transitionId, 'lightning');

console.log('[verify-yaitg-session-roll] OK', a.characterId, a.vignetteId);
