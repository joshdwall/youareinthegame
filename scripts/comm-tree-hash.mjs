/** sha256 over the vendored communications files (sorted relative paths + contents, LF-normalised). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function treeHash(root, dirs) {
  const h = crypto.createHash('sha256');
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  for (const d of dirs) walk(path.join(root, d));
  for (const f of files.map((f) => path.relative(root, f).split(path.sep).join('/')).sort()) {
    h.update(`${f}\n`);
    h.update(fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n'));
  }
  return h.digest('hex');
}
