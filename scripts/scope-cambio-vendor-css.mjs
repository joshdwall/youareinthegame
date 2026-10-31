#!/usr/bin/env node
/**
 * Scope CoreUI + enVivo CSS under #cambioRoot so Cambio chrome cannot paint the public stage.
 * Writes cambio/vendor/scoped/*.scoped.css
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCOPE = '#cambioRoot';
const OUT = path.join(ROOT, 'cambio/vendor/scoped');
const COREUI_URL = 'https://cdn.jsdelivr.net/npm/@coreui/coreui@5.2.0/dist/css/coreui.min.css';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function scopeSelector(sel) {
  let s = sel.trim();
  if (!s) return s;
  if (s.includes(SCOPE)) return s;
  if (/^(:root|html|body)(?=[[.:#\s>]|$)/.test(s)) {
    return s.replace(/^(:root|html|body)/, SCOPE);
  }
  if (/^\[data-(coreui|ev|bs)-theme/.test(s)) return SCOPE + s;
  if (s.startsWith('@')) return s;
  if (/^(from|to|\d+%)$/.test(s)) return s;
  return `${SCOPE} ${s}`;
}

function scopeSelectorList(list) {
  return list.split(',').map(scopeSelector).join(',');
}

function extractKeyframes(css) {
  const frames = [];
  let out = '';
  let i = 0;
  while (i < css.length) {
    const idx = css.slice(i).search(/@(-webkit-)?keyframes\s+/);
    if (idx < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, i + idx);
    let j = i + idx;
    const brace = css.indexOf('{', j);
    let depth = 0;
    let k = brace;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') {
        depth--;
        if (depth === 0) {
          k++;
          break;
        }
      }
    }
    frames.push(css.slice(j, k));
    out += `<<<KF${frames.length - 1}>>>`;
    i = k;
  }
  return { css: out, frames };
}

function processRules(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      out += css[i++];
      continue;
    }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2);
      const e = end < 0 ? css.length : end + 2;
      out += css.slice(i, e);
      i = e;
      continue;
    }
    if (css[i] === '@') {
      const headerEnd = css.slice(i).search(/[{;]/);
      if (headerEnd < 0) {
        out += css.slice(i);
        break;
      }
      const header = css.slice(i, i + headerEnd);
      const abs = i + headerEnd;
      if (css[abs] === ';') {
        out += header + ';';
        i = abs + 1;
        continue;
      }
      let depth = 0;
      let k = abs;
      for (; k < css.length; k++) {
        if (css[k] === '{') depth++;
        else if (css[k] === '}') {
          depth--;
          if (depth === 0) {
            k++;
            break;
          }
        }
      }
      const inner = css.slice(abs + 1, k - 1);
      if (/^@(media|supports|layer|document)\b/.test(header.trim())) {
        out += header + '{' + processRules(inner) + '}';
      } else {
        out += header + '{' + inner + '}';
      }
      i = k;
      continue;
    }
    if (css.startsWith('<<<KF', i)) {
      const end = css.indexOf('>>>', i) + 3;
      out += css.slice(i, end);
      i = end;
      continue;
    }
    const open = css.indexOf('{', i);
    if (open < 0) {
      out += css.slice(i);
      break;
    }
    const selectors = css.slice(i, open).trim();
    let depth = 0;
    let k = open;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') {
        depth--;
        if (depth === 0) {
          k++;
          break;
        }
      }
    }
    const decls = css.slice(open + 1, k - 1);
    if (selectors.startsWith('<<<KF')) out += selectors + '{' + decls + '}';
    else if (selectors) out += scopeSelectorList(selectors) + '{' + decls + '}';
    i = k;
  }
  return out;
}

function scopeCss(css) {
  css = css.replace(/\/\*# sourceMappingURL=.*?\*\//g, '');
  const { css: stripped, frames } = extractKeyframes(css);
  let scoped = processRules(stripped);
  scoped = scoped.replace(/<<<KF(\d+)>>>/g, (_, n) => frames[Number(n)]);
  return `/* scoped to ${SCOPE} — Cambio overlay isolation */\n` + scoped;
}

function adaptEnvivo(css) {
  return css
    .replaceAll('html[data-coreui-theme', `${SCOPE}[data-coreui-theme`)
    .replaceAll('html[data-ev-theme', `${SCOPE}[data-ev-theme`)
    .replaceAll('html[data-ev-paint-surfaces', `${SCOPE}[data-ev-paint-surfaces`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const coreui = await fetchUrl(COREUI_URL);
  fs.writeFileSync(path.join(OUT, 'coreui.scoped.css'), scopeCss(coreui).replaceAll('#cambioRoot .ev-compact', '#cambioRoot.ev-compact'));
  const pairs = [
    ['cambio/vendor/envivo-ui/tokens/envivo-tokens.css', 'envivo-tokens.scoped.css'],
    ['cambio/vendor/envivo-ui/ev-scroll-list/ev-scroll-list.css', 'ev-scroll-list.scoped.css'],
    ['cambio/vendor/envivo-ui/sidebar-shell.css', 'sidebar-shell.scoped.css'],
  ];
  for (const [src, dest] of pairs) {
    const css = adaptEnvivo(fs.readFileSync(path.join(ROOT, src), 'utf8'));
    fs.writeFileSync(path.join(OUT, dest), scopeCss(css).replaceAll('#cambioRoot .ev-compact', '#cambioRoot.ev-compact'));
  }
  console.log('[scope-cambio-vendor-css] wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
