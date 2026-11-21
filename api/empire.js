// Vercel : /api/empire — multijoueur d'EMPIRE MILLIONNAIRE : classement des vrais joueurs, codes amis, envois d'argent, défis, attaques, entrées en bourse
import { createHash } from "node:crypto";
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
const P = "llmms:emp:", DAY = 86400;
const okPid = s => /^[A-Z0-9]{6}$/.test(s || ""), okKey = s => /^[A-Z0-9]{8,16}$/.test(s || "");
const hash = s => createHash("sha256").update("empire:" + s).digest("hex");
const cleanName = s => String(s || "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 16) || "Joueur";
const num = (v, max = 1e30) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };
async function auth(pid, key) {
  if (!okPid(pid) || !okKey(key)) return false;
  const [h] = await kv([["GET", P + "k:" + pid]]);
  if (!h) { await kv([["SET", P + "k:" + pid, hash(key), "NX"]]); const [h2] = await kv([["GET", P + "k:" + pid]]); return h2 === hash(key); }
  return h === hash(key);
}
async function push(to, obj) { const k = P + "in:" + to; await kv([["RPUSH", k, JSON.stringify({ ...obj, ts: Date.now() })], ["LTRIM", k, -60, -1], ["EXPIRE", k, 30 * DAY]]); }
async function exists(pid) { const [e] = await kv([["EXISTS", P + "p:" + pid]]); return !!e; }
async function list(zkey, n = 30) {
  const r = (await kv([["ZREVRANGE", zkey, 0, n - 1, "WITHSCORES"]]))[0] || [];
  const ids = []; for (let i = 0; i < r.length; i += 2) ids.push([r[i], Number(r[i + 1])]);
  if (!ids.length) return [];
  const info = await kv(ids.map(([id]) => ["HMGET", P + "p:" + id, "n", "s", "l"]));
  return ids.map(([id, w], i) => ({ id, w, n: info[i]?.[0] || "Joueur", s: info[i]?.[1] || "🧑‍💼", l: info[i]?.[2] === "1" }));
}
const priceOf = w => Math.max(0.01, w / 2e6);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "méthode" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const op = String(b.op || ""), pid = String(b.pid || "").toUpperCase(), key = String(b.key || "").toUpperCase();
    if (op === "lb") return res.json({ list: await list(P + (b.legit ? "lbl" : "lba")) });
    if (op === "ipo_list") {
      const ids = ((await kv([["SRANDMEMBER", P + "ipos", 40]]))[0] || []).filter(okPid);
      if (!ids.length) return res.json({ list: [] });
      const r = await kv(ids.flatMap(id => [["HMGET", P + "ipo:" + id, "tot", "sold"], ["HMGET", P + "p:" + id, "n", "w", "s"]]));
      return res.json({ list: ids.map((id, i) => ({ id, tot: +r[2 * i]?.[0] || 0, sold: +r[2 * i]?.[1] || 0, n: r[2 * i + 1]?.[0] || "Joueur", w: +r[2 * i + 1]?.[1] || 0, s: r[2 * i + 1]?.[2] || "🧑‍💼", p: priceOf(+r[2 * i + 1]?.[1] || 0) })).filter(x => x.tot) });
    }
    if (!(await auth(pid, key))) return res.status(403).json({ error: "code joueur invalide" });
    const me = async () => cleanName((await kv([["HGET", P + "p:" + pid, "n"]]))[0]);

    if (op === "sync") {
      const w = num(b.worth), legit = b.legit ? 1 : 0, name = cleanName(b.name), s = String(b.skin || "🧑‍💼").slice(0, 8);
      const cmds = [["HSET", P + "p:" + pid, "n", name, "w", String(w), "l", String(legit), "s", s, "t", String(Date.now())], ["EXPIRE", P + "p:" + pid, 120 * DAY], ["ZADD", P + "lba", w, pid]];
      cmds.push(legit ? ["ZADD", P + "lbl", w, pid] : ["ZREM", P + "lbl", pid]);
      cmds.push(["LRANGE", P + "in:" + pid, 0, -1], ["DEL", P + "in:" + pid], ["ZREVRANK", P + "lba", pid], ["ZREVRANK", P + "lbl", pid], ["ZCARD", P + "lba"]);
      const r = await kv(cmds);
      const inbox = (r[4] || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return res.json({ ok: true, inbox, rank: r[6] == null ? null : r[6] + 1, rankL: r[7] == null ? null : r[7] + 1, players: r[8] || 0 });
    }
    const to = String(b.to || "").toUpperCase();
    const needTo = async () => { if (!okPid(to) || to === pid) throw new Error("code ami invalide"); if (!(await exists(to))) throw new Error("aucun joueur avec ce code"); };
    if (op === "who") { await needTo(); const [r] = await kv([["HMGET", P + "p:" + to, "n", "w", "s"]]); return res.json({ n: r?.[0], w: +r?.[1] || 0, s: r?.[2] || "🧑‍💼" }); }
    if (op === "send") { await needTo(); const amt = num(b.amt, 1e18); if (!amt) throw new Error("montant invalide"); await push(to, { t: "money", from: pid, name: await me(), amt, msg: String(b.msg || "").replace(/[<>]/g, "").slice(0, 80) }); return res.json({ ok: true }); }
    if (op === "chal") { await needTo(); await push(to, { t: "chal", from: pid, name: await me(), speed: num(b.speed, 500), stake: num(b.stake, 1e15), id: Math.random().toString(36).slice(2, 10) }); return res.json({ ok: true }); }
    if (op === "chalres") { await needTo(); await push(to, { t: "chalres", from: pid, name: await me(), win: !!b.win, stake: num(b.stake, 1e15) }); return res.json({ ok: true }); }
    if (op === "attack") { await needTo(); const kind = ["prix", "espion", "pub"].includes(b.kind) ? b.kind : "prix"; await push(to, { t: "attack", from: pid, name: await me(), kind }); return res.json({ ok: true }); }
    if (op === "ipo_open") { await kv([["HSETNX", P + "ipo:" + pid, "tot", "200000"], ["HSETNX", P + "ipo:" + pid, "sold", "0"], ["SADD", P + "ipos", pid]]); return res.json({ ok: true }); }
    if (op === "ipo_buy" || op === "ipo_sell") {
      const tg = String(b.target || "").toUpperCase(), n = Math.floor(num(b.n, 200000)); if (!okPid(tg) || !n) throw new Error("ordre invalide");
      const [tot, w] = await kv([["HGET", P + "ipo:" + tg, "tot"], ["HGET", P + "p:" + tg, "w"]]); if (!tot) throw new Error("cette entreprise n'est pas en bourse");
      const price = priceOf(+w || 0);
      if (op === "ipo_buy") {
        const [sold] = await kv([["HINCRBY", P + "ipo:" + tg, "sold", n]]);
        if (sold > +tot) { await kv([["HINCRBY", P + "ipo:" + tg, "sold", -n]]); throw new Error("plus assez d'actions disponibles"); }
        if (tg !== pid) await push(tg, { t: "ipo", from: pid, name: await me(), n, amt: n * price });
        return res.json({ ok: true, price });
      }
      const [sold] = await kv([["HINCRBY", P + "ipo:" + tg, "sold", -n]]); if (sold < 0) await kv([["HSET", P + "ipo:" + tg, "sold", "0"]]);
      return res.json({ ok: true, price });
    }
    res.status(400).json({ error: "opération inconnue" });
  } catch (e) { res.status(e.message?.startsWith("base") ? 500 : 400).json({ error: e.message }); }
}
