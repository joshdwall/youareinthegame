import { EmailMessage } from "cloudflare:email";
import { archiveForm, receive, report } from "./contact-communications.js";
import { resolveSettings } from "./site-settings.mjs";
import { sendZohoReceipt } from "./zoho-mail.mjs";

const FROM = "howdy@youareinthegame.com";
const LEGACY_FROM = "hello@youareinthegame.com";
const OWNER = "josh@joshdwall.com";
const GMAIL_OWNER = "joshdwall@gmail.com";
const fromHeader = (address) => `From: "You are in the game" <${address}>`;

function withCurrentSender(raw, fromAddress = FROM) {
  return raw
    .replace(fromHeader(LEGACY_FROM) + "\r\n", fromHeader(fromAddress) + "\r\n")
    .replace(fromHeader(FROM) + "\r\n", fromHeader(fromAddress) + "\r\n")
    .replace(`\r\nReply-To: ${LEGACY_FROM}\r\n`, `\r\nReply-To: ${fromAddress}\r\n`)
    .replace(`\r\nReply-To: ${FROM}\r\n`, `\r\nReply-To: ${fromAddress}\r\n`);
}

function withTo(raw, to) {
  return String(raw || "").replace(/^To: [^\r\n]+/m, `To: ${to}`);
}

function acceptedOwnerTo(raw, forwardTo) {
  const owners = new Set([OWNER, GMAIL_OWNER, String(forwardTo || "").toLowerCase()].filter(Boolean));
  return [...owners].some((address) => raw.includes(`To: ${address}`));
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

    const settings = await resolveSettings(env);
    // CF EmailMessage From must stay on a routed youareinthegame.com address.
    const configuredFrom = String(settings.from || FROM).toLowerCase();
    const cfFrom = configuredFrom === LEGACY_FROM ? LEGACY_FROM : FROM;
    const allowedSenders = new Set([FROM, LEGACY_FROM, configuredFrom, settings.alias].map((v) => String(v).toLowerCase()));
    const rawFrom = /^From: "You are in the game" <([^>]+)>/i.exec(body.raw)?.[1]?.toLowerCase();
    if (!rawFrom || !allowedSenders.has(rawFrom) || !acceptedOwnerTo(body.raw, settings.forwardTo)) {
      return new Response("Bad request", { status: 400 });
    }

    const events = [["workers", "communications.form.worker"]];
    try {
      await archiveForm(env, body.raw, events);
    } catch {
      console.error("Communications form archive failed");
    }

    const lead = withCurrentSender(body.raw, cfFrom);
    const owner = settings.forwardTo || OWNER;

    // Assigned owner mailbox (Communications Config → Forward to).
    events.push(["unrouted-actions", "communications.admin.send"]);
    try {
      if (env.SEND_VISITOR) {
        await env.SEND_VISITOR.send(new EmailMessage(cfFrom, owner, withTo(lead, owner)));
      }
    } catch (error) {
      console.error("Owner notify failed", String(error?.message || error));
      report(ctx, env, events);
      throw error;
    }

    // Keep gmail binding path as a second owner copy (SEND_EMAIL is destination-locked).
    try {
      if (env.SEND_EMAIL && owner !== GMAIL_OWNER) {
        events.push(["unrouted-actions", "communications.admin.send.gmail"]);
        await env.SEND_EMAIL.send(new EmailMessage(cfFrom, GMAIL_OWNER, withTo(lead, GMAIL_OWNER)));
      }
    } catch (error) {
      console.error("Gmail owner copy failed", String(error?.message || error));
    }

    if (settings.autoReply && typeof body.receipt === "string" && typeof body.receiptTo === "string") {
      try {
        events.push(["unrouted-actions", "communications.receipt.send"]);
        // Zoho reaches arbitrary visitor inboxes; CF SEND_VISITOR only hits verified destinations.
        const zoho = await sendZohoReceipt(env, {
          toAddress: body.receiptTo,
          receiptRaw: body.receipt,
          replyTo: settings.replyTo,
          subject: settings.subject,
          content: settings.body,
        });
        if (!zoho.ok) throw new Error(zoho.detail || "zoho_receipt_failed");
        try {
          await archiveForm(
            env,
            [
              fromHeader(cfFrom),
              `To: ${body.receiptTo}`,
              `Reply-To: ${settings.replyTo}`,
              `Subject: ${settings.subject}`,
              "",
              `Name: visitor`,
              `Email: ${body.receiptTo}`,
              `Page: auto-reply`,
              "",
              `[auto-reply via zoho from ${env.ZOHO_FROM_ADDRESS || OWNER}; reply-to ${settings.replyTo}; cfg-rev ${settings.revision}]`,
            ].join("\r\n"),
            events
          );
        } catch {
          /* receipt mail already went out */
        }
      } catch (error) {
        console.error("Visitor receipt failed", String(error?.message || error));
        /* Owner notify already went out. */
      }
    }

    report(ctx, env, events);
    return new Response("ok");
  },
};
