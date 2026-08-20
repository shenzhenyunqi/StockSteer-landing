// Receives the diagnosis form (multipart) and emails it, CSVs attached,
// to the team inbox via Resend (https://resend.com — free tier suffices).
//
// Required Vercel env var:
//   RESEND_API_KEY   — create at resend.com
// Optional:
//   DIAGNOSIS_INBOX  — recipient, defaults to hello@stocksteer-support.maxvideohub.com
//                      (which api/inbound.js forwards on to the real inbox)
//   DIAGNOSIS_FROM   — sender, defaults to diagnosis@stocksteer-support.maxvideohub.com
//                      (requires stocksteer-support.maxvideohub.com verified in Resend)
//
// Until RESEND_API_KEY is set this returns 500 and the front end falls back
// to its "email us instead" guidance — nothing breaks, nothing is lost.

export const config = { runtime: "edge" };

// Vercel rejects request bodies over ~4.5MB before this code runs; our own
// ceiling sits under that so oversize uploads get a clear message instead.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CHANNEL_LABELS = { both: "Shopify + Amazon", shopify: "Shopify only", amazon: "Amazon only" };

// Landing-palette hex equivalents of tokens.css (email clients can't do oklch):
// cream #faf9f6 · card #ffffff · hairline #e0dfdd · ink #1b1e24 · muted #565046
// teal #006166 · teal chip #d5f0f1/#00454d · neutral chip #f3f0eb
const FONT_BODY = "'Geist','Helvetica Neue',Arial,sans-serif";
const FONT_DISPLAY = "'Newsreader',Georgia,'Times New Roman',serif";
const FONT_MONO = "'Geist Mono',ui-monospace,'SF Mono',Menlo,monospace";

export function diagnosisHtml({ email, store, channels, filenames }) {
  const row = (label, value) =>
    `<tr>` +
    `<td style="padding:12px 24px 12px 0;border-top:1px solid #e0dfdd;font:500 11px/1.5 ${FONT_BODY};letter-spacing:0.12em;text-transform:uppercase;color:#565046;vertical-align:top;white-space:nowrap;">${label}</td>` +
    `<td style="padding:12px 0;border-top:1px solid #e0dfdd;font:400 15px/1.5 ${FONT_BODY};color:#1b1e24;vertical-align:top;width:100%;">${value}</td>` +
    `</tr>`;

  const fileChips = filenames.length
    ? filenames
        .map(
          (name) =>
            `<span style="display:inline-block;margin:0 6px 4px 0;padding:2px 10px;border-radius:6px;background:#f3f0eb;font:400 12.5px/1.7 ${FONT_MONO};color:#1b1e24;">${escapeHtml(name)}</span>`
        )
        .join("")
    : `<span style="color:#565046;">none attached</span>`;

  const rows =
    row("Work email", `<a href="mailto:${escapeHtml(email)}" style="color:#006166;">${escapeHtml(email)}</a>`) +
    (store ? row("Store", escapeHtml(store)) : "") +
    row(
      "Channels",
      `<span style="display:inline-block;padding:2px 10px;border-radius:6px;background:#d5f0f1;font:500 13px/1.7 ${FONT_BODY};color:#00454d;">${escapeHtml(CHANNEL_LABELS[channels] || channels || "—")}</span>`
    ) +
    row("Files", fileChips);

  return (
    `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#faf9f6;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:560px;max-width:100%;">` +
    `<tr><td style="padding:0 4px 14px;font:600 15px/1 ${FONT_BODY};letter-spacing:-0.01em;color:#1b1e24;">` +
    `<span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#006166;"></span>&nbsp;&nbsp;StockSteer</td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #e0dfdd;border-radius:10px;padding:28px 32px;">` +
    `<p style="margin:0 0 10px;font:500 12px/1.5 ${FONT_BODY};letter-spacing:0.12em;text-transform:uppercase;color:#006166;">Allocation diagnosis</p>` +
    `<h1 style="margin:0 0 6px;font:400 24px/1.25 ${FONT_DISPLAY};letter-spacing:-0.02em;color:#1b1e24;">New diagnosis request</h1>` +
    `<p style="margin:0 0 20px;font:400 14px/1.5 ${FONT_BODY};color:#565046;">Submitted through the landing form.</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>` +
    `<p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #e0dfdd;font:400 13px/1.5 ${FONT_BODY};color:#565046;">Reply to this email to reach the merchant directly.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:14px 4px 0;font:400 12px/1.5 ${FONT_BODY};color:#565046;">StockSteer &middot; <a href="https://stocksteer.maxvideohub.com" style="color:#006166;">stocksteer.maxvideohub.com</a></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

export default async function handler(request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const key = process.env.RESEND_API_KEY;
  if (!key) return json(500, { error: "Form backend not configured" });

  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "Expected multipart form data" });
  }

  const email = String(form.get("email") || "").trim();
  if (!email.includes("@")) return json(400, { error: "A valid email is required" });
  const store = String(form.get("store") || "").trim();
  const channels = String(form.get("channels") || "").trim();

  const attachments = [];
  let total = 0;
  for (const f of form.getAll("csv")) {
    if (typeof f === "string" || !f.size) continue;
    total += f.size;
    if (total > MAX_TOTAL_BYTES) {
      return json(413, { error: "Files too large — please email them instead" });
    }
    attachments.push({ filename: f.name, content: toBase64(await f.arrayBuffer()) });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIAGNOSIS_FROM || "StockSteer <diagnosis@stocksteer-support.maxvideohub.com>",
      to: [process.env.DIAGNOSIS_INBOX || "hello@stocksteer-support.maxvideohub.com"],
      reply_to: email,
      subject: "Allocation diagnosis request" + (store ? " — " + store : ""),
      html: diagnosisHtml({ email, store, channels, filenames: attachments.map((a) => a.filename) }),
      text:
        `New diagnosis request from the landing form.\n\n` +
        `Work email: ${email}\n` +
        (store ? `Store: ${store}\n` : "") +
        `Channels: ${channels}\n` +
        `Files: ${attachments.length ? attachments.map((a) => a.filename).join(", ") : "none attached"}\n`,
      attachments,
    }),
  });

  if (!res.ok) return json(502, { error: "Email delivery failed" });
  return json(200, { ok: true });
}
