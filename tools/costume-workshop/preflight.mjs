import fs from 'node:fs';
import path from 'node:path';
import { fingerprint, makePrompt, validate } from './workshop.mjs';

export function preflight(recipe, config, root, state = {}) {
  validate(recipe);
  const missing = [];
  const items = recipe.accessories.map(item => {
    for (const field of ['source', 'guide']) {
      if (!item[field]) continue;
      const resolved = path.resolve(root, item[field]);
      if (!resolved.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        missing.push(`${item.id}: ${field} file unavailable`);
      }
    }
    let signature;
    try { signature = fingerprint(item, config); } catch { /* Missing file is reported once above. */ }
    const prior = state[item.id];
    const reuse = signature && prior?.signature === signature && prior.status === 'ready' && fs.existsSync(prior.file || '');
    return { id: item.id, operation: reuse ? 'reuse-prepared' : item.source ? 'prepare-existing' : 'generate',
      prompt: item.source || reuse ? null : makePrompt(item) };
  });
  if (items.some(item => item.operation === 'generate')) {
    for (const field of ['generatorExe', 'generatorModel']) {
      if (!config[field] || !fs.existsSync(path.resolve(root, config[field]))) missing.push(`${field} unavailable`);
    }
  }
  return { ok: missing.length === 0, missing, items,
    generationCalls: items.filter(item => item.operation === 'generate').length,
    reusedItems: items.filter(item => item.operation === 'reuse-prepared').length };
}
