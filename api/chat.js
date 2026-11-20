// Vercel : /api/chat (Node 20+). La logique est dans lib/core.js.
// Mode gratuit : si OpenRouter dit « plus de crédits » (402), on renvoie la demande au routeur gratuit.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const r = await realFetch(url, opts);
  if (r.status !== 402 || !String(url).includes("openrouter.ai/api/v1/chat/completions")) return r;
  try {
    const b = JSON.parse(opts.body);
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
