#!/usr/bin/env node
// =====================================================================
//  Pont llmms ia  <->  serveurs MCP locaux (Roblox Studio, etc.)
//
//  Un site web ne peut pas lancer de programme sur ton PC. Ce pont fait
//  exactement ce que fait Claude Desktop avec ton JSON "mcpServers" :
//  il lance chaque serveur (command + args), lui parle en stdio, puis
//  rend ses outils disponibles pour llmms ia sur http://localhost:3333/mcp
//
//  Utilisation :
//    node llmms-pont.mjs                      -> config Roblox Studio par défaut
//    node llmms-pont.mjs mcp.json             -> ton fichier JSON
//    node llmms-pont.mjs --config-b64 <...>   -> JSON encodé (lanceur du site)
//    options : --port 3333  --origin https://ton-site
// =====================================================================
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const PORT = +opt("--port", 3333);
const ORIGINS = ["https://ia-llmms-1.vercel.app", ...String(opt("--origin", "")).split(",").filter(Boolean)];
const WIN = process.platform === "win32";

// ---------- lecture de la config ----------
function defaultConfig() {
  return WIN
    ? { mcpServers: { Roblox_Studio: { command: "cmd.exe", args: ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"] } } }
    : { mcpServers: { Roblox_Studio: { command: "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP" } } };
}
function loadConfig() {
  const b64 = opt("--config-b64", null);
  if (b64) return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const file = argv.find(a => a.endsWith(".json")) || (fs.existsSync(path.join(process.cwd(), "mcp.json")) ? "mcp.json" : null);
  if (file) return JSON.parse(fs.readFileSync(file, "utf8"));
  return defaultConfig();
}
const expand = s => String(s)
  .replace(/%([^%]+)%/g, (m, k) => process.env[k] ?? process.env[k.toUpperCase()] ?? m)
  .replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/gi, (m, k) => process.env[k] ?? m)
  .replace(/^~(?=$|[\\/])/, os.homedir());

let cfg;
try { cfg = loadConfig(); } catch (e) { console.error("❌ JSON invalide :", e.message); process.exit(1); }
const entries = Object.entries(cfg.mcpServers || cfg.servers || {}).filter(([, s]) => s && s.command);
if (!entries.length) { console.error("❌ Aucun serveur avec \"command\" dans le JSON."); process.exit(1); }

// ---------- un serveur MCP en stdio ----------
class Child {
  constructor(name, spec) { this.name = name; this.spec = spec; this.n = 0; this.wait = new Map(); this.tools = []; this.ready = false; this.start(); }
  start() {
    const cmd = expand(this.spec.command), args = (this.spec.args || []).map(expand);
    const env = { ...process.env }; for (const [k, v] of Object.entries(this.spec.env || {})) env[k] = expand(v);
    console.log(`▶ Lancement de « ${this.name} » : ${cmd} ${args.join(" ")}`);
    this.p = spawn(cmd, args, { env, cwd: this.spec.cwd ? expand(this.spec.cwd) : undefined, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let buf = "";
    this.p.stdout.on("data", d => { buf += d.toString("utf8"); let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) this.onLine(line); } });
    this.p.stderr.on("data", d => { const t = d.toString().trim(); if (t) console.log(`  [${this.name}] ${t.slice(0, 300)}`); });
    this.p.on("error", e => console.error(`❌ Impossible de lancer « ${this.name} » : ${e.message}`));
    this.p.on("exit", code => {
      this.ready = false; for (const w of this.wait.values()) w.reject(new Error("le serveur MCP s'est arrêté")); this.wait.clear();
      console.log(`⚠ « ${this.name} » s'est arrêté (code ${code}). Nouvel essai dans 5 s… (Roblox Studio est bien ouvert ?)`);
      setTimeout(() => this.start(), 5000);
    });
    this.init().catch(e => console.error(`❌ « ${this.name} » ne répond pas : ${e.message}`));
  }
  onLine(line) {
    let m; try { m = JSON.parse(line); } catch { return; }
    if (m.id != null && this.wait.has(m.id) && (m.result !== undefined || m.error)) { const w = this.wait.get(m.id); this.wait.delete(m.id); w.resolve(m); return; }
    if (m.method && m.id != null) this.send({ jsonrpc: "2.0", id: m.id, result: {} }); // requête du serveur (ping, roots…) : on répond poliment
    if (m.method === "notifications/tools/list_changed") this.refresh().catch(() => {});
  }
  send(o) { try { this.p.stdin.write(JSON.stringify(o) + "\n"); } catch {} }
  request(method, params, ms = 15 * 60 * 1000) {
    const id = ++this.n;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.wait.delete(id); reject(new Error("délai dépassé")); }, ms);
      this.wait.set(id, { resolve: m => { clearTimeout(t); resolve(m); }, reject: e => { clearTimeout(t); reject(e); } });
      this.send({ jsonrpc: "2.0", id, method, params: params || {} });
    });
  }
  async init() {
    const r = await this.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "llmms-pont", version: "1.0.0" } }, 60000);
    if (r.error) throw new Error(r.error.message);
    this.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await this.refresh(); this.ready = true;
    console.log(`✅ « ${this.name} » prêt : ${this.tools.length} outils (${this.tools.slice(0, 8).map(t => t.name).join(", ")}${this.tools.length > 8 ? "…" : ""})`);
  }
  async refresh() {
    const all = []; let cursor;
    do { const r = await this.request("tools/list", cursor ? { cursor } : {}, 60000); if (r.error) throw new Error(r.error.message); all.push(...(r.result.tools || [])); cursor = r.result.nextCursor; } while (cursor);
    this.tools = all;
  }
}
const children = entries.map(([name, spec]) => new Child(name, spec));

