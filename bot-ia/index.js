// Bot IA 24/7 pour le serveur de LLMMS — auto-réponse dans le salon #ia
// (bot séparé, à héberger sur un truc allumé en permanence : Railway, Replit, un PC/Raspberry…)
import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GKEY = process.env.GEMINI_API_KEY;
const IA_CHANNEL_ID = (process.env.IA_CHANNEL_ID || "").trim();          // optionnel : l'ID d'un salon précis
const IA_CHANNEL_NAME = (process.env.IA_CHANNEL_NAME || "ia").toLowerCase(); // sinon : tout salon dont le nom contient "ia"
const TENOR_KEY = (process.env.TENOR_API_KEY || "").trim();              // optionnel : pour envoyer des GIFs

if (!TOKEN) { console.error("❌ DISCORD_BOT_TOKEN manquant"); process.exit(1); }
if (!GKEY) console.warn("⚠️ GEMINI_API_KEY manquant : l'IA ne pourra pas répondre.");

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const mem = new Map();   // channelId -> [{role, content}]  (mémoire courte en RAM)
const MEMMAX = 12;

const INSULT = /\b(nique|niquer?|ntm|tg|ta\s*gueule|ferme\s*la|connard?|conn?ard|b[aâ]tard|fdp|encul[ée]|salope|pute|cassos|d[ée]bile|abruti|bouffon|naze|clochard|wsh\s*ta|sale\s*(merde|type))\b/i;
const isInsult = t => INSULT.test(t);

const SYS = `Tu es « llmms ia », un pote sympa sur le serveur Discord de LLMMS (Lucas). Tu discutes dans le salon #ia comme un ami : naturel, drôle, en français, réponses COURTES (1 à 4 phrases). Tu ne dis jamais que tu es Gemini ou Google : tu es llmms ia.
AMBIANCE : c'est de la vanne entre potes. Si on te charrie ou qu'on t'insulte pour rigoler, réponds du tac au tac avec une vanne taquine, drôle et un peu cash (clapback), sans te vexer.
LIMITES STRICTES : jamais d'insulte vraiment vulgaire ou choquante, jamais de méchanceté sur le physique, la famille, l'origine, la religion, le genre, l'orientation ou un handicap ; aucune insulte raciste ; rien de sexuel ; rien d'illégal ; tu ne donnes aucune info dangereuse. Si quelqu'un a l'air réellement mal ou triste, tu arrêtes la vanne et tu es gentil et à l'écoute.`;

async function gemini(messages) {
  for (const model of ["gemini-flash-lite-latest", "gemini-2.0-flash", "gemini-flash-latest"]) {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 9000);
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${GKEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 350, temperature: 0.95, messages })
      }).finally(() => clearTimeout(to));
      if (!r.ok) continue;
      const j = await r.json(); const t = j?.choices?.[0]?.message?.content;
      if (t) return t.slice(0, 1800);
    } catch { /* on passe au modèle suivant */ }
  }
  return null;
}

async function tenor(q) {
  if (!TENOR_KEY) return null;
  try {
    const r = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_KEY}&limit=15&media_filter=gif&contentfilter=high`);
    const j = await r.json(); const res = j?.results;
    if (res?.length) { const g = res[Math.floor(Math.random() * res.length)]; return g?.media_formats?.gif?.url || g?.url || null; }
  } catch { /* ignore */ }
  return null;
}

client.once("ready", () => console.log(`✅ Connecté : ${client.user.tag} — auto-réponse #ia active`));

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot || !msg.guild) return;
    const ch = msg.channel;
    const match = IA_CHANNEL_ID ? ch.id === IA_CHANNEL_ID : String(ch.name || "").toLowerCase().includes(IA_CHANNEL_NAME);
    if (!match) return;
    const content = String(msg.content || "").trim();
    if (!content || content.startsWith("/") || content.startsWith("!")) return; // on laisse les commandes tranquilles

    await ch.sendTyping().catch(() => {});
    const who = msg.member?.displayName || msg.author.username;
    const hist = mem.get(ch.id) || [];
    const sys = SYS + (isInsult(content) ? "\n\n(Là on te chambre/t'insulte pour rire : réponds avec une vanne drôle et cash, mais reste dans les limites.)" : "");
    const messages = [{ role: "system", content: sys }, ...hist, { role: "user", content: `${who} : ${content}` }];

    const rep = await gemini(messages);
    if (!rep) { await msg.reply("😵 là j'ai un petit bug, réessaie").catch(() => {}); return; }

    hist.push({ role: "user", content: `${who} : ${content}`.slice(0, 500) }, { role: "assistant", content: rep.slice(0, 800) });
    while (hist.length > MEMMAX) hist.shift();
    mem.set(ch.id, hist);

    await msg.reply({ content: rep, allowedMentions: { repliedUser: true } }).catch(() => {});

    // Petit GIF rigolo quand on le chambre (si une clé Tenor est configurée)
    if (TENOR_KEY && isInsult(content) && Math.random() < 0.5) {
      const gif = await tenor(["mdr", "clapback", "sarcastic", "really bro", "oh no you didnt"][Math.floor(Math.random() * 5)]);
      if (gif) await ch.send(gif).catch(() => {});
    }
  } catch (e) { console.error("messageCreate:", e); }
});

client.on("error", e => console.error("client error:", e));
client.login(TOKEN).catch(e => { console.error("❌ Login échoué :", e.message); process.exit(1); });
