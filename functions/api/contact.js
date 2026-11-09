import { MAX_BODY, MAX_PER_WINDOW, WINDOW_SECONDS, BRAND, readContact, leadRaw, receiptRaw } from "../_shared/contact.js";

const SEND_MS = 12_000;

export function onRequestGet() {
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const waitUntil = context.waitUntil?.bind(context) || ((promise) => promise);

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) return reply(request, "error");

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (await overLimit(ip)) return reply(request, "limited");

  let form;
  try {
    form = await request.formData();
  } catch {
    return reply(request, "error");
  }

  const contact = readContact(form);
  if (contact.honeypot) return reply(request, "sent");
  if (contact.code !== "ok") return reply(request, "error");

  const token = String(form.get("cf-turnstile-response") || "");
  if (!(await verifyTurnstile(token, ip, env.TURNSTILE_SECRET_KEY))) return reply(request, "error");

  const to = env.CONTACT_TO || "josh@joshdwall.com";
  const from = env.CONTACT_FROM || "howdy@youareinthegame.com";
  const mailer = env.CONTACT_WORKER_URL;
  if (!mailer || !env.CONTACT_AUTH) return reply(request, "error");

  const raw = leadRaw({ from, to, email: contact.email, name: contact.name, message: contact.message, brand: BRAND });
  const receipt = receiptRaw({ from, email: contact.email, name: contact.name, brand: BRAND });
  let lead;
  try {
    lead = await within(SEND_MS, postMail(mailer, env.CONTACT_AUTH, { raw, receipt, receiptTo: contact.email }));
  } catch {
    return reply(request, "error");
  }
  if (lead.timedOut) {
    waitUntil(lead.promise.catch(() => {}));
    return reply(request, "slow");
  }
  return reply(request, "sent");
}

async function postMail(url, auth, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-contact-auth": auth },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("mail");
}

function within(ms, promise) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true, promise }), ms);
  });
  const done = promise.then(() => ({ timedOut: false }));
  return Promise.race([done, timeout]).finally(() => clearTimeout(timer));
}

function wantsJson(request) {
  return (request.headers.get("accept") || "").includes("application/json");
}

function reply(request, code) {
  const ok = code === "sent" || code === "slow";
  if (wantsJson(request)) {
    const status = ok ? 200 : code === "limited" ? 429 : 400;
    return new Response(JSON.stringify({ ok, code }), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const copy = {
    sent: ["Message sent.", "We have it. A confirmation is on its way to the address you entered."],
    slow: ["Message sent.", "The mail service was slow to answer. If you do not hear back, try again in a few minutes."],
    limited: ["Too many sends from this network.", "Wait a minute and try again."],
    error: ["That message did not send.", "Check the fields and try again."],
  };
  const [title, detail] = copy[code] || copy.error;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/worldmap/worldmap.css"></head><body><main class="contact-result"><h1>${title}</h1><p>${detail}</p><p><a href="/worldmap/#contact">Back to the globe</a></p></main></body></html>`;
  return new Response(html, {
    status: ok ? 200 : code === "limited" ? 429 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

async function overLimit(ip) {
  const cache = globalThis.caches?.default;
  if (!cache) return false;
  const key = new Request(`https://youareinthegame.com/__contact-limit/${encodeURIComponent(ip)}`);
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) : 0;
  if (count >= MAX_PER_WINDOW) return true;
  await cache.put(key, new Response(String(count + 1), { headers: { "Cache-Control": `max-age=${WINDOW_SECONDS}` } }));
  return false;
}

async function verifyTurnstile(token, ip, secret) {
  if (!token || !secret) return false;
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  body.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  if (!res.ok) return false;
  const json = await res.json().catch(() => ({}));
  return json.success === true;
}
