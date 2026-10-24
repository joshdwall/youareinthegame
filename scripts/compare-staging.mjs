#!/usr/bin/env node
// Hash-compare dist/ against a deployed origin (default youareinthegame-mvp staging).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const base = process.argv[2] || 'https://youareinthegame-mvp.pages.dev';
const dist = path.resolve('dist'); const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); e.isDirectory()?walk(p):files.push(p);} })(dist);
const h = b => crypto.createHash('sha256').update(b).digest('hex');
let same=0, diff=[], missing=[];
for (const f of files) {
  const rel = path.relative(dist,f).split(path.sep).map(encodeURIComponent).join('/');
  const r = await fetch(`${base}/${rel}`);
  if (!r.ok) { missing.push(`${r.status} ${rel}`); continue; }
  const remote = Buffer.from(await r.arrayBuffer());
  h(remote) === h(fs.readFileSync(f)) ? same++ : diff.push(rel);
}
console.log(JSON.stringify({ base, total: files.length, identical: same, different: diff, notOnRemote: missing }, null, 2));
