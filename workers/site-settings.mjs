/**
 * Load Communications Config from envivo-data DO (desk SSOT).
 * GET /_communications/config?siteId=… with COMMUNICATIONS_INGEST_TOKEN.
 * Soft-fail → null so contact stays up if the DO is briefly unreachable.
 */

const BASE = "https://envivo-data.joshdwall.workers.dev/enVivo/api/data";
const SITE_ID = "youareinthegame";

const FALLBACK = Object.freeze({
  siteId: SITE_ID,
  alias: "howdy@youareinthegame.com",
  forwardTo: "josh@joshdwall.com",
  from: "howdy@youareinthegame.com",
  replyTo: "howdy@youareinthegame.com",
  autoReply: true,
  subject: "We received your note",
  body: "We have your message. A person will reply from this address.",
  revision: 0,
});

export function fallbackSettings() {
  return { ...FALLBACK };
}

export async function loadSiteSettings(env, siteId = SITE_ID) {
  const token = env.COMMUNICATIONS_INGEST_TOKEN;
  if (!token) return null;
  try {
    const url = `${BASE}/_communications/config?siteId=${encodeURIComponent(siteId)}`;
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const json = await response.json().catch(() => null);
    const site = json?.site;
    if (!site || typeof site !== "object") return null;
    return {
      ...FALLBACK,
      ...site,
      siteId,
      alias: String(site.alias || FALLBACK.alias).trim().toLowerCase(),
      forwardTo: String(site.forwardTo || FALLBACK.forwardTo).trim().toLowerCase(),
      from: String(site.from || FALLBACK.from).trim().toLowerCase(),
      replyTo: String(site.replyTo || FALLBACK.replyTo).trim().toLowerCase(),
      autoReply: site.autoReply !== false,
      subject: String(site.subject || FALLBACK.subject).slice(0, 160),
      body: String(site.body || FALLBACK.body).slice(0, 8000),
      revision: Number.isFinite(site.revision) ? site.revision : 0,
    };
  } catch {
    return null;
  }
}

export async function resolveSettings(env, siteId = SITE_ID) {
  return (await loadSiteSettings(env, siteId)) || fallbackSettings();
}
