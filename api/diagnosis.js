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
