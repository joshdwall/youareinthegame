/**
 * Zoho Mail send helper for visitor receipts (arbitrary To: addresses).
 * From: ZOHO_FROM_ADDRESS (josh@…). Reply-To: howdy@ when Zoho accepts it.
 */

const HOWDY = "howdy@youareinthegame.com";

function headerValue(raw, name) {
  return new RegExp("^" + name + ":\\s*([^\\r\\n]+)", "im").exec(String(raw || ""))?.[1]?.trim() || "";
}

function bodyText(raw) {
  const sep = String(raw || "").search(/\r?\n\r?\n/);
  return (sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, "") : "").trim();
}

export function parseReceiptMime(raw) {
  const subject = headerValue(raw, "Subject") || "We received your note";
  const to = headerValue(raw, "To");
  let content = bodyText(raw);
  if (!content) content = "We have your message. Reply to this email to reach us.";
  // Point replies at howdy even if Zoho strips Reply-To.
  if (!/howdy@youareinthegame\.com/i.test(content)) {
    content += "\n\n—\nReply to: " + HOWDY + "\nYou are in the game";
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

/**
 * Send visitor receipt via Zoho Mail API.
 * @returns {{ ok: boolean, via: string, detail?: string }}
 */
export async function sendZohoReceipt(env, { toAddress, receiptRaw }) {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN || !env.ZOHO_ACCOUNT_ID) {
    return { ok: false, via: "zoho", detail: "missing_zoho_secrets" };
  }
  const parsed = parseReceiptMime(receiptRaw);
  const to = String(toAddress || parsed.to || "").trim();
  if (!to) return { ok: false, via: "zoho", detail: "missing_to" };

  const fromAddress = env.ZOHO_FROM_ADDRESS || "josh@joshdwall.com";
  // Zoho rejects Reply-To unless that address is verified on the mailbox.
  // howdy@ is not a Zoho identity yet — put it in the body (parseReceiptMime) and
  // only set replyTo when ZOHO_REPLY_TO_VERIFIED=1 after verifying in Zoho.
  const replyTo = env.ZOHO_REPLY_TO || HOWDY;
  const accessToken = await refreshZohoAccessToken(env);

  const payload = {
    fromAddress,
    toAddress: to,
    subject: parsed.subject,
    content: parsed.content,
    mailFormat: "plaintext",
    encoding: "UTF-8",
  };
  if (env.ZOHO_REPLY_TO_VERIFIED === "1") payload.replyTo = replyTo;

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
  if (response.ok && (code === 200 || code == null)) {
    return { ok: true, via: "zoho", detail: payload.replyTo ? "replyTo:" + replyTo : "body_reply_line" };
  }
  throw new Error("Zoho send failed: " + (json?.status?.description || json?.data?.moreInfo || response.status));
}
