const byId = id => document.getElementById(id);
const controls = byId('discoveryControls');
const choices = [...byId('discoveryChoices').querySelectorAll('[data-answer]')];
const status = byId('discoveryStatus');
const form = byId('contactMessageForm');
const open = byId('openContactForm');
const close = byId('closeContactForm');
const submit = form.querySelector('[type=submit]');
const notes = [...byId('contact').querySelectorAll('.form-note[id^="form-"]')];

function showAnswer(answer) {
  for (const button of choices) {
    const selected = button.dataset.answer === answer;
    button.disabled = Boolean(answer);
    button.setAttribute('aria-pressed', String(selected));
  }
  status.hidden = !answer;
  if (answer) status.textContent = 'Thanks for answering!';
}

async function requestAnswer(answer) {
  const response = await fetch('/api/discovery', answer ? {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer })
  } : { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || 'Responses are temporarily unavailable.');
  return data.answer;
}

requestAnswer().then(showAnswer).catch(error => {
  status.hidden = false;
  status.textContent = error.message;
});

for (const button of choices) {
  button.addEventListener('click', async () => {
    choices.forEach(choice => { choice.disabled = true; });
    status.hidden = false;
    status.textContent = 'Saving your response…';
    try {
      showAnswer(await requestAnswer(button.dataset.answer));
    } catch (error) {
      choices.forEach(choice => { choice.disabled = false; });
      status.textContent = error.message;
    }
  });
}

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
