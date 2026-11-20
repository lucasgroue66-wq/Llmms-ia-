// Vercel : /api/studio — liaison SITE <-> PLUGIN ROBLOX STUDIO, sans rien installer sur le PC.
// Le site dépose des commandes (run_code, get_tree…) dans une file liée à un code d'appairage ;
// le plugin llmms ia (dans Studio) vient les chercher, les exécute et renvoie le résultat.
// Stockage : Upstash / Vercel KV (même base que les limites de messages).

function kvConf() {
  const E = process.env, keys = Object.keys(E);
  const uk = keys.find(k => /REST_API_URL$|REDIS_REST_URL$/.test(k) && !/READ_ONLY/.test(k));
  const tk = uk && (keys.find(k => k === uk.replace(/URL$/, "TOKEN")) || keys.find(k => /REST_API_TOKEN$|REDIS_REST_TOKEN$/.test(k) && !/READ_ONLY/.test(k)));
  return uk && tk && E[uk] && E[tk] ? { url: E[uk].replace(/\/$/, ""), tok: E[tk] } : null;
}
async function kv(cmds) {
  const c = kvConf(); if (!c) throw new Error("base de données non configurée");
  const r = await fetch(`${c.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${c.tok}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("base " + r.status);
  return r.json();
}
const K = code => `llmms:stu:${code}`;
const okCode = c => /^[A-Z0-9]{6,12}$/.test(c || "");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const b = req.method === "POST" ? (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {})) : {};
    const op = String(req.query?.op || b.op || "");
    const code = String(req.query?.code || b.code || "").toUpperCase();
    if (!okCode(code)) return res.status(400).json({ error: "code invalide" });
    const k = K(code);

    // ---- côté PLUGIN ----
    if (op === "poll") { // le plugin récupère ses commandes + signale qu'il est en ligne
      const place = String(req.query?.place || b.place || "").slice(0, 80);
      const j = await kv([["LPOP", k + ":q", 10], ["SET", k + ":seen", JSON.stringify({ t: Date.now(), place }), "EX", 30]]);
      const raw = j?.[0]?.result; const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return res.status(200).json({ cmds: list.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) });
    }
    if (op === "result") {
      const id = String(b.id || "").slice(0, 40); if (!id) return res.status(400).json({ error: "id manquant" });
      const out = JSON.stringify({ text: String(b.text ?? "").slice(0, 600000), isError: !!b.isError });
      await kv([["SET", `${k}:r:${id}`, out, "EX", 300]]);
      return res.status(200).json({ ok: true });
    }

    // ---- côté SITE ----
    if (op === "status") {
      const j = await kv([["GET", k + ":seen"]]); let s = null; try { s = JSON.parse(j?.[0]?.result || "null"); } catch {}
      return res.status(200).json({ online: !!s && Date.now() - s.t < 20000, place: s?.place || "" });
    }
    if (op === "send") {
      const id = String(b.id || "").slice(0, 40), tool = String(b.tool || "").slice(0, 60);
      if (!id || !tool) return res.status(400).json({ error: "commande incomplète" });
      const cmd = JSON.stringify({ id, tool, args: b.args || {} });
      if (cmd.length > 200000) return res.status(413).json({ error: "commande trop grosse" });
      await kv([["RPUSH", k + ":q", cmd], ["EXPIRE", k + ":q", 600]]);
      return res.status(200).json({ ok: true });
    }
    if (op === "get") { // le site attend le résultat (attente courte côté serveur pour limiter les allers-retours)
      const id = String(req.query?.id || b.id || "").slice(0, 40); const t0 = Date.now();
      while (Date.now() - t0 < 8000) {
        const j = await kv([["GET", `${k}:r:${id}`]]); const v = j?.[0]?.result;
        if (v) { await kv([["DEL", `${k}:r:${id}`]]); return res.status(200).json({ done: true, ...JSON.parse(v) }); }
        await new Promise(r => setTimeout(r, 700));
      }
      return res.status(200).json({ done: false });
    }
    return res.status(400).json({ error: "opération inconnue" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
