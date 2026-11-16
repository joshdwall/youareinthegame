/**
 * Polls API (shared/communications). Framework-free: give it a Request, get a Response. Pages Functions, Pages advanced
 * mode and Workers all use it the same way.
 *
 *   const polls = createPollsApi({ config, env });          // config = communications.v1, env has the D1 binding
 *   polls.match(url.pathname)  -> { pollId, action } | null  // <basePath>/polls/:pollId[/vote|/totals|/responses]
 *   await polls.handle(request, { pollId, action })          // -> Response
 *   await polls.recordAnswer(request, pollId, value, { source })  // e.g. Message Us "How did you hear" -> vote (never throws)
 *
 * Routes (JSON, cache-control no-store):
 *   GET  …/polls/:id            poll (active options) + this browser's answer; sets the voter cookie when missing
 *   POST …/polls/:id/vote       { optionId } (or legacy { answer }) -> { ok, answer }; first answer is kept, never changed
 *   GET  …/polls/:id/totals     { ok, totals, total }; public only when poll.publicResults, else Bearer <env[results.tokenEnv]>
 *   GET  …/polls/:id/responses  { ok, items }; Bearer only (or options.isAdmin(request))
 * Errors: 400 bad option · 401 private · 403 cross-origin · 404 unknown poll · 409 no cookie / closed · 429 limited · 503 storage.
 */
import { DEFAULTS, findPoll, activeOptions, publicPoll, voterSettings } from './config.mjs';
import { voterId, voterKey, newVoterCookie } from './voter.mjs';
import { createD1PollStore } from './d1-store.mjs';
import { ipKey, minuteLimited, safeEqual } from './spam.mjs';

const reply = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'cache-control': 'no-store', ...headers } });

export function createPollsApi({ config, env = {}, store = null, isAdmin = null } = {}) {
  const base = (config?.basePath || DEFAULTS.basePath).replace(/\/+$/, '');
  const voter = voterSettings(config);
  const getStore = () => {
    if (store) return store;
    const db = env[config?.storage?.binding];
    return db ? createD1PollStore(db, config.storage, { siteId: config.siteId }) : null;
  };

  async function privileged(request) {
    const name = config?.results?.tokenEnv;
    const token = name ? env[name] : '';
    const auth = request.headers.get('authorization') || '';
    if (token && auth.startsWith('Bearer ') && safeEqual(auth.slice(7), token)) return true;
    return isAdmin ? !!(await isAdmin(request)) : false;
  }

  function match(pathname) {
    const prefix = `${base}/polls/`;
    if (!pathname.startsWith(prefix)) return null;
    const [pollId, action = '', extra] = pathname.slice(prefix.length).replace(/\/+$/, '').split('/');
    if (!pollId || extra !== undefined || !['', 'vote', 'totals', 'responses'].includes(action)) return null;
    return { pollId, action };
  }

  async function totalsOf(st, poll) {
    const raw = await st.totals(poll.id);
    const totals = Object.fromEntries(activeOptions(poll).map((o) => [o.id, 0]));
    for (const [k, v] of Object.entries(raw)) totals[k] = v;
    return { totals, total: Object.values(totals).reduce((a, b) => a + b, 0) };
  }

  async function handle(request, { pollId, action = '' }) {
    const poll = findPoll(config, pollId);
    if (!poll) return reply({ ok: false, error: 'No such poll.' }, 404);
    const st = getStore();
    if (!st) return reply({ ok: false }, 503);
    const method = request.method;
    try {
      if (action === '' && method === 'GET') {
        const id = voterId(request, voter.cookie);
        if (!id) return reply({ ok: true, poll: publicPoll(poll), answer: null }, 200, { 'set-cookie': newVoterCookie(request, voter) });
        return reply({ ok: true, poll: publicPoll(poll), answer: await st.answerOf(poll.id, await voterKey(id)) });
      }
      if (action === 'vote' && method === 'POST') {
        const origin = request.headers.get('origin');
        if (origin && origin !== new URL(request.url).origin) return reply({ ok: false }, 403);
        const body = await request.json().catch(() => ({}));
        const optionId = String(body?.optionId ?? body?.answer ?? '');
        if (!activeOptions(poll).some((o) => o.id === optionId)) return reply({ ok: false }, 400);
        if (poll.status === 'closed') return reply({ ok: false, error: 'This poll is closed.' }, 409);
        const id = voterId(request, voter.cookie);
        if (!id) return reply({ ok: false, error: 'Cookies are required to record a response.' }, 409);
        const max = config?.spam?.votesPerIpPerMinute;
        if (max && minuteLimited(await ipKey(request.headers.get('cf-connecting-ip') || 'unknown', '', `vote-${config.siteId}`), max)) {
          return reply({ ok: false, error: 'Too many answers. Wait a minute and try again.' }, 429);
        }
        const answer = await st.insert(poll.id, await voterKey(id), optionId, { source: 'card' });
        return reply({ ok: true, answer });
      }
      if (action === 'totals' && method === 'GET') {
        if (!poll.publicResults && !(await privileged(request))) return reply({ ok: false, error: 'Results are private.' }, 401);
        return reply({ ok: true, pollId: poll.id, ...(await totalsOf(st, poll)), updatedAt: new Date().toISOString() });
      }
      if (action === 'responses' && method === 'GET') {
        if (!(await privileged(request))) return reply({ ok: false, error: 'Results are private.' }, 401);
        return reply({ ok: true, pollId: poll.id, items: await st.responses(poll.id, { limit: new URL(request.url).searchParams.get('limit') }) });
      }
      return reply({ ok: false, error: 'Method not allowed.' }, 405);
    } catch {
      return reply({ ok: false }, 503);
    }
  }

  /** Record an answer from another form (e.g. Message Us). Returns the stored option id or null. Never throws. */
  async function recordAnswer(request, pollId, optionId, { source = 'form' } = {}) {
    try {
      const poll = findPoll(config, pollId);
      const st = getStore();
      const id = voterId(request, voter.cookie);
      if (!poll || !st || !id || poll.status === 'closed' || !activeOptions(poll).some((o) => o.id === optionId)) return null;
      return await st.insert(poll.id, await voterKey(id), optionId, { source });
    } catch {
      return null;
    }
  }

  return { match, handle, recordAnswer, totals: async (pollId) => totalsOf(getStore(), findPoll(config, pollId)), store: getStore };
}
