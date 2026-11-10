/**
 * Zoho Mail send helper for visitor receipts (arbitrary To: addresses).
 * From: ZOHO_FROM_ADDRESS (josh@…). Reply-To header only when desk replyTo
 * matches the Zoho-verified Send Mail As address; otherwise body "Reply to:" line.
 */

const HOWDY = "howdy@youareinthegame.com";

function headerValue(raw, name) {
  return new RegExp("^" + name + ":\\s*([^\\r\\n]+)", "im").exec(String(raw || ""))?.[1]?.trim() || "";
}

function bodyText(raw) {
  const sep = String(raw || "").search(/\r?\n\r?\n/);
  return (sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, "") : "").trim();
}

function normEmail(value) {
  return String(value || "").trim().toLowerCase();
}

/** Address Zoho has already accepted under Send Mail As (secret + fallback howdy@). */
export function verifiedReplyToAddress(env) {
  return normEmail(env.ZOHO_REPLY_TO || HOWDY) || HOWDY;
}

/**
 * Only put Reply-To on the Zoho API payload when the operator marked verification
 * and the desk/config address still matches that verified mailbox.
 */
export function shouldSetZohoReplyToHeader(env, replyTo) {
  if (env.ZOHO_REPLY_TO_VERIFIED !== "1") return false;
  return normEmail(replyTo) === verifiedReplyToAddress(env);
}

export function parseReceiptMime(raw, replyTo = HOWDY) {
  const subject = headerValue(raw, "Subject") || "We received your note";
  const to = headerValue(raw, "To");
  let content = bodyText(raw);
  if (!content) content = "We have your message. Reply to this email to reach us.";
  const reply = String(replyTo || HOWDY).trim() || HOWDY;
  if (!content.toLowerCase().includes(reply.toLowerCase())) {
    content += "\n\n—\nReply to: " + reply + "\nYou are in the game";
  }
  return { subject, to, content };
}

export async function refreshZohoAccessToken(env) {
  const host = (env.ZOHO_ACCOUNTS_HOST || "https://accounts.zoho.com").replace(/\/$/, "");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET,
    refresh_token: env.ZOHO_REFRESH_TOKEN,
  });
  const response = await fetch(host + "/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.access_token) {
    throw new Error("Zoho token refresh failed: " + (json.error || response.status));
  }
  return json.access_token;
}

async function postZohoMessage(env, accessToken, payload) {
  const url = `https://mail.zoho.com/api/accounts/${env.ZOHO_ACCOUNT_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Zoho-oauthtoken " + accessToken,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => ({}));
  const code = json?.status?.code;
  const ok = response.ok && (code === 200 || code == null);
  return {
    ok,
    response,
    json,
    detail: json?.status?.description || json?.data?.moreInfo || String(response.status),
  };
}

/**
 * Send visitor receipt via Zoho Mail API.
 * @returns {{ ok: boolean, via: string, detail?: string }}
 */
export async function sendZohoReceipt(env, {
  toAddress,
  receiptRaw,
  replyTo: replyToOverride,
  subject: subjectOverride,
  content: contentOverride,
} = {}) {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN || !env.ZOHO_ACCOUNT_ID) {
    return { ok: false, via: "zoho", detail: "missing_zoho_secrets" };
  }
  const replyTo = String(replyToOverride || env.ZOHO_REPLY_TO || HOWDY).trim() || HOWDY;
  const parsed = parseReceiptMime(receiptRaw, replyTo);
  if (typeof subjectOverride === "string" && subjectOverride.trim()) {
    parsed.subject = subjectOverride.trim().slice(0, 160);
  }
  if (typeof contentOverride === "string" && contentOverride.trim()) {
    let content = contentOverride.trim();
    if (!content.toLowerCase().includes(replyTo.toLowerCase())) {
      content += "\n\n—\nReply to: " + replyTo + "\nYou are in the game";
    }
    parsed.content = content;
  }
  const to = String(toAddress || parsed.to || "").trim();
  if (!to) return { ok: false, via: "zoho", detail: "missing_to" };

  const fromEmail = env.ZOHO_FROM_ADDRESS || "josh@joshdwall.com";
  const fromName = (env.ZOHO_FROM_DISPLAY_NAME || "You are in the game").replace(/[\r\n"]/g, "").slice(0, 80);
  const fromAddress = `"${fromName}" <${fromEmail}>`;
  const accessToken = await refreshZohoAccessToken(env);

  const payload = {
    fromAddress,
    toAddress: to,
    subject: parsed.subject,
    content: parsed.content,
    mailFormat: "plaintext",
    encoding: "UTF-8",
  };

  const useHeader = shouldSetZohoReplyToHeader(env, replyTo);
  if (useHeader) payload.replyTo = replyTo;

  let result = await postZohoMessage(env, accessToken, payload);
  // If Zoho rejects Reply-To (stale verified flag / new address), retry without the header.
  if (!result.ok && payload.replyTo) {
    console.error("Zoho Reply-To rejected; retrying without header", result.detail);
    delete payload.replyTo;
    result = await postZohoMessage(env, accessToken, payload);
    if (result.ok) {
      return { ok: true, via: "zoho", detail: "body_reply_line_after_replyTo_reject" };
    }
  }

  if (result.ok) {
    return { ok: true, via: "zoho", detail: payload.replyTo ? "replyTo:" + replyTo : "body_reply_line" };
  }
  throw new Error("Zoho send failed: " + result.detail);
}
