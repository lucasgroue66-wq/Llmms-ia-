// Netlify : /api/chat (Edge Function). La logique est dans lib/core.js.
// La réponse de l'IA est transmise telle quelle (aucun traitement ici → pas de dépassement du temps de calcul).
import { precheck, startChat } from "../../lib/core.js";
import { authEnabled, checkSession, handleAuth } from "../../lib/auth.js";

export default async (request) => {
  if (request.method !== "POST") return Response.json({ error: "POST seulement" }, { status: 405 });
  const env = k => Netlify.env.get(k);
  const bad = precheck(env, request.headers.get("x-llmms-code"));
  if (bad) return Response.json({ error: bad.error }, { status: bad.status });

  let body = {};
  try { body = await request.json(); } catch {}

  const sessionHeader = request.headers.get("x-llmms-session");
  const auth = await handleAuth(body, env, sessionHeader);
  if (auth) return Response.json(auth.json, { status: auth.status });
  if (authEnabled(env) && !(await checkSession(sessionHeader, env))) return Response.json({ error: "login" }, { status: 401 });

  let out;
  try { out = await startChat(body, env); }
  catch (e) { out = { events: (async function* () { yield { t: "error", v: String(e?.message || e) }; })() }; }

  if (out.stream) {
    return new Response(out.stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Llmms-Model": out.name } });
  }
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      try { for await (const ev of out.events) c.enqueue(enc.encode(JSON.stringify(ev) + "\n")); }
      catch (e) { c.enqueue(enc.encode(JSON.stringify({ t: "error", v: String(e?.message || e) }) + "\n")); }
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" } });
};

export const config = { path: "/api/chat" };
