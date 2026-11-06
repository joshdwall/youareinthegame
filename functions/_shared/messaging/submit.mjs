import { createMessage } from './message.mjs';

const maxBodyBytes = 36_000;

async function readSubmission(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new TypeError('Missing body');
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > maxBodyBytes) {
      await reader.cancel();
      throw new RangeError('Body too large');
    }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  return JSON.parse(raw + decoder.decode());
}

/** Create a same-origin Pages/Worker form adapter with a server-owned site ID. */
export function createSubmitHandler({ siteId, origins, verify, ingest }) {
  return async function submit(request) {
    const json = (body, status) => Response.json(body, {
      status, headers: { 'Cache-Control': 'no-store' }
    });
    if (request.method !== 'POST') return json({ ok: false }, 405);
    const origin = request.headers.get('Origin');
    if (!origins.includes(origin) || new URL(request.url).origin !== origin) return json({ ok: false }, 403);
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return json({ ok: false }, 415);
    let submission;
    let record;
    try {
      submission = await readSubmission(request);
      if (submission?.website) return json({ ok: false }, 400);
      record = createMessage({ site: { id: siteId }, submission });
    } catch (error) {
      return json({ ok: false }, error instanceof RangeError ? 413 : 400);
    }
    try {
      if (!await verify(submission.challenge, request)) return json({ ok: false }, 403);
      const result = await ingest({
        siteId, requestId: submission.requestId, email: record.email, message: record.message
      });
      return json({ ok: true, id: result.id }, result.duplicate ? 200 : 201);
    } catch {
      return json({ ok: false, error: 'temporarily_unavailable' }, 503);
    }
  };
}
