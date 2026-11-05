import { EmailMessage } from "cloudflare:email";

const FROM = "hello@youareinthegame.com";
const TO = "joshdwall@gmail.com";

export default {
  async fetch(request, env) {
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
    if (!body.raw.includes(`From: "You are in the game" <${FROM}>`) || !body.raw.includes(`To: ${TO}`)) {
      return new Response("Bad request", { status: 400 });
    }
    await env.SEND_EMAIL.send(new EmailMessage(FROM, TO, body.raw));
    if (typeof body.receipt === "string" && typeof body.receiptTo === "string" && env.SEND_VISITOR) {
      try {
        await env.SEND_VISITOR.send(new EmailMessage(FROM, body.receiptTo, body.receipt));
      } catch {
        /* The note to Josh already went out. */
      }
    }
    return new Response("ok");
  },
};
