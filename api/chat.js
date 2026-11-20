// Vercel : /api/chat (Node 20+). La logique est dans lib/core.js.
// Mode gratuit : si OpenRouter dit « plus de crédits » (402), on passe sur Google Gemini (gratuit)
// puis sur le routeur gratuit d'OpenRouter. Clé Google dans Vercel : GEMINI_API_KEY.
const realFetch = globalThis.fetch;
const OR_URL = "openrouter.ai/api/v1/chat/completions";
const GEM_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
// Chaque modèle gratuit de Google a SON PROPRE quota : on les utilise tous, l'un après l'autre.
let gemList = null, gemAt = 0;
const gemDead = new Map();
function rank(id) { const v = parseFloat((id.match(/(\d+(?:\.\d+)?)/) || [])[1] || 0); return (id.includes("gemma") ? 0 : 1000) + v * 10 + (id.includes("lite") ? 0 : 5); }
async function gemModels(key) {
  if (process.env.GEMINI_MODELS) return process.env.GEMINI_MODELS.split(",").map(x => x.trim()).filter(Boolean);
  if (gemList && Date.now() - gemAt < 6 * 3600e3) return gemList;
  try {
    const r = await realFetch(`${GEM_BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json();
    const ids = (j.data || []).map(m => String(m.id || "").replace(/^models\//, ""))
      .filter(id => /(flash|gemma)/i.test(id) && !/(image|tts|live|audio|transcri|embed|robot|computer|vision|banana|native)/i.test(id));
    if (ids.length) { gemList = [...new Set(ids)].sort((a, b) => rank(b) - rank(a)).slice(0, 14); gemAt = Date.now(); return gemList; }
  } catch {}
  return ["gemini-flash-latest", "gemini-flash-lite-latest"];
}
function cleanMsg(m) { const o = { role: m.role, content: m.content ?? "" }; if (m.tool_calls) o.tool_calls = m.tool_calls; if (m.tool_call_id) o.tool_call_id = m.tool_call_id; if (m.name) o.name = m.name; return o; }
async function tryGemini(b, opts) {
  const key = process.env.GEMINI_API_KEY; if (!key) return null;
  for (const model of await gemModels(key)) {
    if ((gemDead.get(model) || 0) > Date.now()) continue;
    const g = { model, stream: !!b.stream, messages: (b.messages || []).map(cleanMsg), max_tokens: Math.min(b.max_tokens || 16000, 16000) };
    if (b.tools) { g.tools = b.tools; g.tool_choice = "auto"; }
    for (let k = 0; k < 2; k++) {
      try {
        const r = await realFetch(`${GEM_BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(g), signal: opts?.signal });
        if (r.ok) return r;
        if (r.status === 400 && g.tools) { delete g.tools; delete g.tool_choice; continue; }
        if (r.status === 429) gemDead.set(model, Date.now() + 60e3);
        if (r.status === 404 || r.status === 403) gemDead.set(model, Date.now() + 6 * 3600e3);
      } catch {}
      break;
    }
  }
  return null;
}
globalThis.fetch = async (url, opts) => {
  const r = await realFetch(url, opts);
  if (r.status !== 402 || !String(url).includes(OR_URL)) return r;
  try {
    const b = JSON.parse(opts.body);
    if (b.modalities) return r; // création d'images : pas de version gratuite
    const g = await tryGemini(b, opts); if (g) return g;
    b.model = "openrouter/free"; delete b.reasoning; b.max_tokens = Math.min(b.max_tokens || 16000, 16000);
    let r2 = await realFetch(url, { ...opts, body: JSON.stringify(b) });
    if (!r2.ok && b.tools) { delete b.tools; delete b.tool_choice; delete b.parallel_tool_calls; r2 = await realFetch(url, { ...opts, body: JSON.stringify(b) }); }
    return r2;
  } catch { return r; }
};
let mods = null, loadErr = null;
async function load() {
  if (mods || loadErr) return;
  try {
    const core = await import("../lib/core.js");
    const auth = await import("../lib/auth.js");
    mods = { ...core, ...auth };
  } catch (e) { loadErr = String(e?.stack || e?.message || e); }
}

export default async function handler(req, res) {
  await load();
  if (loadErr) { res.status(500).json({ error: "Chargement du serveur impossible : " + loadErr }); return; }
  const { precheck, startChat, authEnabled, checkSession, handleAuth } = mods;
  if (req.method !== "POST") { res.status(405).json({ error: "POST seulement", ok: true }); return; }

  try {
    const env = k => process.env[k];
    const bad = precheck(env, req.headers["x-llmms-code"]);
    if (bad) { res.status(bad.status).json({ error: bad.error }); return; }

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

    const sessionHeader = req.headers["x-llmms-session"];
    const auth = await handleAuth(body || {}, env, sessionHeader);
    if (auth) { res.status(auth.status).json(auth.json); return; }
    if (authEnabled(env) && !(await checkSession(sessionHeader, env))) { res.status(401).json({ error: "login" }); return; }

    let out;
    try { out = await startChat(body || {}, env); }
    catch (e) { out = { events: (async function* () { yield { t: "error", v: String(e?.message || e) }; })() }; }

    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    if (out.stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("X-Llmms-Model", out.name);
      const reader = out.stream.getReader();
      try { for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(Buffer.from(value)); } } catch {}
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    try { for await (const ev of out.events) res.write(JSON.stringify(ev) + "\n"); }
    catch (e) { res.write(JSON.stringify({ t: "error", v: String(e?.message || e) }) + "\n"); }
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur : " + String(e?.message || e) });
    else res.end();
  }
      }
