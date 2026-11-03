import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validate,toSite,makePrompt,fingerprint} from './workshop.mjs';
const p=JSON.parse(fs.readFileSync(new URL('./costume.json',import.meta.url)));
test('draft retains placement and never publishes automatically',()=>{const d=toSite(p);assert.equal(d.animation.live,false);assert.deepEqual(d.placements.elements.bandana.objectAnchor,p.accessories[0].placement.objectAnchor);assert.equal(d.animation.elements[0].defaultWidthFrac,p.accessories[0].placement.scale);});
test('rejects unsafe paths, duplicate ids and invalid geometry',()=>{for(const mutate of [q=>q.id='../escape',q=>q.accessories.push(q.accessories[0]),q=>q.accessories[0].source='../secret.png',q=>q.accessories[0].placement.scale=NaN,q=>q.accessories[0].placement.objectAnchor.x=2]){const q=structuredClone(p);mutate(q);assert.throws(()=>validate(q));}});
test('generation instructions enforce isolated accessory',()=>{const q=makePrompt(p.accessories[0]);assert.match(q.prompt,/single isolated accessory only/);assert.match(q.negativePrompt,/character/);});
test('moving an accessory reuses artwork; changing seed regenerates',()=>{const a=structuredClone(p.accessories[0]),before=fingerprint(a,{});a.placement.scale=.8;a.placement.characterAnchor.x=.6;assert.equal(fingerprint(a,{}),before);a.seed++;assert.notEqual(fingerprint(a,{}),before);});
