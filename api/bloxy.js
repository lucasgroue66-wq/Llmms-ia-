// Vercel : /api/bloxy — BLOXY : joueurs en direct dans les jeux (positions + chat), niveaux et sites générés par l'IA (Gemini gratuit)
function kvConf() {
  const E = process.env, keys = Object.keys(E);
  const uk = keys.find(k => /REST_API_URL$|REDIS_REST_URL$/.test(k) && !/READ_ONLY/.test(k));
  const tk = uk && (keys.find(k => k === uk.replace(/URL$/, "TOKEN")) || keys.find(k => /REST_API_TOKEN$|REDIS_REST_TOKEN$/.test(k) && !/READ_ONLY/.test(k)));
  return uk && tk && E[uk] && E[tk] ? { url: E[uk].replace(/\/$/, ""), tok: E[tk] } : null;
}
async function kv(cmds) {
  const c = kvConf(); if (!c) throw new Error("base de données non configurée");
  const r = await fetch(`${c.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${c.tok}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("base " + r.status); return (await r.json()).map(x => x?.result);
}
const clean = (s, n) => String(s || "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(-1e6, Math.min(1e6, n)) : 0; };
const okId = s => /^[a-zA-Z0-9_-]{4,24}$/.test(s || "");

async function gemini(system, user, maxTokens) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("pas de clé Gemini");
  const models = (process.env.GEMINI_MODELS || "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.0-flash").split(",").map(s => s.trim()).filter(Boolean);
  let last = "";
  for (const model of models) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.9, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
      if (!r.ok) { last = model + " " + r.status; continue; }
      const j = await r.json(); const t = j?.choices?.[0]?.message?.content || ""; if (t) return t;
    } catch (e) { last = String(e.message || e); }
  }
  throw new Error("IA indisponible (" + last + ")");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "méthode" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const op = b.op;
    if (op === "pos") {
      if (!okId(b.room) || !okId(b.pid)) return res.status(400).json({ error: "salle" });
      const key = "llmms:bx:room:" + b.room, now = Date.now();
      const me = { n: clean(b.n, 20), c: b.c ? 1 : 0, eq: typeof b.eq === "object" && b.eq ? Object.fromEntries(Object.entries(b.eq).slice(0, 8).map(([k, v]) => [clean(k, 8), v ? clean(v, 12) : null])) : {}, body: clean(b.body, 8), x: num(b.x), y: num(b.y), m: clean(b.m, 80), mt: num(b.mt), t: now };
      const r = await kv([["HSET", key, b.pid, JSON.stringify(me)], ["EXPIRE", key, 60], ["HGETALL", key]]);
      const all = r[2] || [], out = [], old = [];
      for (let i = 0; i < all.length; i += 2) { const id = all[i]; let v; try { v = JSON.parse(all[i + 1]); } catch { continue; } if (now - v.t > 12000) { old.push(id); continue; } if (id !== b.pid) out.push({ id, ...v }); }
      if (old.length) kv([["HDEL", key, ...old]]).catch(() => {});
      return res.json({ players: out.slice(0, 30) });
    }
    if (op === "count") {
      const rooms = (Array.isArray(b.rooms) ? b.rooms : []).filter(okId).slice(0, 40); if (!rooms.length) return res.json({ counts: {} });
      const r = await kv(rooms.map(x => ["HLEN", "llmms:bx:room:" + x])); const counts = {}; rooms.forEach((x, i) => counts[x] = r[i] || 0); return res.json({ counts });
    }
    if (op === "ailevel") {
      const prompt = clean(b.prompt, 300) || "un obby fun";
      const t = await gemini(`Tu crées des niveaux de jeu de plateforme 2D vu de côté. Réponds UNIQUEMENT avec un JSON {"n":"nom court du niveau","rows":[...]} sans texte autour.
"rows" = exactement 12 chaînes de exactement 80 caractères (de haut en bas). Caractères : "." vide, "#" bloc, "L" lave, "o" pièce, "C" checkpoint, "F" arrivée (une seule, tout à la fin), "T" trampoline, "I" glace.
Règles : la ligne du bas (12e) a du sol "#" sur les 6 premières colonnes (départ). Le niveau doit être faisable : un saut monte de 3 cases max et va 4 cases plus loin max. Mets des pièces, 2 ou 3 checkpoints posés au-dessus de blocs, et l'arrivée posée sur un bloc à droite.`, `Niveau demandé : ${prompt}`, 3000);
      const m = t.match(/\{[\s\S]*\}/); if (!m) throw new Error("réponse IA illisible");
      const j = JSON.parse(m[0]); const rows = (Array.isArray(j.rows) ? j.rows : []).slice(0, 12).map(r => String(r).padEnd(80, ".").slice(0, 80));
      if (rows.length < 12) throw new Error("niveau incomplet");
      return res.json({ n: clean(j.n, 24) || "Niveau IA", rows });
    }
    if (op === "aisite") {
      const prompt = clean(b.prompt, 400) || "un site de pizzeria";
      const t = await gemini(`Tu es un générateur de sites web. Réponds UNIQUEMENT avec une page HTML complète (<!DOCTYPE html> … </html>), en français, moderne et belle (dégradés, cartes, gros titres, responsive mobile), CSS dans une balise <style>, sans JavaScript, sans image externe (utilise des emojis). Pas de texte autour.`, `Site demandé : ${prompt}`, 6000);
      const m = t.match(/<!DOCTYPE html>[\s\S]*<\/html>/i) || t.match(/<html[\s\S]*<\/html>/i); if (!m) throw new Error("réponse IA illisible");
      return res.json({ html: m[0].replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 60000) });
    }
    res.status(400).json({ error: "opération inconnue" });
  } catch (e) { res.status(500).json({ error: String(e.message || e).slice(0, 200) }); }
}
