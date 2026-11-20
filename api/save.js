// Vercel : /api/save — sauvegarde en ligne d'EMPIRE MILLIONNAIRE (pour ne jamais perdre sa partie)
function kvConf() {
  const E = process.env, keys = Object.keys(E);
  const uk = keys.find(k => /REST_API_URL$|REDIS_REST_URL$/.test(k) && !/READ_ONLY/.test(k));
  const tk = uk && (keys.find(k => k === uk.replace(/URL$/, "TOKEN")) || keys.find(k => /REST_API_TOKEN$|REDIS_REST_TOKEN$/.test(k) && !/READ_ONLY/.test(k)));
  return uk && tk && E[uk] && E[tk] ? { url: E[uk].replace(/\/$/, ""), tok: E[tk] } : null;
}
async function kv(cmds) {
  const c = kvConf(); if (!c) throw new Error("base de données non configurée");
  const r = await fetch(`${c.url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${c.tok}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("base " + r.status); return r.json();
}
const okId = id => /^[A-Z0-9]{8,16}$/.test(id || "");
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const id = String(req.query?.id || "").toUpperCase(); if (!okId(id)) return res.status(400).json({ error: "code invalide" });
      const j = await kv([["GET", "llmms:save:" + id]]); const v = j?.[0]?.result;
      return res.status(200).json({ data: v ? JSON.parse(v) : null });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const id = String(b.id || "").toUpperCase(); if (!okId(id)) return res.status(400).json({ error: "code invalide" });
      const s = JSON.stringify(b.data || null); if (s.length > 950000) return res.status(413).json({ error: "sauvegarde trop grosse" });
      if (!b.data || typeof b.data.cash !== "number") return res.status(400).json({ error: "sauvegarde invalide" });
      await kv([["SET", "llmms:save:" + id, s, "EX", 60 * 60 * 24 * 180]]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "méthode" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
