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
// Consignes en plus pour les modèles gratuits : ils doivent réfléchir plus et livrer du code complet et testé
const BOOST = `

=== Niveau d'exigence maximal ===
Avant de répondre, réfléchis en profondeur (tu as un budget de réflexion : utilise-le) :
1) Reformule pour toi ce que l'utilisateur veut VRAIMENT obtenir à la fin (le résultat visible), y compris ce qu'il n'a pas dit mais qu'un pro ferait.
2) Planifie l'architecture complète (fichiers / scripts, où chacun va, comment ils communiquent, données).
3) Écris TOUT le code, en entier, sans « ... », sans TODO, sans parties « à adapter ».
4) Relis-toi comme un testeur : exécute mentalement chaque script ligne par ligne (Roblox : ordre de chargement, WaitForChild, client/serveur, RemoteEvents sécurisés, nil, joueur qui quitte ; web : chaque fonction appelée existe, chaque variable est déclarée, la boucle démarre, rien ne reste noir). Corrige toutes les erreurs AVANT d'envoyer.
5) Soigne le rendu final comme un jeu populaire : UI moderne (UICorner, UIStroke, UIGradient, tweens, sons), effets, animations fluides, textes clairs.
Roblox : indique pour CHAQUE script son type (Script / LocalScript / ModuleScript) et son emplacement exact dans l'Explorer (ex. ServerScriptService > GameManager). Pour une cinématique Roblox : vraie caméra scriptée (Camera.CameraType = Scriptable, TweenService sur CFrame et FieldOfView, plans enchaînés avec durées, easing cinéma, bandes noires en ScreenGui, fondus, textes, puis rendu de la caméra au joueur), décor construit par script si besoin.
Cinématique / animation web : canvas qui dessine dès la première image, plans détaillés, vraie caméra, transitions, pas d'écran noir.`;
function boostSystem(msgs) {
  const out = msgs.map(cleanMsg);
  const i = out.findIndex(m => m.role === "system");
  if (i >= 0 && typeof out[i].content === "string" && !out[i].content.includes("Niveau d'exigence maximal")) out[i] = { ...out[i], content: out[i].content + BOOST };
  return out;
}
async function tryGemini(b, opts) {
  const key = process.env.GEMINI_API_KEY; if (!key) return null;
  const effort = b.reasoning?.effort || "medium";
  for (const model of await gemModels(key)) {
    if ((gemDead.get(model) || 0) > Date.now()) continue;
    const g = { model, stream: !!b.stream, messages: boostSystem(b.messages || []), max_tokens: Math.min(Math.max(b.max_tokens || 32000, 32000), 60000) };
    if (!/gemma/i.test(model)) g.reasoning_effort = effort === "low" ? "low" : effort === "medium" ? "medium" : "high";
    if (b.tools) { g.tools = b.tools; g.tool_choice = "auto"; }
    for (let k = 0; k < 3; k++) {
      try {
        const r = await realFetch(`${GEM_BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(g), signal: opts?.signal });
        if (r.ok) return r;
        if (r.status === 400 && g.reasoning_effort) { delete g.reasoning_effort; continue; }
        if (r.status === 400 && g.max_tokens > 8192) { g.max_tokens = 8192; continue; }
        if (r.status === 400 && g.tools) { delete g.tools; delete g.tool_choice; continue; }
        if (r.status === 429) gemDead.set(model, Date.now() + 60e3);
        if (r.status === 404 || r.status === 403) gemDead.set(model, Date.now() + 6 * 3600e3);
      } catch {}
      break;
    }
  }
  return null;
}
// Images gratuites : Gemini écrit un prompt détaillé en anglais, puis Pollinations dessine (gratuit, sans clé)
const textOfMsg = c => typeof c === "string" ? c : Array.isArray(c) ? c.filter(p => p.type === "text").map(p => p.text).join(" ") : "";
async function imagePrompt(msgs, opts) {
  const conv = msgs.filter(m => m.role !== "system").slice(-8).map(m => `${m.role === "user" ? "Utilisateur" : "Assistant"} : ${textOfMsg(m.content).slice(0, 1500)}`).join("\n");
  const last = textOfMsg([...msgs].reverse().find(m => m.role === "user")?.content || "");
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    for (const model of (await gemModels(key)).filter(m => !/gemma/i.test(m)).slice(0, 4)) {
      if ((gemDead.get(model) || 0) > Date.now()) continue;
      try {
        const r = await realFetch(`${GEM_BASE}/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: opts?.signal,
          body: JSON.stringify({ model, max_tokens: 3000, reasoning_effort: "low", messages: [{ role: "system", content: "You write prompts for an AI image generator (FLUX) that does NOT know nicknames and often gets people wrong. From the conversation, describe in ONE detailed English paragraph (max 110 words) the image the user wants NOW, applying their latest edits to the previous image. VERY IMPORTANT: when the user names a real person, athlete, celebrity, character, team, game or brand (even by a nickname like CR7, Messi, Mbappé, Neymar, Spider-Man, Roblox), START the prompt with the full real name and gender, then describe precisely what they look like at the requested time (age, face, hair, skin tone, body, typical outfit/jersey with colors and number, team, era, accessories) so the image is clearly recognizable; e.g. CR7 prime 2008 = Cristiano Ronaldo, 23-year-old Portuguese male footballer, short dark gelled hair, athletic, Manchester United red #7 jersey. Keep the requested style (pencil drawing, colored pencils, manga, realistic, watercolor, Roblox…). Include composition, background, lighting, quality words. Text in the image goes in quotes. Output only the prompt." }, { role: "user", content: conv }] }) });
        if (r.ok) { const j = await r.json(); const t = j?.choices?.[0]?.message?.content?.trim(); if (t) return t.slice(0, 900); }
        else if (r.status === 429) gemDead.set(model, Date.now() + 60e3);
      } catch {}
    }
  }
  return last.replace(/\[Style demandé[^\]]*\]/, "").trim().slice(0, 600) || "a beautiful illustration";
}
async function freeImage(b, opts) {
  try {
    const prompt = await imagePrompt(b.messages || [], opts);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e9)}`;
    let img = null;
    for (let k = 0; k < 2 && !img; k++) {
      const r = await realFetch(url, { signal: opts?.signal });
      if (r.ok && /^image\//.test(r.headers.get("content-type") || "")) img = r;
      else await new Promise(res => setTimeout(res, 4000));
    }
    if (!img) return null;
    const type = img.headers.get("content-type") || "image/jpeg";
    const data = `data:${type};base64,${Buffer.from(await img.arrayBuffer()).toString("base64")}`;
    return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Voici ton image 🎨", images: [{ type: "image_url", image_url: { url: data } }] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch { return null; }
}
globalThis.fetch = async (url, opts) => {
  const r = await realFetch(url, opts);
  if (r.ok || !String(url).includes(OR_URL)) return r;
  // Plus de crédits : code 402, ou un autre code avec un message « credits / balance / afford »
  let noMoney = r.status === 402;
  if (!noMoney) { try { noMoney = /credit|balance|afford|insufficient|payment/i.test(await r.clone().text()); } catch {} }
  if (!noMoney) return r;
  try {
    const b = JSON.parse(opts.body);
    if (b.modalities) return (await freeImage(b, opts)) || r; // images : version gratuite (Pollinations)
    const g = await tryGemini(b, opts); if (g) return g;
    b.model = "openrouter/free"; delete b.reasoning; b.max_tokens = Math.min(b.max_tokens || 16000, 16000); b.messages = boostSystem(b.messages || []);
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
