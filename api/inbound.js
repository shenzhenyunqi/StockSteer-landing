// Forwards mail received at hello@stocksteer-support.maxvideohub.com to the team's
// real inbox. Resend inbound has no built-in auto-forward: the domain's MX
// delivers mail to Resend, Resend POSTs an `email.received` webhook here,
// and we re-send the content (attachments included) via their send API.
// Mail we skip or fail to forward is still stored in the Resend dashboard.
//
// Required Vercel env vars:
//   RESEND_API_KEY         — "Full access" key (reads received mail + sends)
//   RESEND_WEBHOOK_SECRET  — whsec_… shown on the webhook's page in Resend
//   FORWARD_TO             — where forwarded mail lands (e.g. your Gmail)
// Optional:
//   INBOUND_ADDRESS        — comma list of addresses worth forwarding;
//                            defaults to hello@stocksteer-support.maxvideohub.com.
//                            Mail to other addresses on the domain is ignored.
//   FORWARD_FROM           — sender of the forwarded copy, defaults to
//                            "StockSteer <hello@stocksteer-support.maxvideohub.com>"

export const config = { runtime: "edge" };

const API = "https://api.resend.com";

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

// Svix-style webhook verification: HMAC-SHA256 over "id.timestamp.payload"
// with the base64 part of the whsec_ secret as key.
async function isValidSignature(secret, id, timestamp, payload, signatures) {
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  const expected = toBase64(sig);
  return signatures.split(" ").some((s) => s.split(",")[1] === expected);
}

export default async function handler(request) {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.RESEND_API_KEY;
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const forwardTo = process.env.FORWARD_TO;
  if (!apiKey || !secret || !forwardTo) return json(500, { error: "Forwarding not configured" });

  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return json(400, { error: "Missing signature headers" });
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return json(401, { error: "Stale webhook timestamp" });
  }
  if (!(await isValidSignature(secret, id, timestamp, payload, signature))) {
    return json(401, { error: "Invalid signature" });
  }

  const event = JSON.parse(payload);
  if (event.type !== "email.received") return json(200, { ignored: true });

  const wanted = (process.env.INBOUND_ADDRESS || "hello@stocksteer-support.maxvideohub.com")
    .toLowerCase()
    .split(",")
    .map((a) => a.trim());
  const recipients = [
    ...(event.data.to || []),
    ...(event.data.cc || []),
    ...(event.data.received_for || []),
  ].map((a) => a.toLowerCase());
  if (!recipients.some((r) => wanted.includes(r))) return json(200, { skipped: true });

  const auth = { Authorization: `Bearer ${apiKey}` };
  const emailId = event.data.email_id;

  // Inline images arrive as data: URIs inside the html, so attachments here
  // are only the "real" ones.
  const emailRes = await fetch(`${API}/emails/receiving/${emailId}?html_format=data_uri`, { headers: auth });
  if (!emailRes.ok) return json(502, { error: "Failed to fetch received email" });
  const email = await emailRes.json();

  const listRes = await fetch(`${API}/emails/receiving/${emailId}/attachments`, { headers: auth });
  if (!listRes.ok) return json(502, { error: "Failed to list attachments" });
  const attachments = [];
  for (const a of (await listRes.json()).data || []) {
    const fileRes = await fetch(a.download_url);
    if (!fileRes.ok) return json(502, { error: "Failed to download attachment" });
    attachments.push({
      filename: a.filename,
      content: toBase64(await fileRes.arrayBuffer()),
      content_type: a.content_type,
    });
  }

  const sender = email.headers?.from || email.from;
  const note = `Forwarded from ${wanted[0]} — original sender: ${sender}`;
  const subject = (email.subject || "(no subject)").startsWith("Fwd:")
    ? email.subject
    : `Fwd: ${email.subject || "(no subject)"}`;

  const sendRes = await fetch(`${API}/emails`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.FORWARD_FROM || "StockSteer <hello@stocksteer-support.maxvideohub.com>",
      to: [forwardTo],
      reply_to: email.from,
      subject,
      html: email.html ? `<p style="color:#666;font-size:12px">${note}</p>${email.html}` : undefined,
      text: `${note}\n\n${email.text || ""}`,
      attachments: attachments.length ? attachments : undefined,
    }),
  });
  if (!sendRes.ok) return json(502, { error: "Forwarding send failed" });
  return json(200, { forwarded: true });
}
