// Vercel : /api/stripe — reçoit les paiements de Stripe (webhook) et active / retire les abonnements.
// À régler dans Vercel : STRIPE_WEBHOOK_SECRET (le « signing secret » du webhook, commence par whsec_).
// Les abonnés sont gardés dans la base Upstash : llmms:sub:<email> = { plan, until }.
import crypto from "node:crypto";

const PLANS = { pro: 1000, max: 2000 }; // prix en centimes : 10 € = Pro, 20 € = Max

function kvConf() {
  const E = process.env, keys = Object.keys(E);
  const uk = keys.find(k => /REST_API_URL$|REDIS_REST_URL$/.test(k) && !/READ_ONLY/.test(k));
  const tk = uk && (keys.find(k => k === uk.replace(/URL$/, "TOKEN")) || keys.find(k => /REST_API_TOKEN$|REDIS_REST_TOKEN$/.test(k) && !/READ_ONLY/.test(k)));
  return uk && tk && E[uk] && E[tk] ? { url: E[uk].replace(/\/$/, ""), tok: E[tk] } : null;
}
async function kv(cmds) {
  const c = kvConf(); if (!c) throw new Error("Base Upstash non connectée");
  const r = await fetch(`${c.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${c.tok}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("Upstash " + r.status);
  return r.json();
}
async function rawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = []; for await (const c of req) chunks.push(Buffer.from(c)); return Buffer.concat(chunks).toString("utf8");
}
function verify(raw, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map(p => p.split("=")).filter(p => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]));
  const sigs = String(header || "").split(",").filter(p => p.trim().startsWith("v1=")).map(p => p.trim().slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false; // signature trop vieille
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
const planOf = cents => cents >= PLANS.max ? "max" : cents >= PLANS.pro ? "pro" : null;
const cleanEmail = e => { const s = String(e || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null; };

async function setSub(email, plan, untilSec, customer) {
  if (!email || !plan) return;
  const until = Math.max(untilSec || 0, Math.floor(Date.now() / 1000) + 32 * 86400) + 2 * 86400; // 2 jours de marge
  const cmds = [["SET", `llmms:sub:${email}`, JSON.stringify({ plan, until }), "EXAT", until]];
  if (customer) cmds.push(["SET", `llmms:cust:${customer}`, email, "EX", 400 * 86400]);
  await kv(cmds);
}
async function emailOfCustomer(customer) {
  if (!customer) return null;
  const j = await kv([["GET", `llmms:cust:${customer}`]]);
  return j?.[0]?.result || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(200).json({ ok: true, info: "Webhook Stripe de llmms ia" }); return; }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET manquant dans Vercel" }); return; }
  const raw = await rawBody(req);
  if (!verify(raw, req.headers["stripe-signature"], secret)) { res.status(400).json({ error: "Signature Stripe invalide" }); return; }
  let ev; try { ev = JSON.parse(raw); } catch { res.status(400).json({ error: "JSON invalide" }); return; }
  const o = ev?.data?.object || {};
  try {
    if (ev.type === "checkout.session.completed" && (o.payment_status === "paid" || o.status === "complete")) {
      // client_reference_id = e-mail de connexion encodé par le site ; sinon l'e-mail tapé au paiement
      let ref = null; try { ref = cleanEmail(Buffer.from(String(o.client_reference_id || ""), "base64url").toString("utf8")); } catch {}
      const email = ref || cleanEmail(o.customer_details?.email || o.customer_email);
      await setSub(email, planOf(o.amount_total || 0), 0, o.customer);
    } else if (ev.type === "invoice.paid" || ev.type === "invoice.payment_succeeded") {
      // renouvellement mensuel
      const email = (await emailOfCustomer(o.customer)) || cleanEmail(o.customer_email);
      const end = o.lines?.data?.[0]?.period?.end || o.period_end;
      await setSub(email, planOf(o.amount_paid || o.total || 0), end, o.customer);
    } else if (ev.type === "customer.subscription.deleted") {
      // abonnement arrêté : accès retiré
      const email = await emailOfCustomer(o.customer);
      if (email) await kv([["DEL", `llmms:sub:${email}`]]);
    }
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) }); // Stripe réessaiera tout seul
  }
}
