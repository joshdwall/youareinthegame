import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSHROOM_RIG, validateActions } from '../../runtime/costumes/contracts.js';

export function auditAnimations(snapshot) {
  const animations = new Map();
  for (const animation of [...(snapshot.animations || []), ...(snapshot.directAnimations || [])]) {
    if (!animations.has(animation.id)) animations.set(animation.id, animation);
  }
  const findings = [], assets = new Map(), references = {};
  let elements = 0, variants = 0;
  for (const animation of animations.values()) {
    const outfits = [{ name: 'primary', elements: animation.elements || [], layout: snapshot.placementsByAnimation?.[animation.id]?.elements || {} }];
    if (animation.secondaryCostume?.elements) {
      variants++;
      outfits.push({ name: 'secondary', elements: animation.secondaryCostume.elements, layout: {} });
    }
    if (!animation.rigRef) findings.push({ animation: animation.id, code: 'LEGACY_RIG', severity: 'migration' });
    for (const outfit of outfits) {
      const ids = new Set();
      for (const element of outfit.elements) {
        elements++;
        const location = { animation: animation.id, outfit: outfit.name, element: element.id };
        const report = (code, severity = 'review') => findings.push({ ...location, code, severity });
        if (ids.has(element.id)) report('DUPLICATE_ELEMENT_ID', 'error');
        ids.add(element.id);
        const placement = outfit.layout[element.id] || element.placement;
        if (!placement) report('PLACEMENT_UNAVAILABLE');
        else {
          if (!Number.isFinite(placement.scale) || placement.scale <= 0) report('INVALID_SCALE', 'error');
          if (!['foreground', 'behind-character'].includes(placement.layer)) report('LAYER_UNSPECIFIED');
          const point = placement.attachment?.point || element.anchor;
          if (point === 'manual') report('MANUAL_PLACEMENT', 'migration');
          else if (!point && placement.characterAnchor) report('LEGACY_ABSOLUTE_PLACEMENT', 'migration');
          else if (!MUSHROOM_RIG.anchors[point === 'bill' ? 'mouth' : point]) report('UNKNOWN_ANCHOR', 'error');
          if (placement.attachment && placement.characterAnchor) report('DUAL_ANCHOR_AUTHORITY');
          try { validateActions(placement.objectActions || []); } catch (error) { report('INVALID_ACTION', 'error'); }
        }
        if (!element.asset) report('UNVERSIONED_ASSET', 'migration');
        if (element.src) {
          const uses = assets.get(element.src) || [];
          uses.push(location);
          assets.set(element.src, uses);
        }
        references[`${animation.id}/${outfit.name}/${element.id}`] = {
          asset: element.asset || null, src: element.src || null, placement: placement || null
        };
      }
    }
  }
  return { scope: 'Public catalog snapshot, including returned secondary costumes. Private drafts and binary image quality require a separate authenticated review.',
    counts: { animations: animations.size, secondaryCostumes: variants, elements, uniqueAssetUrls: assets.size },
    findings, reusableAssets: [...assets].filter(([, uses]) => uses.length > 1).map(([src, uses]) => ({ src, uses })), references };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node audit.mjs <saved-runtime-catalog.json> [report.json]');
  const report = auditAnimations(JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '')));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ counts: report.counts, findings: report.findings.length, errors: report.findings.filter(row => row.severity === 'error').length }));
  if (report.findings.some(row => row.severity === 'error')) process.exitCode = 1;
}
