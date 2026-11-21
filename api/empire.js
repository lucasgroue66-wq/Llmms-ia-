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
      { const sk = P + "season:" + Math.floor(Date.now() / (30 * DAY * 1000)); cmds.push(legit ? ["ZADD", sk, w, pid] : ["ZREM", sk, pid], ["EXPIRE", sk, 100 * DAY]); }
      const r = await kv(cmds);
      const inbox = (r[4] || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return res.json({ ok: true, inbox, rank: r[6] == null ? null : r[6] + 1, rankL: r[7] == null ? null : r[7] + 1, players: r[8] || 0 });
    }
    const to = String(b.to || "").toUpperCase();
    const needTo = async () => { if (!okPid(to) || to === pid) throw new Error("code ami invalide"); if (!(await exists(to))) throw new Error("aucun joueur avec ce code"); };
    if (op === "who") { await needTo(); const [r] = await kv([["HMGET", P + "p:" + to, "n", "w", "s"]]); return res.json({ n: r?.[0], w: +r?.[1] || 0, s: r?.[2] || "🧑‍💼" }); }
    if (op === "send") { await needTo(); const amt = num(b.amt, 1e18); if (!amt) throw new Error("montant invalide"); await push(to, { t: "money", from: pid, name: await me(), amt, msg: String(b.msg || "").replace(/[<>]/g, "").slice(0, 80) }); return res.json({ ok: true }); }
    if (op === "chal") { await needTo(); await push(to, { t: "chal", from: pid, name: await me(), speed: num(b.speed, 500), stake: num(b.stake, 1e15), game: String(b.game || "").replace(/\W/g, "").slice(0, 10), id: Math.random().toString(36).slice(2, 10) }); return res.json({ ok: true }); }
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

    const clean = (v, n) => String(v || "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
    const BAD = /\b(con|conne|pute|merde|fdp|nique|salope|enculé)\b/gi;
    const parse = x => { try { return JSON.parse(x); } catch { return null; } };
    if (op === "pub") { await kv([["HSET", P + "p:" + pid, "pub", String(b.data || "").slice(0, 4000), "rg", clean(b.region, 12)]]); return res.json({ ok: true }); }
    if (op === "view") { await needTo(); const [r] = await kv([["HMGET", P + "p:" + to, "n", "w", "s", "pub", "t", "l", "rg"]]); return res.json({ n: r?.[0], w: +r?.[1] || 0, s: r?.[2] || "🧑‍💼", pub: r?.[3] || "", t: +r?.[4] || 0, l: r?.[5] === "1", rg: r?.[6] || "" }); }
    if (["msg", "gift", "trade", "tradeok", "coop", "coopok", "react", "ref"].includes(op)) { await needTo(); await push(to, { t: op, from: pid, name: await me(), text: clean(b.text, 200).replace(BAD, "***"), voice: !!b.voice, item: clean(b.item, 40), amt: num(b.amt, 1e15), kind: clean(b.kind, 20), emo: clean(b.emo, 8), id: clean(b.id, 12) }); return res.json({ ok: true }); }
    if (op === "gsay") { const t = clean(b.text, 140).replace(BAD, "***"); if (!t) throw new Error("message vide"); await kv([["LPUSH", P + "gchat", JSON.stringify({ id: pid, n: await me(), t, ts: Date.now() })], ["LTRIM", P + "gchat", 0, 59]]); return res.json({ ok: true }); }
    if (op === "gread") { const [l] = await kv([["LRANGE", P + "gchat", 0, 39]]); return res.json({ list: (l || []).map(parse).filter(Boolean) }); }
    if (op === "report") { await kv([["RPUSH", P + "reports", JSON.stringify({ by: pid, who: clean(b.who, 10), why: clean(b.why, 80), ts: Date.now() })], ["LTRIM", P + "reports", -300, -1]]); return res.json({ ok: true }); }
    const wk = Math.floor(Date.now() / (7 * DAY * 1000)), gk = g => P + "t:" + clean(g, 10).replace(/\W/g, "") + ":" + wk;
    if (op === "tsub") { const k = gk(b.game), sc = num(b.score, 1e12); const [old] = await kv([["ZSCORE", k, pid]]); if (old == null || sc > +old) await kv([["ZADD", k, sc, pid], ["EXPIRE", k, 21 * DAY]]); return res.json({ ok: true }); }
    if (op === "tlb") return res.json({ list: await list(gk(b.game), 20) });
    if (op === "hv_put") { const it = { id: Math.random().toString(36).slice(2, 10), by: pid, n: await me(), item: clean(b.item, 40), price: num(b.price, 1e15), ts: Date.now() }; if (!it.item || !it.price) throw new Error("annonce invalide"); await kv([["LPUSH", P + "hv", JSON.stringify(it)], ["LTRIM", P + "hv", 0, 59]]); return res.json({ ok: true }); }
    if (op === "hv_list") { const [l] = await kv([["LRANGE", P + "hv", 0, 59]]); return res.json({ list: (l || []).map(parse).filter(Boolean) }); }
    if (op === "hv_buy") { const [l] = await kv([["LRANGE", P + "hv", 0, 59]]); const raw = (l || []).find(x => parse(x)?.id === clean(b.id, 12)); if (!raw) throw new Error("annonce déjà vendue"); const it = parse(raw); if (it.by === pid) throw new Error("c'est ton annonce"); const [rm] = await kv([["LREM", P + "hv", 1, raw]]); if (!rm) throw new Error("annonce déjà vendue"); await push(it.by, { t: "money", from: pid, name: await me(), amt: it.price, msg: "Achat de « " + it.item + " » à l'hôtel des ventes" }); return res.json({ ok: true, item: it.item, price: it.price }); }
    if (op === "clan_new") { const id = Math.random().toString(36).slice(2, 7).toUpperCase(), n = cleanName(b.name); await kv([["HSET", P + "clan:" + id, "n", n, "chef", pid, "pts", "0", "priv", b.priv ? "1" : "0"], ["SADD", P + "clanm:" + id, pid], ["HSET", P + "p:" + pid, "clan", id], ...(b.priv ? [] : [["SADD", P + "clans", id]])]); return res.json({ ok: true, id }); }
    if (op === "clan_list") { const ids = ((await kv([["SRANDMEMBER", P + "clans", 20]]))[0] || []); if (!ids.length) return res.json({ list: [] }); const r = await kv(ids.flatMap(id => [["HMGET", P + "clan:" + id, "n", "pts"], ["SCARD", P + "clanm:" + id]])); return res.json({ list: ids.map((id, i) => ({ id, n: r[2 * i]?.[0] || "Clan", pts: +r[2 * i]?.[1] || 0, m: r[2 * i + 1] || 0 })).sort((a, c) => c.pts - a.pts) }); }
    const cid = clean(b.clan, 5).toUpperCase();
    if (op === "clan_join") { const [e] = await kv([["EXISTS", P + "clan:" + cid]]); if (!e) throw new Error("clan introuvable"); await kv([["SADD", P + "clanm:" + cid, pid], ["HSET", P + "p:" + pid, "clan", cid]]); return res.json({ ok: true }); }
    if (op === "clan_info") { const r = await kv([["HMGET", P + "clan:" + cid, "n", "pts", "chef"], ["SMEMBERS", P + "clanm:" + cid], ["LRANGE", P + "clanc:" + cid, 0, 29]]); const mem = (r[1] || []).slice(0, 50); const names = mem.length ? await kv(mem.map(m => ["HMGET", P + "p:" + m, "n", "w"])) : []; return res.json({ n: r[0]?.[0], pts: +r[0]?.[1] || 0, chef: r[0]?.[2], mem: mem.map((m, i) => ({ id: m, n: names[i]?.[0] || "Joueur", w: +names[i]?.[1] || 0 })), chat: (r[2] || []).map(parse).filter(Boolean) }); }
    if (op === "clan_give") { await kv([["HINCRBY", P + "clan:" + cid, "pts", Math.floor(num(b.n, 1e6))]]); return res.json({ ok: true }); }
    if (op === "clan_say") { const t = clean(b.text, 140).replace(BAD, "***"); if (!t) throw new Error("message vide"); await kv([["LPUSH", P + "clanc:" + cid, JSON.stringify({ n: await me(), t, ts: Date.now() })], ["LTRIM", P + "clanc:" + cid, 0, 49], ["EXPIRE", P + "clanc:" + cid, 60 * DAY]]); return res.json({ ok: true }); }

    /* ---- monde partagé : journal, coupe du monde, emplois, présidence, objets uniques, fin du monde, duo, lives entre amis, Disko ---- */
    const mo = Math.floor(Date.now() / (30 * DAY * 1000)), ids = v => (Array.isArray(v) ? v : []).map(x => String(x).toUpperCase()).filter(okPid).slice(0, 60);
    if (op === "news_add") { const t = clean(b.text, 120).replace(BAD, "***"); if (!t) throw new Error("vide"); await kv([["LPUSH", P + "news", JSON.stringify({ n: await me(), t, ts: Date.now() })], ["LTRIM", P + "news", 0, 99]]); return res.json({ ok: true }); }
    if (op === "news_list") { const [l] = await kv([["LRANGE", P + "news", 0, 99]]); return res.json({ list: (l || []).map(parse).filter(Boolean) }); }
    if (op === "wc_join") { await kv([["ZADD", P + "wc:" + mo, num(b.rating, 1000), pid], ["EXPIRE", P + "wc:" + mo, 70 * DAY]]); return res.json({ ok: true }); }
    if (op === "wc_get") return res.json({ mo, list: await list(P + "wc:" + mo, 16) });
    if (op === "job_offer") { await needTo(); await push(to, { t: "job", from: pid, name: await me(), amt: num(b.pay, 1e12) }); return res.json({ ok: true }); }
    if (op === "job_ok") { await needTo(); await kv([["SADD", P + "jobs:" + to, pid], ["HSET", P + "p:" + pid, "boss", to]]); await push(to, { t: "jobok", from: pid, name: await me() }); return res.json({ ok: true }); }
    if (op === "job_quit") { const [bo] = await kv([["HGET", P + "p:" + pid, "boss"]]); if (bo) { await kv([["SREM", P + "jobs:" + bo, pid], ["HDEL", P + "p:" + pid, "boss"]]); await push(bo, { t: "jobquit", from: pid, name: await me() }); } return res.json({ ok: true }); }
    if (op === "job_fire") { await needTo(); await kv([["SREM", P + "jobs:" + pid, to], ["HDEL", P + "p:" + to, "boss"]]); await push(to, { t: "jobfire", from: pid, name: await me() }); return res.json({ ok: true }); }
    if (op === "job_work") { const [bo] = await kv([["HGET", P + "p:" + pid, "boss"]]); if (!bo) throw new Error("tu n'as pas de patron"); await push(bo, { t: "money", from: pid, name: await me(), amt: num(b.amt, 1e12), msg: "Travail de ton employé(e)" }); return res.json({ ok: true }); }
    if (op === "job_info") { const [[bo], [w]] = [await kv([["HGET", P + "p:" + pid, "boss"]]), await kv([["SMEMBERS", P + "jobs:" + pid]])]; const all = [bo, ...(w || [])].filter(okPid); const nm = all.length ? await kv(all.map(x => ["HGET", P + "p:" + x, "n"])) : []; const N = Object.fromEntries(all.map((x, i) => [x, nm[i] || "Joueur"])); return res.json({ boss: bo ? { id: bo, n: N[bo] } : null, workers: (w || []).map(x => ({ id: x, n: N[x] })) }); }
    if (op === "pres_run") { await kv([["HSET", P + "pres:" + wk, pid, JSON.stringify({ n: await me(), law: clean(b.law, 12), slogan: clean(b.slogan, 60).replace(BAD, "***") })], ["EXPIRE", P + "pres:" + wk, 30 * DAY]]); return res.json({ ok: true }); }
    if (op === "pres_vote") { const tg = String(b.target || "").toUpperCase(); if (!okPid(tg)) throw new Error("candidat invalide"); await kv([["HSET", P + "presv:" + wk, pid, tg], ["EXPIRE", P + "presv:" + wk, 30 * DAY]]); return res.json({ ok: true }); }
    if (op === "pres_get") { const r = await kv([["HGETALL", P + "pres:" + wk], ["HGETALL", P + "presv:" + wk], ["HGETALL", P + "pres:" + (wk - 1)], ["HGETALL", P + "presv:" + (wk - 1)], ["HGET", P + "presv:" + wk, pid]]);
      const tally = (c, v) => { const C = {}; for (let i = 0; i < (c || []).length; i += 2) C[c[i]] = { id: c[i], ...(parse(c[i + 1]) || {}), v: 0 }; for (let i = 0; i < (v || []).length; i += 2) if (C[v[i + 1]]) C[v[i + 1]].v++; return Object.values(C).sort((a, d) => d.v - a.v); };
      const prev = tally(r[2], r[3]); return res.json({ wk, cands: tally(r[0], r[1]), pres: prev[0] && prev[0].v ? prev[0] : null, myVote: r[4] || null }); }
    const UNIQ = { car1: [1e6, "🏎️ La voiture n°1"], diam: [5e6, "💎 Le diamant maudit"], ball: [2e6, "⚽ Le Ballon d'or légendaire"], crown: [2e7, "👑 La couronne du serveur"], key: [5e5, "🗝️ La clé mystère"], egg: [3e6, "🥚 L'œuf de dragon unique"] };
    if (op === "uniq_list") { const [h] = await kv([["HGETALL", P + "uniq"]]); const O = {}; for (let i = 0; i < (h || []).length; i += 2) O[h[i]] = parse(h[i + 1]); return res.json({ list: Object.entries(UNIQ).map(([k, [p0, n]]) => ({ k, n, own: O[k] || null, price: O[k] ? O[k].p * 1.5 : p0 })) }); }
    if (op === "uniq_buy") { const k = clean(b.item, 8); if (!UNIQ[k]) throw new Error("objet inconnu"); const [cur] = await kv([["HGET", P + "uniq", k]]); const o = parse(cur); if (o && o.id === pid) throw new Error("tu l'as déjà"); const price = o ? o.p * 1.5 : UNIQ[k][0]; if (num(b.offer, 1e18) < price) throw new Error("le prix a changé, recharge"); await kv([["HSET", P + "uniq", k, JSON.stringify({ id: pid, n: await me(), p: price, ts: Date.now() })]]); if (o) await push(o.id, { t: "money", from: pid, name: await me(), amt: price, msg: "Rachat de " + UNIQ[k][1] }); return res.json({ ok: true, price }); }
    const dk = P + "doom:" + mo;
    if (op === "doom_add") { const a = num(b.amt, 1e15); if (!a) throw new Error("montant invalide"); await kv([["ZINCRBY", dk, a, pid], ["EXPIRE", dk, 70 * DAY]]); return res.json({ ok: true }); }
    if (op === "doom_get") { const top = await list(dk, 10); const [all] = await kv([["ZRANGE", dk, 0, -1, "WITHSCORES"]]); let tot = 0, n = 0; for (let i = 1; i < (all || []).length; i += 2) { tot += +all[i]; n++; } return res.json({ mo, tot, n, top, now: Date.now() }); }
    if (op === "duo_req") { await needTo(); await push(to, { t: "duo", from: pid, name: await me() }); return res.json({ ok: true }); }
    if (op === "duo_ok") { await needTo(); const pair = [pid, to].sort().join("-"); await kv([["HSET", P + "p:" + pid, "duo", to], ["HSET", P + "p:" + to, "duo", pid], ["HSETNX", P + "duo:" + pair, "bank", "0"]]); await push(to, { t: "duook", from: pid, name: await me() }); return res.json({ ok: true }); }
    const duoOf = async () => { const [d] = await kv([["HGET", P + "p:" + pid, "duo"]]); if (!okPid(d)) throw new Error("pas de duo"); return { d, k: P + "duo:" + [pid, d].sort().join("-") }; };
    if (op === "duo_get") { const [d] = await kv([["HGET", P + "p:" + pid, "duo"]]); if (!okPid(d)) return res.json({ duo: null }); const k = P + "duo:" + [pid, d].sort().join("-"); const r = await kv([["HMGET", P + "p:" + d, "n", "w", "s"], ["HGETALL", k], ["LRANGE", k + ":log", 0, 19]]); const H = {}; for (let i = 0; i < (r[1] || []).length; i += 2) H[r[1][i]] = r[1][i + 1]; return res.json({ duo: { id: d, n: r[0]?.[0] || "Joueur", w: +r[0]?.[1] || 0, s: r[0]?.[2] || "🧑", bank: +H.bank || 0, roleA: H["r:" + pid] || "", roleB: H["r:" + d] || "", vote: parse(H.vote || "null"), log: (r[2] || []).map(parse).filter(Boolean) } }); }
    if (op === "duo_put" || op === "duo_take") { const { k } = await duoOf(); let a = num(b.amt, 1e15); if (op === "duo_take") { const [bank] = await kv([["HGET", k, "bank"]]); a = Math.min(a, (+bank || 0) / 2); if (a <= 0) throw new Error("coffre vide"); } await kv([["HINCRBYFLOAT", k, "bank", op === "duo_put" ? a : -a], ["LPUSH", k + ":log", JSON.stringify({ n: await me(), t: (op === "duo_put" ? "+" : "-") + Math.round(a), ts: Date.now() })], ["LTRIM", k + ":log", 0, 19]]); return res.json({ ok: true, amt: a }); }
    if (op === "duo_role") { const { k } = await duoOf(); await kv([["HSET", k, "r:" + pid, clean(b.role, 12)]]); return res.json({ ok: true }); }
    if (op === "duo_vote") { const { k } = await duoOf(); const [v] = await kv([["HGET", k, "vote"]]); let V = parse(v); if (b.q) V = { q: clean(b.q, 80), by: pid, yes: [pid], no: [] }; else if (V) { V.yes = V.yes.filter(x => x !== pid); V.no = V.no.filter(x => x !== pid); (b.yes ? V.yes : V.no).push(pid); } await kv([["HSET", k, "vote", JSON.stringify(V)]]); return res.json({ ok: true }); }
    if (op === "duo_split") { const { d, k } = await duoOf(); const [bank] = await kv([["HGET", k, "bank"]]); const half = (+bank || 0) / 2; await kv([["DEL", k, k + ":log"], ["HDEL", P + "p:" + pid, "duo"], ["HDEL", P + "p:" + d, "duo"]]); if (half > 0) await push(d, { t: "money", from: pid, name: await me(), amt: half, msg: "Divorce du duo : ta moitié du coffre" }); await push(d, { t: "duoend", from: pid, name: await me() }); return res.json({ ok: true, half }); }
    if (op === "live_on") { await kv([["SET", P + "live:" + pid, JSON.stringify({ n: await me(), title: clean(b.title, 60), v: num(b.v, 1e9), ts: Date.now() }), "EX", 120]]); return res.json({ ok: true }); }
    if (op === "live_off") { await kv([["DEL", P + "live:" + pid]]); return res.json({ ok: true }); }
    if (op === "live_list") { const L = ids(b.ids); if (!L.length) return res.json({ list: [] }); const r = await kv(L.map(x => ["GET", P + "live:" + x])); return res.json({ list: L.map((x, i) => r[i] ? { id: x, ...parse(r[i]) } : null).filter(Boolean) }); }
    if (op === "live_say") { const tg = String(b.target || "").toUpperCase(); if (!okPid(tg)) throw new Error("live invalide"); const t = clean(b.text, 120).replace(BAD, "***"); if (!t) throw new Error("message vide"); const k = P + "lchat:" + tg; await kv([["RPUSH", k, JSON.stringify({ id: pid, n: await me(), t, g: num(b.gift, 1e9), ts: Date.now() })], ["LTRIM", k, -40, -1], ["EXPIRE", k, 900]]); if (num(b.gift, 1e9) > 0) await push(tg, { t: "money", from: pid, name: await me(), amt: num(b.gift, 1e9), msg: "Cadeau pendant ton live 🎁" }); return res.json({ ok: true }); }
    if (op === "live_read") { const tg = String(b.target || pid).toUpperCase(); if (!okPid(tg)) throw new Error("live invalide"); const r = await kv([["LRANGE", P + "lchat:" + tg, 0, -1], ["GET", P + "live:" + tg]]); return res.json({ list: (r[0] || []).map(parse).filter(Boolean), live: parse(r[1]) }); }
    const ch = clean(b.ch, 12).replace(/\W/g, "") || "general";
    if (op === "dsay") { const t = clean(b.text, 160).replace(BAD, "***"); if (!t) throw new Error("message vide"); const k = P + "disko:" + ch; await kv([["LPUSH", k, JSON.stringify({ id: pid, n: await me(), t, ts: Date.now() })], ["LTRIM", k, 0, 49], ["EXPIRE", k, 30 * DAY]]); return res.json({ ok: true }); }
    if (op === "dread") { const [l] = await kv([["LRANGE", P + "disko:" + ch, 0, 39]]); return res.json({ list: (l || []).map(parse).filter(Boolean) }); }

    if (op === "season_get") { const m = Math.floor(Date.now() / (30 * DAY * 1000)) - (b.prev ? 1 : 0), sk = P + "season:" + m; const [rk] = await kv([["ZREVRANK", sk, pid]]); return res.json({ mo: m, end: (m + 1) * 30 * DAY * 1000, top: await list(sk, 10), rank: rk === null || rk === undefined ? null : rk + 1 }); }
    if (op === "code_new") { const c = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); if (c.length < 4) throw new Error("code trop court (4 caractères minimum)"); if (/(pute|merde|fdp|nique|salope|encul|connard)/i.test(c)) throw new Error("code refusé"); const amt = Math.min(Math.max(1, num(b.amt, 1e6)), 1e6), uses = Math.min(Math.max(1, Math.floor(num(b.uses, 100))), 100); const [ok] = await kv([["SET", P + "code:" + c, JSON.stringify({ by: pid, n: await me(), amt, uses, left: uses }), "NX", "EX", 30 * DAY]]); if (!ok) throw new Error("ce code existe déjà"); return res.json({ ok: true, code: c }); }
    if (op === "code_use") { const c = String(b.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16); const k = P + "code:" + c; const [v] = await kv([["GET", k]]); const o = parse(v); if (!o) throw new Error("code inconnu ou expiré"); if (o.by === pid) throw new Error("tu ne peux pas utiliser ton propre code"); if (o.left <= 0) throw new Error("ce code a déjà été utilisé au maximum"); const [added] = await kv([["SADD", k + ":u", pid], ["EXPIRE", k + ":u", 30 * DAY]]); if (!added) throw new Error("tu as déjà utilisé ce code"); o.left--; await kv([["SET", k, JSON.stringify(o), "KEEPTTL"]]); return res.json({ ok: true, amt: o.amt, by: o.n }); }
    res.status(400).json({ error: "opération inconnue" });
  } catch (e) { res.status(e.message?.startsWith("base") ? 500 : 400).json({ error: e.message }); }
}
