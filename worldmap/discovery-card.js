import { bindPollButtons } from '/js/comm/poll-card.mjs';

const byId = id => document.getElementById(id);
const controls = byId('discoveryControls');
const choices = [...byId('discoveryChoices').querySelectorAll('[data-answer]')];
const status = byId('discoveryStatus');
const form = byId('contactMessageForm');
const open = byId('openContactForm');
const close = byId('closeContactForm');
const submit = form.querySelector('[type=submit]');
const notes = [...byId('contact').querySelectorAll('.form-note[id^="form-"]')];

// Poll (site-hub communications module; config/communications.json). Buttons are pre-rendered at build from config.
const poll = byId('discoveryChoices').dataset.poll || 'how-did-you-find';
bindPollButtons({ buttons: choices, status, getUrl: `/api/comm/polls/${poll}`, voteUrl: `/api/comm/polls/${poll}/vote` });

function showMessageForm(visible) {
  controls.hidden = visible;
  form.hidden = !visible;
  (visible ? form.elements.email : open).focus();
}

open.addEventListener('click', () => {
  notes.forEach(note => { note.hidden = true; });
  showMessageForm(true);
});
close.addEventListener('click', () => showMessageForm(false));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = close.disabled = true;
  submit.textContent = 'Sending…';
  let code = 'error';
  try {
    const response = await fetch(form.action, {
      method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }
    });
    const data = await response.json();
    if (['sent', 'slow', 'limited'].includes(data.code)) code = data.code;
  } catch {
    // The error status below also covers a network failure.
  } finally {
    if (code === 'sent' || code === 'slow') form.reset();
    window.turnstile?.reset();
    submit.disabled = close.disabled = false;
    submit.textContent = 'Send';
    showMessageForm(false);
    byId('form-' + code).hidden = false;
  }
});
