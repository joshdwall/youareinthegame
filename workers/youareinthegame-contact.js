import { EmailMessage } from "cloudflare:email";
import { archiveForm, receive, report } from "./contact-communications.js";

const FROM = "howdy@youareinthegame.com";
const LEGACY_FROM = "hello@youareinthegame.com";
const OWNER = "josh@joshdwall.com";
const GMAIL_OWNER = "joshdwall@gmail.com";
const fromHeader = (address) => `From: "You are in the game" <${address}>`;

function withCurrentSender(raw) {
  return raw
    .replace(fromHeader(LEGACY_FROM) + "\r\n", fromHeader(FROM) + "\r\n")
    .replace(`\r\nReply-To: ${LEGACY_FROM}\r\n`, `\r\nReply-To: ${FROM}\r\n`);
}

function withTo(raw, to) {
  return String(raw || "").replace(/^To: [^\r\n]+/m, `To: ${to}`);
}

function acceptedOwnerTo(raw) {
  return raw.includes(`To: ${OWNER}`) || raw.includes(`To: ${GMAIL_OWNER}`);
}

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
    if (
      ![FROM, LEGACY_FROM].some((address) => body.raw.startsWith(fromHeader(address) + "\r\n")) ||
      !acceptedOwnerTo(body.raw)
    ) {
      return new Response("Bad request", { status: 400 });
    }

    const events = [["workers", "communications.form.worker"]];
    try {
      await archiveForm(env, body.raw, events);
    } catch {
      console.error("Communications form archive failed");
    }

    const lead = withCurrentSender(body.raw);

    // Assigned owner mailbox (Communications forwardTo default).
    events.push(["unrouted-actions", "communications.admin.send"]);
    try {
      if (env.SEND_VISITOR) {
        await env.SEND_VISITOR.send(new EmailMessage(FROM, OWNER, withTo(lead, OWNER)));
      }
    } catch (error) {
      console.error("Owner notify failed", String(error?.message || error));
      report(ctx, env, events);
      throw error;
    }

    // Keep gmail binding path as a second owner copy (SEND_EMAIL is destination-locked).
    try {
      if (env.SEND_EMAIL) {
        events.push(["unrouted-actions", "communications.admin.send.gmail"]);
        await env.SEND_EMAIL.send(new EmailMessage(FROM, GMAIL_OWNER, withTo(lead, GMAIL_OWNER)));
      }
    } catch (error) {
      console.error("Gmail owner copy failed", String(error?.message || error));
    }

    if (typeof body.receipt === "string" && typeof body.receiptTo === "string" && env.SEND_VISITOR) {
      try {
        events.push(["unrouted-actions", "communications.receipt.send"]);
        await env.SEND_VISITOR.send(new EmailMessage(FROM, body.receiptTo, withCurrentSender(body.receipt)));
        try {
          await archiveForm(
            env,
            [
              fromHeader(FROM),
              `To: ${body.receiptTo}`,
              `Reply-To: ${FROM}`,
              "Subject: We received your note",
              "",
              `Name: visitor`,
              `Email: ${body.receiptTo}`,
              `Page: auto-reply`,
              "",
              `[auto-reply sent from ${FROM}]`,
            ].join("\r\n"),
            events
          );
        } catch {
          /* receipt mail already went out */
        }
      } catch {
        /* The note to the owner already went out. */
      }
    }

    report(ctx, env, events);
    return new Response("ok");
  },
};
