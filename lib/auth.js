// Connexion par e-mail + code à 6 chiffres, sans base de données (jetons signés HMAC).
// Activée seulement si RESEND_API_KEY est réglée. Variables :
//   RESEND_API_KEY  clé de https://resend.com (envoi des e-mails)
//   MAIL_FROM       expéditeur, ex. "llmms ia <code@ton-domaine.com>" (domaine vérifié chez Resend)
//   AUTH_SECRET     secret pour signer les jetons (sinon dérivé de OPENROUTER_API_KEY)
//   GMAIL_USER + GMAIL_APP_PASSWORD  envoi par ton Gmail (gratuit, vers TOUT LE MONDE, sans nom de domaine)
//                   → mot de passe d'application : https://myaccount.google.com/apppasswords (validation en 2 étapes requise)
//   ALLOWED_EMAILS  optionnel : liste d'e-mails autorisés, séparés par des virgules

const enc = new TextEncoder();
const CODE_MINUTES = 10;
const SESSION_DAYS = 30;

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const toB64u = str => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => decodeURIComponent(escape(atob(String(s).replace(/-/g, "+").replace(/_/g, "/"))));

function secretOf(env) { return env("AUTH_SECRET") || "llmms:" + (env("OPENROUTER_API_KEY") || "no-secret"); }

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
function same(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

export function authEnabled(env) { return !!(env("RESEND_API_KEY") || (env("GMAIL_USER") && env("GMAIL_APP_PASSWORD"))); }

function cleanEmail(e) { const s = String(e || "").trim().toLowerCase(); return /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/.test(s) ? s : null; }
function allowed(env, email) { const list = String(env("ALLOWED_EMAILS") || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean); return !list.length || list.includes(email); }

// Envoi du code : Gmail (si réglé) en priorité, sinon Resend. Renvoie true ou un message d'erreur.
async function sendCode(env, email, code) {
  const subject = `${code} — ton code llmms ia`, html = mailHtml(code), text = `Ton code llmms ia : ${code} (valable ${CODE_MINUTES} minutes)`;
  const gu = env("GMAIL_USER"), gp = env("GMAIL_APP_PASSWORD");
  if (gu && gp) {
    try {
      const nm = (await import("nodemailer")).default;
      const t = nm.createTransport({ service: "gmail", auth: { user: gu, pass: String(gp).replace(/\s+/g, "") } });
      await t.sendMail({ from: `llmms ia <${gu}>`, to: email, subject, html, text });
      return true;
    } catch (e) { if (!env("RESEND_API_KEY")) return String(e?.message || e).slice(0, 160); }
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env("MAIL_FROM") || "llmms ia <onboarding@resend.dev>", to: [email], subject, html, text }),
    });
    if (r.ok) return true;
    let m = ""; try { m = JSON.parse(await r.text())?.message || ""; } catch {}
    return m || `HTTP ${r.status}`;
  } catch (e) { return String(e?.message || e); }
}

export async function checkSession(token, env) {
  if (!token) return null;
  try {
    const { e, x, s } = JSON.parse(fromB64u(token));
    if (!e || !x || Date.now() > x) return null;
    if (!same(s, await hmac(secretOf(env), `sess|${e}|${x}`))) return null;
    if (!allowed(env, e)) return null;
    return e;
  } catch { return null; }
}

function mailHtml(code) {
  return `<div style="font-family:Arial,sans-serif;background:#141513;padding:32px;color:#ece9e1">
  <div style="max-width:420px;margin:auto;background:#1d1f1b;border:1px solid #3d4038;border-radius:16px;padding:28px;text-align:center">
    <div style="font-size:26px;color:#ece9e1"><span style="color:#eca474">✦</span> <b>llmms</b> ia</div>
    <p style="color:#cfcbc1;font-size:15px">Voici ton code de connexion :</p>
    <div style="font-size:38px;letter-spacing:10px;font-weight:700;color:#eca474;margin:14px 0">${code}</div>
    <p style="color:#9a978d;font-size:13px">Il expire dans ${CODE_MINUTES} minutes. Si tu n'as rien demandé, ignore cet e-mail.</p>
  </div></div>`;
}

// Gère les demandes « auth_status », « auth_start », « auth_verify ». Renvoie {status, json} ou null.
export async function handleAuth(body, env, sessionHeader) {
  const mode = body?.mode;
  if (mode === "auth_status") {
    const email = await checkSession(sessionHeader, env);
    return { status: 200, json: { enabled: authEnabled(env), ok: !authEnabled(env) || !!email, email } };
  }
  if (mode === "auth_start") {
    if (!authEnabled(env)) return { status: 400, json: { error: "La connexion par e-mail n'est pas activée sur ce site." } };
    const email = cleanEmail(body.email);
    if (!email) return { status: 400, json: { error: "Adresse e-mail invalide." } };
    if (!allowed(env, email)) return { status: 403, json: { error: "Cet e-mail n'a pas accès à llmms ia." } };
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const code = String(n).padStart(6, "0");
    const x = Date.now() + CODE_MINUTES * 60e3;
    const token = toB64u(JSON.stringify({ e: email, x, h: await hmac(secretOf(env), `code|${email}|${code}|${x}`) }));
    const sent = await sendCode(env, email, code);
    if (sent !== true) return { status: 502, json: { error: "L'e-mail n'a pas pu être envoyé" + (sent ? ` (${sent})` : "") + "." } };
    return { status: 200, json: { token } };
  }
  if (mode === "auth_verify") {
    let t; try { t = JSON.parse(fromB64u(body.token)); } catch { return { status: 400, json: { error: "Demande un nouveau code." } }; }
    const code = String(body.code || "").replace(/\D/g, "");
    if (!t?.e || Date.now() > t.x) return { status: 400, json: { error: "Code expiré : demande un nouveau code." } };
    if (code.length !== 6 || !same(t.h, await hmac(secretOf(env), `code|${t.e}|${code}|${t.x}`))) return { status: 400, json: { error: "Code incorrect." } };
    const x = Date.now() + SESSION_DAYS * 864e5;
    const session = toB64u(JSON.stringify({ e: t.e, x, s: await hmac(secretOf(env), `sess|${t.e}|${x}`) }));
    return { status: 200, json: { session, email: t.e } };
  }
  return null;
}
