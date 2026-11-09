import { EmailMessage } from "cloudflare:email";
import { archiveForm, receive, report } from "./contact-communications.js";

const FROM = "howdy@youareinthegame.com";
const LEGACY_FROM = "hello@youareinthegame.com";
const fromHeader = (address) => `From: "You are in the game" <${address}>`;

function withCurrentSender(raw) {
  return raw.replace(fromHeader(LEGACY_FROM) + "\r\n", fromHeader(FROM) + "\r\n");
}
const TO = "joshdwall@gmail.com";

export default {
  email: receive,
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const given = request.headers.get("x-contact-auth") || "";
    const expected = env.CONTACT_AUTH || "";
    if (!expected || given.length !== expected.length) return new Response("Unauthorized", { status: 401 });
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i);
    if (mismatch) return new Response("Unauthorized", { status: 401 });
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (typeof body.raw !== "string" || body.raw.length > 20000) return new Response("Bad request", { status: 400 });
    if (![FROM, LEGACY_FROM].some(address => body.raw.startsWith(fromHeader(address) + "\r\n")) || !body.raw.includes(`To: ${TO}`)) {
      return new Response("Bad request", { status: 400 });
    }
    const events = [["cloudflare-workers", "communications.form.worker"]];
    try {
      await archiveForm(env, body.raw, events);
    } catch {
      console.error("Communications form archive failed");
    }
    events.push(["cloudflare-email", "communications.admin.send"]);
    try {
      await env.SEND_EMAIL.send(new EmailMessage(FROM, TO, withCurrentSender(body.raw)));
    } catch (error) {
      report(ctx, env, events);
      throw error;
    }
    if (typeof body.receipt === "string" && typeof body.receiptTo === "string" && env.SEND_VISITOR) {
      try {
        events.push(["cloudflare-email", "communications.receipt.send"]);
        await env.SEND_VISITOR.send(new EmailMessage(FROM, body.receiptTo, withCurrentSender(body.receipt).replace(`\r\nReply-To: ${LEGACY_FROM}\r\n`, `\r\nReply-To: ${FROM}\r\n`)));
      } catch {
        /* The note to Josh already went out. */
      }
    }
    report(ctx, env, events);
    return new Response("ok");
  },
};
