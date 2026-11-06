/** Normalize a public form submission before writing it to the private inbox. */
export function createMessage({ site, submission, now = new Date() }) {
  const { email, message, requestId } = submission ?? {};
  if (!site?.id || typeof email !== 'string' || typeof message !== 'string' ||
      typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) {
    throw new TypeError('Invalid message submission.');
  }
  const sender = email.trim();
  const text = message.trim();
  if (sender.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender) ||
      text.length === 0 || text.length > 8000) {
    throw new TypeError('Enter a valid email and a message of up to 8,000 characters.');
  }
  return {
    schemaVersion: 1,
    id: `${site.id}:${requestId.toLowerCase()}`,
    siteId: site.id,
    receivedAt: now.toISOString(),
    channel: 'web',
    email: sender,
    message: text
  };
}
