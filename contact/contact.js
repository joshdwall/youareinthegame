import { mountMessageForm } from '/runtime/messaging/form.mjs';

const form = document.querySelector('form');
const status = form.querySelector('[data-message-status]');
const submit = form.querySelector('button');
try {
  const response = await fetch('/api/messages');
  if (!response.ok) throw new Error('Contact unavailable');
  const { siteKey } = await response.json();
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  const widget = window.turnstile.render('#challenge', {
    sitekey: siteKey,
    action: 'communications',
    callback: () => { submit.disabled = false; },
    'expired-callback': () => { submit.disabled = true; },
    'error-callback': () => { submit.disabled = true; status.textContent = 'Verification failed. Reload to try again.'; }
  });
  mountMessageForm(form, {
    getChallenge: () => window.turnstile.getResponse(widget),
    afterAttempt: () => {
      submit.disabled = true;
      window.turnstile.reset(widget);
    }
  });
  status.textContent = '';
} catch {
  status.textContent = 'The contact form is temporarily unavailable.';
}
