/**
 * Poll card (browser). Two ways to use it, both render-first (no layout shift: the buttons are there before any data;
 * they start disabled with "Loading…" in the card's own status line, then enable or show the saved answer in place).
 *
 *   mountPollCard(host, { ui, poll, endpoint, fetchImpl })
 *     Site-hub catalog sites: panel + form actions (catalog ids only, no kit class names). poll = publicPoll() shape
 *     from the site's config (shipped at build), endpoint = '<basePath>/polls/<id>'.
 *
 *   bindPollButtons({ buttons, status, getUrl, voteUrl, fetchImpl, thanks })
 *     Pre-rendered markup (e.g. youareinthegame worldmap): buttons carry data-answer="<option id>".
 *
 * One answer per browser; the answer never changes (buttons stay disabled once answered).
 */
async function call(fetchImpl, url, init) {
  const res = await (fetchImpl || fetch)(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'Responses are temporarily unavailable.');
  return data;
}

export function bindPollButtons({ buttons, status, getUrl, voteUrl, fetchImpl, thanks = 'Thanks for answering!', loading = '' } = {}) {
  const say = (t, show = true) => {
    if (!status) return;
    status.hidden = !show;
    status.textContent = t || '';
  };
  const show = (answer) => {
    for (const b of buttons) {
      b.disabled = Boolean(answer);
      b.setAttribute('aria-pressed', String(b.dataset.answer === answer));
    }
    say(answer ? thanks : '', Boolean(answer));
  };
  if (loading) {
    buttons.forEach((b) => (b.disabled = true));
    say(loading);
  }
  const ready = call(fetchImpl, getUrl)
    .then((d) => {
      show(d.answer ?? null);
      return d;
    })
    .catch((e) => {
      buttons.forEach((b) => (b.disabled = false));
      say(e.message);
      return null;
    });
  for (const b of buttons) {
    b.addEventListener('click', async () => {
      buttons.forEach((x) => (x.disabled = true));
      say('Saving your response…');
      try {
        show((await call(fetchImpl, voteUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ optionId: b.dataset.answer, answer: b.dataset.answer }) })).answer);
      } catch (e) {
        buttons.forEach((x) => (x.disabled = false));
        say(e.message);
      }
    });
  }
  return { ready };
}

export function mountPollCard(host, { ui, poll, endpoint, fetchImpl, title } = {}) {
  if (!host || !poll) return null;
  const id = `poll-${poll.id}`;
  host.dataset.pollCard = poll.id;
  host.innerHTML = ui.html('panel', {
    title: title || poll.title,
    hint: poll.question,
    body: ui.html('form', {
      id,
      fields: [],
      actions: (poll.options || []).map((o) => ({ label: o.label, name: `opt-${o.id}`, kind: 'outline', type: 'button' })),
      status: 'Loading…'
    })
  });
  const form = host.querySelector(`#${id}`);
  if (!form) return null;
  form.addEventListener('submit', (e) => e.preventDefault());
  const buttons = (poll.options || []).map((o) => {
    const b = form.querySelector(`[data-action="opt-${o.id}"]`);
    if (b) b.dataset.answer = o.id;
    return b;
  }).filter(Boolean);
  const status = form.querySelector('[data-form-status]');
  return bindPollButtons({ buttons, status, getUrl: endpoint, voteUrl: `${endpoint}/vote`, fetchImpl, thanks: poll.thanks, loading: 'Loading…' });
}
