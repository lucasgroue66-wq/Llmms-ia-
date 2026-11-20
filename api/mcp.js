// Vercel : /api/mcp — relais pour les serveurs MCP EN LIGNE (https).
// Beaucoup de serveurs MCP n'autorisent pas les appels directs depuis un navigateur (CORS).
// Le site passe donc par ici : on transmet la requête JSON-RPC telle quelle et on renvoie la réponse.
// Sécurité : https uniquement, aucune adresse privée / locale (anti-SSRF), taille et durée limitées.
import dns from "node:dns/promises";
import net from "node:net";

const MAX_BODY = 2_000_000;
const privateIp = ip => {
  if (net.isIPv4(ip)) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:") && privateIp(x.slice(7));
};
async function safeUrl(raw) {
  let u; try { u = new URL(raw); } catch { throw new Error("adresse invalide"); }
  if (u.protocol !== "https:") throw new Error("seules les adresses https:// passent par le relais (un serveur local se connecte directement depuis ton PC)");
  const h = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(h)) throw new Error("adresse locale interdite");
  const ips = net.isIP(h) ? [h] : (await dns.lookup(h, { all: true })).map(r => r.address);
  if (!ips.length || ips.some(privateIp)) throw new Error("adresse privée interdite");
  return u.toString();
}
const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "cookie", "origin", "referer"]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "POST seulement" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const url = await safeUrl(String(b.url || ""));
    const payload = typeof b.body === "string" ? b.body : JSON.stringify(b.body ?? {});
    if (payload.length > MAX_BODY) return res.status(413).json({ error: "requête trop grosse" });
    const headers = { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" };
    for (const [k, v] of Object.entries(b.headers || {})) if (!HOP.has(k.toLowerCase()) && typeof v === "string" && v.length < 4000) headers[k] = v;
    if (b.sid) headers["Mcp-Session-Id"] = String(b.sid).slice(0, 200);
    if (b.protocol) headers["Mcp-Protocol-Version"] = String(b.protocol).slice(0, 20);
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 55_000);
    let r;
    try { r = await fetch(url, { method: "POST", headers, body: payload, signal: ac.signal, redirect: "error" }); }
    finally { clearTimeout(t); }
    // SSE : on lit le flux jusqu'à la réponse qui porte le même id, puis on coupe
    const ct = r.headers.get("content-type") || "";
    let text = "";
    if (ct.includes("text/event-stream") && r.body) {
      let wantId = null; try { wantId = JSON.parse(payload).id; } catch {}
      const reader = r.body.getReader(), dec = new TextDecoder();
      while (text.length < MAX_BODY) {
        const { value, done } = await reader.read(); if (done) break;
        text += dec.decode(value, { stream: true });
        if (wantId != null && text.split(/\r?\n/).some(l => { if (!l.startsWith("data:")) return false; try { return JSON.parse(l.slice(5).trim()).id === wantId; } catch { return false; } })) { try { reader.cancel(); } catch {} break; }
      }
    } else text = (await r.text()).slice(0, MAX_BODY);
    return res.status(200).json({ status: r.status, ct, sid: r.headers.get("mcp-session-id") || null, text });
  } catch (e) {
    return res.status(400).json({ error: e.name === "AbortError" ? "le serveur MCP a mis trop de temps à répondre" : e.message });
  }
}
