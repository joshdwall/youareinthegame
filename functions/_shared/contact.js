export const MAX_BODY = 20_000;
export const WINDOW_SECONDS = 60;
export const MAX_PER_WINDOW = 3;
export const BRAND = "You are in the game";

export function oneLine(value, max) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value);
}

export function headerName(value) {
  return String(value || BRAND).replace(/[\r\n"]/g, "").slice(0, 80) || BRAND;
}

export function readContact(form) {
  if (String(form.get("company_url") || "").trim()) return { code: "sent", honeypot: true };
  const email = oneLine(form.get("email"), 200);
  const message = String(form.get("message") || "").replace(/\r/g, "").trim().slice(0, 4000);
  if (!isEmail(email) || !message) return { code: "error" };
  const name = oneLine(form.get("name"), 120) || email.split("@")[0].slice(0, 80) || "Visitor";
  return { code: "ok", email, name, message };
}

export function leadRaw({ from, to, email, name, message, brand }) {
  return [
    `From: "${headerName(brand)}" <${from}>`,
    `To: ${to}`,
    `Reply-To: ${email}`,
    `Subject: ${headerName(brand)} — ${headerName(name)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Name: ${name}`,
    `Email: ${email}`,
    `Page: https://www.youareinthegame.com/worldmap/`,
    "",
    message,
  ].join("\r\n");
}

export function receiptRaw({ from, email, name, brand }) {
  const label = headerName(brand);
  return [
    `From: "${label}" <${from}>`,
    `To: ${email}`,
    `Reply-To: ${from}`,
    `Subject: We received your note`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Hello ${name},`,
    "",
    "We have your message. A person will reply from this address.",
    "",
    label,
  ].join("\r\n");
}