// outils de tous les serveurs ; si deux serveurs ont le même nom d'outil, on préfixe
function toolIndex() {
  const seen = new Map(), list = [], route = new Map();
  for (const c of children) for (const t of c.tools) seen.set(t.name, (seen.get(t.name) || 0) + 1);
  for (const c of children) for (const t of c.tools) {
    const name = seen.get(t.name) > 1 ? `${c.name}__${t.name}` : t.name;
    list.push({ ...t, name }); route.set(name, { c, real: t.name });
  }
  return { list, route };
}
const waitReady = async (ms = 20000) => { const t0 = Date.now(); while (!children.some(c => c.ready) && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 300)); };

// ---------- serveur HTTP pour le site ----------
const okOrigin = o => !o || ORIGINS.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
function cors(req, res) {
  const o = req.headers.origin;
  if (o && okOrigin(o)) res.setHeader("Access-Control-Allow-Origin", o);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id");
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
const json = (res, code, o, extra = {}) => { res.writeHead(code, { "Content-Type": "application/json", ...extra }); res.end(JSON.stringify(o)); };

async function handle(msg) {
  const { id, method, params } = msg;
  if (id == null) return null; // notification
  const ok = result => ({ jsonrpc: "2.0", id, result }), err = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
  try {
    if (method === "initialize") return ok({ protocolVersion: params?.protocolVersion || "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "llmms-pont", version: "1.0.0" } });
    if (method === "ping") return ok({});
    if (method === "tools/list") { await waitReady(); return ok({ tools: toolIndex().list }); }
    if (method === "tools/call") {
      await waitReady(); const r = toolIndex().route.get(params?.name);
      if (!r) return err(-32602, `outil inconnu : ${params?.name}`);
      if (!r.c.ready) return err(-32000, "Roblox Studio n'est pas prêt (ouvre ta place dans Studio)");
      console.log(`🔧 ${params.name}`);
      const m = await r.c.request("tools/call", { ...params, name: r.real });
      return m.error ? err(m.error.code || -32000, m.error.message) : ok(m.result);
    }
    const c = children.find(x => x.ready); if (!c) return err(-32000, "aucun serveur MCP prêt");
    const m = await c.request(method, params); return m.error ? err(m.error.code || -32000, m.error.message) : ok(m.result);
  } catch (e) { return err(-32000, e.message); }
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.headers.origin && !okOrigin(req.headers.origin)) return json(res, 403, { error: "site non autorisé" });
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    const n = toolIndex().list.length;
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<meta charset="utf-8"><body style="font:16px system-ui;background:#111;color:#eee;padding:30px"><h2>🟢 Pont llmms ia actif</h2><p>${children.map(c => `${c.ready ? "✅" : "⏳"} ${c.name} — ${c.tools.length} outils`).join("<br>")}</p><p>Retourne sur <a style="color:#7cf" href="${ORIGINS[0]}">llmms ia</a> : la connexion se fait toute seule (${n} outils).</p>`);
  }
  if (url.pathname === "/status") return json(res, 200, { ok: true, bridge: "llmms-pont", servers: children.map(c => ({ name: c.name, ready: c.ready, tools: c.tools.length })) });
  if (url.pathname === "/jobs/ping") return json(res, 404, { jobs: false });
  if (url.pathname !== "/mcp") return json(res, 404, { error: "introuvable" });
  if (req.method === "GET") { res.writeHead(405, { Allow: "POST" }); return res.end(); }
  if (req.method === "DELETE") { res.writeHead(200); return res.end(); }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  let body = ""; for await (const ch of req) body += ch;
  let msg; try { msg = JSON.parse(body); } catch { return json(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } }); }
  const sid = req.headers["mcp-session-id"] || crypto.randomUUID();
  if (Array.isArray(msg)) { const out = (await Promise.all(msg.map(handle))).filter(Boolean); if (!out.length) { res.writeHead(202, { "Mcp-Session-Id": sid }); return res.end(); } return json(res, 200, out, { "Mcp-Session-Id": sid }); }
  const out = await handle(msg);
  if (!out) { res.writeHead(202, { "Mcp-Session-Id": sid }); return res.end(); }
  json(res, 200, out, { "Mcp-Session-Id": sid });
});
server.on("error", e => { console.error(e.code === "EADDRINUSE" ? `❌ Le port ${PORT} est déjà utilisé : le pont tourne peut-être déjà dans une autre fenêtre.` : "❌ " + e.message); process.exit(1); });
server.listen(PORT, "127.0.0.1", () => {
  console.log("==============================================");
  console.log(`  Pont llmms ia actif : http://localhost:${PORT}/mcp`);
  console.log("  Laisse cette fenêtre ouverte pendant que tu travailles.");
  console.log("  Sur llmms ia (sur CE PC), la connexion se fait toute seule.");
  console.log("==============================================");
});
