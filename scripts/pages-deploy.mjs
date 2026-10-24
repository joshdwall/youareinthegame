// CF-native Pages deploy (zero GitHub minutes). Usage: node scripts/pages-deploy.mjs preview
// Creds from Infisical (/cloudflare); every deploy is counted on the politics action counter.
import { execFileSync, spawnSync } from 'node:child_process';
import { cloudflareCreds, infisicalPath } from './cf-deploy-lib.mjs';
const mode = process.argv[2] || 'preview';
if (mode !== 'preview') throw new Error('Only "preview" is scripted; production promote requires explicit sign-off.');
const PROJECT = 'youareinthegame', BRANCH = process.env.PREVIEW_BRANCH || 'preview';
let ref = 'local'; try { ref = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim(); } catch {}
execFileSync('node', ['scripts/build.mjs'], { stdio: 'inherit' });
const s = await infisicalPath('/sites/politics');
const post = (operation) => fetch('https://joshdwall.com/politics/api/events', { method: 'POST',
  headers: { authorization: `Bearer ${s['site.politics.import_token']}`, 'content-type': 'application/json', 'x-politics-caller': 'cf-native-deploy' },
  body: JSON.stringify({ operation, caller: 'cf-native-deploy', detail: `preview ${PROJECT} ${ref}` }) });
let res = await post('worker-deploy'); if (res.status === 400) res = await post('pages-build');
const gate = await res.json().catch(() => ({}));
if (res.status === 429) throw new Error('Politics action counter at block line; not deploying');
if (!res.ok) throw new Error(`Usage counter HTTP ${res.status}; not deploying`);
console.log(`[usage] recorded preview ${PROJECT} ${ref} (allow=${gate.allow}${gate.warn ? ', WARN' : ''})`);
const cf = await cloudflareCreds();
const r = spawnSync('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', 'dist', '--project-name', PROJECT, '--branch', BRANCH, '--commit-hash', ref, '--commit-dirty=true'],
  { env: { ...process.env, CLOUDFLARE_API_TOKEN: cf.token, CLOUDFLARE_ACCOUNT_ID: cf.account }, encoding: 'utf8' });
process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
if (r.status !== 0) process.exit(r.status);
console.log(`Preview alias: https://${BRANCH}.${PROJECT}.pages.dev`);
