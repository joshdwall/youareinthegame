/** Attach the shared contact workflow to a site-owned form. */
export function mountMessageForm(form, { endpoint = '/api/messages', getChallenge, afterAttempt } = {}) {
  const status = form.querySelector('[data-message-status]');
  const submit = form.querySelector('[type="submit"]');
  let previousPayload;
  let requestId;
  async function send(event) {
    event.preventDefault();
    if (submit.disabled) return;
    const fields = new FormData(form);
    const payload = { email: fields.get('email'), message: fields.get('message'), website: fields.get('website') };
    const serialized = JSON.stringify(payload);
    if (serialized !== previousPayload) {
      requestId = crypto.randomUUID();
      previousPayload = serialized;
    }
    submit.disabled = true;
    status.textContent = 'Sending…';
    try {
      const challenge = await getChallenge?.();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, requestId, challenge })
      });
      if (!response.ok || !(await response.json()).ok) throw new Error('Message rejected');
      form.reset();
      previousPayload = undefined;
      status.textContent = 'Message received.';
    } catch {
      status.textContent = 'Message could not be sent. Please try again.';
    } finally {
      submit.disabled = false;
      afterAttempt?.();
    }
  }
  form.addEventListener('submit', send);
  return () => form.removeEventListener('submit', send);
}

