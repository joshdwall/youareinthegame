import PostalMime from "postal-mime";
import { createActionClient } from "./action-client.mjs";
import { resolveSettings } from "./site-settings.mjs";

const BASE = "https://envivo-data.joshdwall.workers.dev/enVivo/api/data";
const LEGACY_ALIASES = new Set(["howdy@youareinthegame.com", "hello@youareinthegame.com"]);

async function fingerprint(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function archive(env, id, email, message) {
  const requestId = [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20, 32)].join("-");
  const response = await fetch(BASE + "/_communications", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.COMMUNICATIONS_INGEST_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: "youareinthegame", requestId, email, message: message.slice(0, 8000) }),
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("Archive HTTP " + response.status);
}

async function track(env, id, operations) {
  const client = createActionClient({ baseUrl: BASE, token: env.DATA_CLI_TOKEN });
  await client.countBatch(await Promise.all(operations.map(async ([providerId, op]) => ({
    id: await fingerprint(id + ":" + op),
    providerId, op, actual: 1, period: "day", atMs: Date.now(),
    actor: "youareinthegame", repo: "joshdwall/youareinthegame", visibility: "public",
    reason: "Contact pipeline operation"
  }))));
}

export async function archiveForm(env, raw, events) {
  const separator = raw.indexOf("\r\n\r\n");
  if (separator < 0) throw new Error("Invalid message headers");
  const body = raw.slice(separator + 4);
  const email = /^Reply-To: ([^\r\n]+)\r?$/m.exec(raw)?.[1];
  const id = await fingerprint(crypto.randomUUID());
  const text = body.replace(/^Name:[^\r\n]*\r\nEmail:[^\r\n]*\r\nPage:[^\r\n]*\r\n\r\n/, "");
  events.push(["workers", "communications.archive.request"]);
  await archive(env, id, email, text);
  events.push(["do-requests", "communications.archive.saved"]);
}

export function report(ctx, env, events) {
  ctx.waitUntil(track(env, crypto.randomUUID(), events).catch(() => {
    console.error("Communications action ledger delivery failed");
  }));
}

export async function receive(message, env, ctx) {
  const settings = await resolveSettings(env);
  const accepted = new Set([...LEGACY_ALIASES, settings.alias, settings.from, settings.replyTo].map((v) => String(v).toLowerCase()));
  if (!accepted.has(String(message.to || "").toLowerCase())) {
    message.setReject("Unknown contact address");
    return;
  }
  const events = [["workers", "communications.inbound.worker"]];
  try {
    if (message.rawSize <= 2_000_000) {
      const mail = await PostalMime.parse(message.raw);
      const id = await fingerprint(JSON.stringify([message.to, message.from, mail.messageId, mail.date, mail.subject, mail.text, mail.html]));
      const body = mail.text?.trim() || (mail.html ? "[HTML-only email. See forwarded copy.]" : "[No text body]");
      events.push(["workers", "communications.archive.request"]);
      await archive(env, id, mail.from?.address || message.from, body);
      events.push(["do-requests", "communications.archive.saved"]);
    }
  } catch {
    console.error("Communications inbound archive failed");
  }
  const forwardTargets = [...new Set([settings.forwardTo, "josh@joshdwall.com"].filter(Boolean))];
  try {
    events.push(["unrouted-actions", "communications.inbound.forward"]);
    let forwarded = false;
    for (const dest of forwardTargets) {
      try {
        await message.forward(dest);
        forwarded = true;
        if (dest !== settings.forwardTo) {
          console.error("Inbound forward fell back from", settings.forwardTo, "to", dest);
        }
        break;
      } catch (error) {
        console.error("Inbound forward failed for", dest, String(error?.message || error));
      }
    }
    if (!forwarded) console.error("Inbound forward skipped — no destination accepted");
  } finally {
    report(ctx, env, events);
  }
}
