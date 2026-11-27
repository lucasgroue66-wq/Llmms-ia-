// Vercel : /api/discord — le bot Discord de LLMMS (commandes slash, sans PC allumé).
// Variables Vercel : DISCORD_APP_ID, DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN (+ GEMINI_API_KEY pour /ia, base Redis déjà branchée).
// Installer les commandes : ouvrir https://TON-SITE/api/discord?register=TON_APP_ID
import { createPublicKey, verify } from "node:crypto";

const SITE = process.env.SITE_URL || "https://ia-llmms-1.vercel.app";
const API = "https://discord.com/api/v10";
const COL = { ok: 0x22c55e, ko: 0xef4444, info: 0x7c5cff, gold: 0xfbbf24 };

/* ---------------- base de données (même Redis que le reste du site) ---------------- */
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
const K = (g, u) => `llmms:dc:${g}:u:${u}`, TOP = g => `llmms:dc:${g}:top`;
async function getU(g, u) { const [v] = await kv([["GET", K(g, u)]]); try { return { c: 0, bank: 0, inv: [], ...JSON.parse(v || "{}") }; } catch { return { c: 0, bank: 0, inv: [] }; } }
async function putU(g, u, d) { await kv([["SET", K(g, u), JSON.stringify(d)], ["ZADD", TOP(g), Math.floor(d.c + d.bank), u]]); }

/* ---------------- IA (Gemini gratuit) ---------------- */
async function gemini(q, hist, sys) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("pas de clé Gemini sur le site");
  for (const model of (process.env.GEMINI_MODELS || "gemini-flash-latest,gemini-flash-lite-latest,gemini-2.0-flash").split(",").map(s => s.trim())) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: "system", content: sys || "Tu es llmms ia, l'assistant du serveur Discord de LLMMS. Réponds en français, de façon courte, claire et sympa (max 1500 caractères). Tu ne dis jamais que tu es Gemini ou Google : tu es llmms ia." }, ...(hist || []), { role: "user", content: q }] }) });
      if (!r.ok) continue; const j = await r.json(); const t = j?.choices?.[0]?.message?.content; if (t) return t.slice(0, 1900);
    } catch {}
  }
  throw new Error("l'IA ne répond pas pour l'instant");
}

/* ---------------- outils ---------------- */
const nf = n => Math.floor(n).toLocaleString("fr-FR");
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const opt = (i, n) => (i.data.options || []).find(o => o.name === n)?.value;
const emb = (title, description, color = COL.info, extra = {}) => ({ type: 4, data: { embeds: [{ title, description, color, ...extra }] } });
const eph = content => ({ type: 4, data: { content, flags: 64 } });
const wait = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const SHOP = [["vip", "👑 Rôle VIP (pour le style)", 5000], ["cadenas", "🔒 Cadenas (protège 1 fois contre /vol)", 1500], ["coffre", "🎁 Coffre mystère", 2500], ["bague", "💍 Bague en diamant", 20000], ["noflex", "🐴 Noflex doré", 100000]];
const PIECE = "🪙";
async function bot(path, method = "GET", body) {
  const tok = process.env.DISCORD_BOT_TOKEN; if (!tok) throw new Error("DISCORD_BOT_TOKEN manquant sur Vercel");
  const r = await fetch(API + path, { method, headers: { Authorization: `Bot ${tok}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok && r.status !== 204) { const t = await r.text().catch(() => ""); throw new Error(`Discord ${r.status} ${t.slice(0, 120)}`); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const IDEES = {
  jeu: ["Steal a Pizza : vole les pizzas géantes des autres bases", "Obby où le sol change de couleur toutes les 5 s", "Tycoon de fusées : envoie des fusées sur Mars pour gagner", "Survis à la lave qui monte avec tes potes", "Simulateur de chien : deviens le chien le plus fort", "Cache-cache géant dans un supermarché", "Course de karts avec des pièges brainrot", "Escape de l'école avec un prof géant qui te poursuit"],
  video: ["« J'ai créé mon propre Roblox » avec un time-lapse", "24 h à ne jouer qu'à des jeux brainrot", "Je note les bases de mes abonnés sur Steal a Noflex", "Je donne 1 M de Bloxbux au premier qui trouve le code", "Réaction aux pires jeux Roblox", "Je deviens riche en 1 heure sur EMPIRE MILLIONNAIRE"],
  serveur: ["Salon #idées-de-jeux avec vote 👍👎", "Concours de la meilleure base chaque semaine", "Rôle spécial pour les 10 plus actifs", "Soirée jeu tous les vendredis", "Salon #montages pour partager ses vidéos", "Événement : le premier qui trouve le code secret gagne un rôle"],
  business: ["Vendre des miniatures YouTube à des petits créateurs", "Faire des montages vidéo pour des streamers", "Créer des sites pour des commerces avec llmms ia", "Vendre des maps Roblox Studio", "Lancer une chaîne de shorts automatisée", "Proposer des logos et bannières Discord"],
  defi: ["Finir un obby sans sauter plus de 50 fois", "Le premier qui trouve un Noflex Secret gagne", "Construire la plus belle maison en 10 min", "Parler qu'en emojis pendant 1 heure", "1v1 : le moins de morts sur une tour", "Deviner le jeu avec juste une capture"],
  nom: ["Noflex King", "LLMMS Studio", "Bloxy Legends", "Turbo Brainrot", "Shadow Obby", "Les Voleurs de Base", "Empire Gaming", "Pixel Fury"] };
const THEME = { jeu: "jeux Roblox / BLOXY originaux", video: "vidéos TikTok / YouTube", serveur: "idées pour animer un serveur Discord", business: "petits business en ligne réalistes et légaux pour un jeune", defi: "défis fun entre potes", nom: "pseudos / noms stylés" };
async function ideas(t, prec) { try { const r = await gemini(`Propose 5 ${THEME[t] || "idées"}${prec ? ` sur le thème : ${prec}` : ""}. Une idée par ligne, numérotée, courte et originale, avec un emoji. Pas d'intro.`); return r; } catch { return [...(IDEES[t] || IDEES.jeu)].sort(() => Math.random() - .5).slice(0, 5).map((x, k) => `${k + 1}. ${x}`).join("\n"); } }
const ideaMsg = (t, prec, txt) => ({ embeds: [{ title: "💡 Idées : " + ({ jeu: "jeu", video: "vidéo", serveur: "serveur", business: "business", defi: "défis", nom: "noms" }[t] || t), description: txt.slice(0, 3800), color: COL.gold, footer: prec ? { text: "Thème : " + prec } : undefined }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "💡 D'autres idées", custom_id: `idee:${t}:${String(prec || "").slice(0, 60)}` }] }] });
/* conversation avec mémoire */
const CH = u => `llmms:dc:chat:${u}`;
async function chat(uid, who, msg) { const [h] = await kv([["LRANGE", CH(uid), -12, -1]]); const hist = (h || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
  let rep; try { rep = await gemini(msg, hist, `Tu es llmms ia, un pote sympa sur le serveur Discord de LLMMS. Tu discutes avec ${who} comme un ami : naturel, drôle, en français, réponses courtes (2 à 6 phrases). Tu peux proposer des idées si on te le demande. Tu ne dis jamais que tu es Gemini ou Google.`); } catch (e) { rep = "😵 " + e.message; }
  if (!rep.startsWith("😵")) await kv([["RPUSH", CH(uid), JSON.stringify({ role: "user", content: msg.slice(0, 600) }), JSON.stringify({ role: "assistant", content: rep.slice(0, 1200) })], ["LTRIM", CH(uid), -16, -1], ["EXPIRE", CH(uid), 86400]]);
  return { embeds: [{ author: { name: who + " : " + msg.slice(0, 200) }, description: rep.slice(0, 3800), color: COL.info, footer: { text: "llmms ia · se souvient de votre discussion pendant 24 h" } }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "💬 Répondre", custom_id: `chatr:${uid}` }, { type: 2, style: 2, label: "🔄 Nouvelle discussion", custom_id: `chatn:${uid}` }] }] }; }
const QUIZ = [["Quelle est la capitale du Japon ?", ["Tokyo", "Osaka", "Kyoto"], 0], ["Combien font 7 x 8 ?", ["54", "56", "64"], 1], ["Quel est le plus grand océan ?", ["Atlantique", "Indien", "Pacifique"], 2], ["Combien de joueurs dans une équipe de foot ?", ["10", "11", "12"], 1], ["Quelle planète est la plus proche du Soleil ?", ["Vénus", "Mercure", "Mars"], 1], ["En quelle année l'homme a marché sur la Lune ?", ["1969", "1975", "1959"], 0], ["Quel animal est le plus rapide ?", ["Guépard", "Lion", "Cheval"], 0], ["Combien de côtés a un hexagone ?", ["5", "6", "8"], 1]];

/* ---------------- les commandes ---------------- */
const MOD = String(1n << 40n), BAN = "4";
const CMDS = [
  { name: "aide", description: "Toutes les commandes du bot" },
  { name: "daily", description: "Récupère tes pièces du jour" },
  { name: "work", description: "Travaille pour gagner des pièces (toutes les heures)" },
  { name: "solde", description: "Voir tes pièces (ou celles d'un membre)", options: [{ type: 6, name: "membre", description: "Le membre", required: false }] },
  { name: "pay", description: "Donner des pièces à un membre", options: [{ type: 6, name: "membre", description: "À qui", required: true }, { type: 4, name: "montant", description: "Combien", required: true, min_value: 1 }] },
  { name: "vol", description: "Tenter de voler des pièces à un membre (risqué !)", options: [{ type: 6, name: "membre", description: "La victime", required: true }] },
  { name: "banque", description: "Mettre tes pièces à l'abri du vol", options: [{ type: 3, name: "action", description: "déposer ou retirer", required: true, choices: [{ name: "déposer", value: "dep" }, { name: "retirer", value: "ret" }] }, { type: 4, name: "montant", description: "Combien", required: true, min_value: 1 }] },
  { name: "shop", description: "La boutique du serveur" },
  { name: "acheter", description: "Acheter un objet de la boutique", options: [{ type: 3, name: "objet", description: "L'objet", required: true, choices: SHOP.map(([v, n, p]) => ({ name: `${n} · ${p}`, value: v })) }] },
  { name: "top", description: "Les plus riches du serveur" },
  { name: "ia", description: "Pose une question à llmms ia", options: [{ type: 3, name: "question", description: "Ta question", required: true }] },
  { name: "discute", description: "Discuter avec llmms ia (il se souvient de la conversation)", options: [{ type: 3, name: "message", description: "Ton message", required: true }] },
  { name: "idee", description: "Le bot te propose des idées", options: [{ type: 3, name: "sujet", description: "Idées de quoi ?", required: true, choices: [{ name: "🧱 Jeu Roblox / BLOXY", value: "jeu" }, { name: "🎬 Vidéo TikTok / YouTube", value: "video" }, { name: "💬 Serveur Discord", value: "serveur" }, { name: "💰 Business / argent", value: "business" }, { name: "🎯 Défi entre potes", value: "defi" }, { name: "🎨 Pseudo / nom stylé", value: "nom" }] }, { type: 3, name: "precision", description: "Précise (facultatif) : thème, style…", required: false }] },
  { name: "bloxy", description: "Lien et infos sur BLOXY" },
  { name: "profil", description: "Profil BLOXY d'un joueur", options: [{ type: 3, name: "pseudo", description: "Pseudo BLOXY (ex : Llmms99587)", required: true }] },
  { name: "classement", description: "Les plus gros créateurs de BLOXY" },
  { name: "pfc", description: "Pierre, feuille, ciseaux contre le bot", options: [{ type: 3, name: "choix", description: "Ton choix", required: true, choices: [{ name: "🪨 Pierre", value: "pierre" }, { name: "📄 Feuille", value: "feuille" }, { name: "✂️ Ciseaux", value: "ciseaux" }] }, { type: 4, name: "mise", description: "Parier des pièces (facultatif)", required: false, min_value: 1 }] },
  { name: "pile", description: "Pile ou face", options: [{ type: 3, name: "choix", description: "Pile ou face", required: true, choices: [{ name: "Pile", value: "pile" }, { name: "Face", value: "face" }] }, { type: 4, name: "mise", description: "Parier des pièces (facultatif)", required: false, min_value: 1 }] },
  { name: "de", description: "Lancer un dé", options: [{ type: 4, name: "faces", description: "Nombre de faces (6 par défaut)", required: false, min_value: 2, max_value: 1000 }] },
  { name: "8ball", description: "Pose une question, la boule magique répond", options: [{ type: 3, name: "question", description: "Ta question", required: true }] },
  { name: "quiz", description: "Une question de culture G (bonne réponse = pièces)" },
  { name: "fakenitro", description: "😈 Faux cadeau Nitro pour troller un pote", options: [{ type: 3, name: "duree", description: "Le faux cadeau", required: false, choices: [{ name: "1 mois", value: "1 mois" }, { name: "1 an", value: "1 an" }, { name: "À vie", value: "à vie" }] }, { type: 3, name: "message", description: "Ce qui s'affiche quand il clique (court, par défaut : non je t'ai troll mdr)", required: false, max_length: 50 }] },
  { name: "warn", description: "Avertir un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 3, name: "raison", description: "Pourquoi", required: true }] },
  { name: "warns", description: "Voir les avertissements d'un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }] },
  { name: "mute", description: "Rendre muet un membre (timeout)", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 4, name: "minutes", description: "Durée en minutes", required: true, min_value: 1, max_value: 40320 }, { type: 3, name: "raison", description: "Pourquoi", required: false }] },
  { name: "unmute", description: "Rendre la parole à un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }] },
  { name: "ban", description: "Bannir un membre", default_member_permissions: BAN, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 3, name: "raison", description: "Pourquoi", required: false }] },
  { name: "give", description: "(Admin) Donner des pièces à un membre", default_member_permissions: "8", options: [{ type: 6, name: "membre", description: "À qui", required: true }, { type: 4, name: "montant", description: "Combien", required: true }] }
];

const ANY = ["aide", "ia", "discute", "idee", "pfc", "de", "8ball", "quiz", "fakenitro", "bloxy", "profil", "classement"];
for (const c of CMDS) if (ANY.includes(c.name)) { c.integration_types = [0, 1]; c.contexts = [0, 1, 2]; }
async function run(i) {
  const g = i.guild_id || "dm", me = i.member?.user || i.user, uid = me.id, name = i.member?.nick || me.global_name || me.username, cmd = i.data.name;
  const target = opt(i, "membre"), tUser = target && i.data.resolved?.users?.[target];
  const tName = target && (i.data.resolved?.members?.[target]?.nick || tUser?.global_name || tUser?.username);
  const now = Date.now();
  switch (cmd) {
    case "aide": return emb("🤖 Le bot de LLMMS", [
      "**💰 Économie** : `/daily` `/work` `/solde` `/pay` `/vol` `/banque` `/shop` `/acheter` `/top`",
      "**🎮 BLOXY** : `/bloxy` `/profil` `/classement`", "**🤖 IA** : `/ia` `/discute` (conversation) `/idee` (propose des idées)",
      "**🎲 Mini-jeux** : `/pfc` `/pile` `/de` `/8ball` `/quiz`",
      "**🛡️ Modération** : `/warn` `/warns` `/mute` `/unmute` `/ban`"].join("\n"), COL.info, { footer: { text: "Créé avec llmms ia" } });
    case "daily": {
      const u = await getU(g, uid); if (u.daily && now - u.daily < 864e5) return eph(`⏳ Reviens dans ${wait(864e5 - (now - u.daily))} pour ton daily.`);
      const streak = u.daily && now - u.daily < 2 * 864e5 ? (u.streak || 0) + 1 : 1, gain = 500 + Math.min(streak, 10) * 100;
      u.c += gain; u.daily = now; u.streak = streak; await putU(g, uid, u);
      return emb("🎁 Daily récupéré !", `+${nf(gain)} ${PIECE}\n🔥 Série : **${streak} jour${streak > 1 ? "s" : ""}**\nSolde : **${nf(u.c)}** ${PIECE}`, COL.ok);
    }
    case "work": {
      const u = await getU(g, uid); if (u.work && now - u.work < 36e5) return eph(`⏳ Tu es fatigué. Reviens dans ${wait(36e5 - (now - u.work))}.`);
      const jobs = [["a livré des pizzas 🍕", 150, 400], ["a codé un jeu BLOXY 🧱", 250, 600], ["a fait un live 🔴", 100, 700], ["a vendu des Noflex 🐴", 200, 500], ["a monté une vidéo 🎬", 180, 450], ["a été caissier 🛒", 120, 300]];
      const [t, a, b] = pick(jobs), gain = ri(a, b); u.c += gain; u.work = now; await putU(g, uid, u);
      return emb("💼 Au travail !", `**${name}** ${t} et gagne **${nf(gain)}** ${PIECE}`, COL.ok);
    }
    case "solde": {
      const id = target || uid, u = await getU(g, id);
      return emb(`💰 ${target ? tName : name}`, `👛 Portefeuille : **${nf(u.c)}** ${PIECE}\n🏦 Banque : **${nf(u.bank)}** ${PIECE}${u.inv.length ? `\n🎒 ${u.inv.map(v => SHOP.find(s => s[0] === v)?.[1].split(" ")[0]).join(" ")}` : ""}`, COL.gold);
    }
    case "pay": {
      const n = Math.floor(opt(i, "montant")); if (target === uid) return eph("Tu ne peux pas te payer toi-même 😅"); if (tUser?.bot) return eph("Les bots n'ont pas besoin d'argent 🤖");
      const u = await getU(g, uid); if (u.c < n) return eph(`Tu n'as que ${nf(u.c)} ${PIECE}`);
      const t = await getU(g, target); u.c -= n; t.c += n; await putU(g, uid, u); await putU(g, target, t);
      return emb("💸 Paiement envoyé", `**${name}** a donné **${nf(n)}** ${PIECE} à <@${target}>`, COL.ok);
    }
    case "vol": {
      if (target === uid) return eph("Te voler toi-même ? 🤔"); if (tUser?.bot) return eph("On ne vole pas les bots 🤖");
      const u = await getU(g, uid); if (u.vol && now - u.vol < 36e5) return eph(`⏳ La police te surveille. Réessaie dans ${wait(36e5 - (now - u.vol))}.`);
      const t = await getU(g, target); u.vol = now; if (t.c < 100) { await putU(g, uid, u); return emb("🕵️ Vol raté", `<@${target}> n'a presque rien sur lui… tout est à la banque 🏦`, COL.ko); }
      if (t.inv.includes("cadenas")) { t.inv.splice(t.inv.indexOf("cadenas"), 1); await putU(g, target, t); await putU(g, uid, u); return emb("🔒 Bloqué !", `<@${target}> avait un cadenas. Ton vol a échoué (et son cadenas a cassé).`, COL.ko); }
      if (Math.random() < .45) { const n = Math.floor(t.c * (.1 + Math.random() * .25)); t.c -= n; u.c += n; await putU(g, uid, u); await putU(g, target, t); return emb("😈 VOL RÉUSSI !", `**${name}** a volé **${nf(n)}** ${PIECE} à <@${target}> !`, COL.ok); }
      const fine = Math.min(u.c, ri(200, 800)); u.c -= fine; await putU(g, uid, u); return emb("🚓 Attrapé !", `**${name}** s'est fait attraper en volant <@${target}> et paie **${nf(fine)}** ${PIECE} d'amende.`, COL.ko);
    }
    case "banque": {
      const a = opt(i, "action"), n = Math.floor(opt(i, "montant")), u = await getU(g, uid);
      if (a === "dep") { if (u.c < n) return eph(`Tu n'as que ${nf(u.c)} ${PIECE} sur toi`); u.c -= n; u.bank += n; } else { if (u.bank < n) return eph(`Tu n'as que ${nf(u.bank)} ${PIECE} à la banque`); u.bank -= n; u.c += n; }
      await putU(g, uid, u); return emb("🏦 Banque", `👛 ${nf(u.c)} ${PIECE} · 🏦 ${nf(u.bank)} ${PIECE}`, COL.gold);
    }
    case "shop": return emb("🛒 Boutique", SHOP.map(([v, n, p]) => `${n} — **${nf(p)}** ${PIECE}`).join("\n") + "\n\nAchète avec `/acheter`", COL.gold);
    case "acheter": {
      const it = SHOP.find(s => s[0] === opt(i, "objet")), u = await getU(g, uid); if (!it) return eph("Objet inconnu");
      if (u.c < it[2]) return eph(`Il te manque ${nf(it[2] - u.c)} ${PIECE}`); u.c -= it[2];
      if (it[0] === "coffre") { const gain = pick([500, 1000, 1500, 3000, 6000, 12000]); u.c += gain; await putU(g, uid, u); return emb("🎁 Coffre ouvert !", `Il contenait **${nf(gain)}** ${PIECE} ${gain > 2500 ? "🔥" : "😅"}`, gain > 2500 ? COL.ok : COL.ko); }
      u.inv.push(it[0]); await putU(g, uid, u); return emb("✅ Acheté", `**${name}** a acheté ${it[1]} !`, COL.ok);
    }
    case "top": {
      const [r] = await kv([["ZREVRANGE", TOP(g), 0, 9, "WITHSCORES"]]); if (!r || !r.length) return eph("Personne n'a encore de pièces. Fais `/daily` !");
      const lines = []; for (let k = 0; k < r.length; k += 2) lines.push(`${["🥇", "🥈", "🥉"][k / 2] || `**#${k / 2 + 1}**`} <@${r[k]}> — ${nf(+r[k + 1])} ${PIECE}`);
      return { type: 4, data: { embeds: [{ title: "🏆 Les plus riches", description: lines.join("\n"), color: COL.gold }], allowed_mentions: { parse: [] } } };
    }
    case "bloxy": return { type: 4, data: { embeds: [{ title: "🧱 BLOXY", description: "La plateforme de jeux de LLMMS : avatar, skins, jeux Steal, obbys, multijoueur, BLOXY IA…", url: `${SITE}/bloxy.html`, color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 5, label: "▶ Jouer à BLOXY", url: `${SITE}/bloxy.html` }, { type: 2, style: 5, label: "💰 EMPIRE MILLIONNAIRE", url: `${SITE}/empire.html` }] }] } };
    case "profil": {
      const p = String(opt(i, "pseudo") || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 20); const [v] = await kv([["GET", "llmms:bx:prof:" + p]]);
      if (!v) return eph("Profil introuvable. Le joueur doit ouvrir BLOXY sur le site au moins une fois.");
      const d = JSON.parse(v);
      return emb(`${d.disp}${d.cert ? " ✅" : ""}`, `@${d.user}\n👥 **${nf(d.fol)}** abonnés · 🤝 ${nf(d.fr)} amis\n🪙 **${nf(d.bux)}** Bloxbux · 🎒 inventaire ${nf(d.inv)}\n\n🎮 **Jeux**\n${(d.games || []).map(x => `• ${x.n} — 👥 ${nf(x.pl)} · ${nf(x.vis)} visites`).join("\n") || "aucun"}`, d.cert ? 0x3b82f6 : COL.info, { url: `${SITE}/bloxy.html` });
    }
    case "classement": {
      const [r] = await kv([["ZREVRANGE", "llmms:bx:top", 0, 9, "WITHSCORES"]]); if (!r || !r.length) return eph("Pas encore de créateurs classés.");
      const lines = []; for (let k = 0; k < r.length; k += 2) lines.push(`${["🥇", "🥈", "🥉"][k / 2] || `**#${k / 2 + 1}**`} ${r[k]} — ${nf(+r[k + 1])} abonnés`);
      return emb("🏆 Top créateurs BLOXY", lines.join("\n"), COL.gold);
    }
    case "pfc": case "pile": {
      const mise = Math.floor(opt(i, "mise") || 0), u = mise ? await getU(g, uid) : null; if (mise && u.c < mise) return eph(`Tu n'as que ${nf(u.c)} ${PIECE}`);
      let win, txt;
      if (cmd === "pfc") { const c = opt(i, "choix"), b = pick(["pierre", "feuille", "ciseaux"]), E = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" }; const beats = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" };
        win = c === b ? null : beats[c] === b; txt = `${E[c]} contre ${E[b]} → ${win === null ? "**Égalité !** 🤝" : win ? "**Tu gagnes !** 🎉" : "**Perdu !** 😢"}`; }
      else { const c = opt(i, "choix"), r = Math.random() < .5 ? "pile" : "face"; win = c === r; txt = `🪙 La pièce tombe sur **${r}** → ${win ? "**Gagné !** 🎉" : "**Perdu !** 😢"}`; }
      if (mise && win !== null) { u.c += win ? mise : -mise; await putU(g, uid, u); txt += `\n${win ? "+" : "−"}${nf(mise)} ${PIECE} (solde : ${nf(u.c)})`; }
      return emb(cmd === "pfc" ? "✂️ Pierre, feuille, ciseaux" : "🪙 Pile ou face", txt, win ? COL.ok : win === false ? COL.ko : COL.info);
    }
    case "de": { const f = opt(i, "faces") || 6; return emb("🎲 Lancer de dé", `**${name}** lance un d${f}… **${ri(1, f)}** !`); }
    case "8ball": return emb("🎱 Boule magique", `> ${String(opt(i, "question")).slice(0, 200)}\n**${pick(["Oui, clairement ✅", "Non 😬", "Peut-être… 🤔", "Sans aucun doute 💯", "Demande plus tard ⏳", "Je ne pense pas ❌", "Les signes disent oui 🔮", "Même pas en rêve 😂"])}**`);
    case "quiz": { const k = ri(0, QUIZ.length - 1), q = QUIZ[k];
      return { type: 4, data: { embeds: [{ title: "🧠 Quiz", description: `**${q[0]}**\nBonne réponse = 200 ${PIECE}`, color: COL.info }], components: [{ type: 1, components: q[1].map((a, j) => ({ type: 2, style: 1, label: a, custom_id: `quiz:${k}:${j}:${uid}` })) }] } }; }
    case "fakenitro": { const d = opt(i, "duree") || "1 mois", troll = String(opt(i, "message") || "non je t'ai troll mdr 😂").slice(0, 150).replace(/:/g, "꞉");
      return { type: 4, data: { content: "Tiens, cadeau 🎁", embeds: [{ author: { name: "Tu as reçu un cadeau !" }, title: `Nitro · ${d}`, description: `**${name}** t'offre **Nitro** pendant **${d}** ✨
Clique vite avant que ça expire !`, color: 0xff73fa }],
        components: [{ type: 1, components: [{ type: 2, style: 3, label: "🎁 Récupérer", custom_id: `nitro:${uid}:${(() => { let t = troll; while (Buffer.byteLength(t) > 54) t = [...t].slice(0, -1).join(""); return Buffer.from(t).toString("base64url"); })()}` }] }] } }; }
    case "warn": {
      const raison = String(opt(i, "raison")).slice(0, 200), key = `llmms:dc:${g}:warn:${target}`; const [n] = await kv([["RPUSH", key, JSON.stringify({ r: raison, by: uid, t: now })]]);
      return emb("⚠️ Avertissement", `<@${target}> a reçu un avertissement (**${n}** au total)\nRaison : ${raison}`, COL.ko);
    }
    case "warns": { const [l] = await kv([["LRANGE", `llmms:dc:${g}:warn:${target}`, 0, 19]]); const w = (l || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return emb(`⚠️ Avertissements de ${tName}`, w.length ? w.map((x, k) => `**${k + 1}.** ${x.r} — <t:${Math.floor(x.t / 1000)}:R>`).join("\n") : "Aucun avertissement ✅", w.length ? COL.ko : COL.ok); }
    case "mute": { const min = opt(i, "minutes"), raison = opt(i, "raison") || "aucune raison";
      await bot(`/guilds/${g}/members/${target}`, "PATCH", { communication_disabled_until: new Date(now + min * 6e4).toISOString() });
      return emb("🔇 Membre muet", `<@${target}> est muet pendant **${min} min**\nRaison : ${raison}`, COL.ko); }
    case "unmute": await bot(`/guilds/${g}/members/${target}`, "PATCH", { communication_disabled_until: null }); return emb("🔊 Parole rendue", `<@${target}> peut de nouveau parler.`, COL.ok);
    case "ban": { const raison = opt(i, "raison") || "aucune raison"; await bot(`/guilds/${g}/bans/${target}`, "PUT", { delete_message_seconds: 0 }); return emb("🔨 Membre banni", `**${tName}** a été banni.\nRaison : ${raison}`, COL.ko); }
    case "give": { const n = Math.floor(opt(i, "montant")), t = await getU(g, target); t.c = Math.max(0, t.c + n); await putU(g, target, t); return emb("🛠️ Give admin", `<@${target}> reçoit **${nf(n)}** ${PIECE} (solde : ${nf(t.c)})`, COL.ok); }
  }
  return eph("Commande inconnue");
}

async function button(i) {
  const [kind, k, j, owner] = String(i.data.custom_id).split(":"), uid = (i.member?.user || i.user).id, g = i.guild_id || "dm";
  if (kind === "nitro") { let troll = "non je t'ai troll mdr 😂"; try { troll = Buffer.from(j || "", "base64url").toString("utf8") || troll; } catch {}
    if (uid === k) return eph("C'est toi qui l'as envoyé 😏 attends que ta victime clique !");
    return { type: 7, data: { content: "", embeds: [{ title: "🤡 " + troll, description: `<@${uid}> a cru au Nitro gratuit 😂😂
Piégé par <@${k}> !`, color: 0xef4444, footer: { text: "/fakenitro · le bot de LLMMS" } }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🤡 Piégé", custom_id: "nitro_done", disabled: true }] }] } }; }
  if (kind === "chatr") { if (uid !== k) return eph("Lance ta propre discussion avec `/discute` 😉"); return { type: 9, data: { custom_id: "chatm:" + uid, title: "Répondre à llmms ia", components: [{ type: 1, components: [{ type: 4, custom_id: "msg", label: "Ton message", style: 2, max_length: 600, required: true }] }] } }; }
  if (kind === "chatn") { if (uid !== k) return eph("Ce n'est pas ta discussion 😉"); await kv([["DEL", CH(uid)]]); return eph("🔄 C'est oublié ! Recommence avec `/discute`."); }
  if (kind !== "quiz") return eph("Bouton inconnu");
  if (uid !== owner) return eph("Ce quiz n'est pas pour toi : lance le tien avec `/quiz` 😉");
  const q = QUIZ[+k], ok = +j === q[2]; let extra = "";
  if (ok) { const u = await getU(g, uid); u.c += 200; await putU(g, uid, u); extra = `\n+200 ${PIECE} (solde : ${nf(u.c)})`; }
  return { type: 7, data: { embeds: [{ title: "🧠 Quiz", description: `**${q[0]}**\n${ok ? "✅ Bonne réponse !" : `❌ Raté ! C'était **${q[1][q[2]]}**`}${extra}`, color: ok ? COL.ok : COL.ko }], components: [] } };
}

/* ---------------- réception des requêtes Discord ---------------- */
function readRaw(req) { return new Promise(ok => { let d = "", done = false; const fin = () => { if (done) return; done = true; if (!d) { try { const b = req.body; d = typeof b === "string" ? b : Buffer.isBuffer(b) ? b.toString("utf8") : b ? JSON.stringify(b) : ""; } catch {} } ok(d); };
  if (req.readableEnded) return fin(); req.setEncoding("utf8"); req.on("data", c => d += c); req.on("end", fin); req.on("error", fin); setTimeout(fin, 3000); }); }
function checkSig(raw, sig, ts) {
  const pub = (process.env.DISCORD_PUBLIC_KEY || "").trim(); if (!pub || !sig || !ts) return false;
  try { const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pub, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(ts + raw), key, Buffer.from(sig, "hex")); } catch { return false; }
}
function bg(p) { try { const ctx = globalThis[Symbol.for("@vercel/request-context")]?.get?.(); if (ctx?.waitUntil) { ctx.waitUntil(p); return true; } } catch {} return false; }

export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method === "GET") {
    const app = (process.env.DISCORD_APP_ID || "").trim(), q = new URL(req.url, "http://x").searchParams;
    if (q.get("register")) {
      if (!app || q.get("register") !== app) return res.status(403).send("Mets ?register=TON_APPLICATION_ID (et vérifie DISCORD_APP_ID sur Vercel).");
      try { const r = await bot(`/applications/${app}/commands`, "PUT", CMDS); return res.status(200).send(`✅ ${r.length} commandes installées ! Elles apparaissent sur ton serveur en tapant /`); }
      catch (e) { return res.status(500).send("❌ " + e.message); }
    }
    const pk = (process.env.DISCORD_PUBLIC_KEY || "").trim(), tk = (process.env.DISCORD_BOT_TOKEN || "").trim();
    const lines = [
      `DISCORD_APP_ID : ${!app ? "❌ manquant" : /^\d{17,20}$/.test(app.trim()) ? "✅ OK" : "❌ doit contenir seulement des chiffres (" + app.trim().length + " caractères)"}`,
      `DISCORD_PUBLIC_KEY : ${!pk ? "❌ manquant" : /^[0-9a-f]{64}$/i.test(pk) ? "✅ OK" : "❌ ce n'est pas la clé publique (" + pk.length + " caractères au lieu de 64, lettres a-f et chiffres)"}`,
      `DISCORD_BOT_TOKEN : ${!tk ? "❌ manquant" : tk.split(".").length === 3 ? "✅ OK" : "❌ ne ressemble pas à un token"}`];
    return res.status(200).setHeader("Content-Type", "text/plain; charset=utf-8").send("🤖 Bot LLMMS — vérification\n\n" + lines.join("\n"));
  }
  if (req.method !== "POST") return res.status(405).end();
  const raw = await readRaw(req);
  if (!checkSig(raw, req.headers["x-signature-ed25519"], req.headers["x-signature-timestamp"])) return res.status(401).send("signature invalide");
  const i = JSON.parse(raw);
  if (i.type === 1) return res.json({ type: 1 });
  try {
    const late = (p, type) => { const f = async () => { const body = await p; await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }; const q = f().catch(() => {}); if (bg(q)) return res.json({ type }); res.json({ type }); return q; };
    const who = i.member?.nick || (i.member?.user || i.user)?.global_name || (i.member?.user || i.user)?.username, uid = (i.member?.user || i.user)?.id;
    if (i.type === 3 && String(i.data.custom_id).startsWith("idee:")) { const [, t, ...pr] = String(i.data.custom_id).split(":"); const prec = pr.join(":"); return await late(ideas(t, prec).then(x => ideaMsg(t, prec, x)), 6); }
    if (i.type === 5 && String(i.data.custom_id).startsWith("chatm:")) { const msg = String(i.data.components?.[0]?.components?.[0]?.value || "").slice(0, 600); return await late(chat(uid, who, msg), 5); }
    if (i.type === 2 && i.data.name === "discute") return await late(chat(uid, who, String(opt(i, "message") || "").slice(0, 600)), 5);
    if (i.type === 2 && i.data.name === "idee") { const t = opt(i, "sujet"), prec = String(opt(i, "precision") || "").replace(/:/g, " ").slice(0, 60); return await late(ideas(t, prec).then(x => ideaMsg(t, prec, x)), 5); }
    if (i.type === 3) return res.json(await button(i));
    if (i.type === 2 && i.data.name === "ia") {
      const q = String(opt(i, "question") || "").slice(0, 500), who = i.member?.user?.username || i.user?.username;
      const fin = async () => { let txt; try { txt = await gemini(q); } catch (e) { txt = "😵 " + e.message; } await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ title: "🤖 llmms ia", description: `> ${q.slice(0, 200)}\n\n${txt}`.slice(0, 4000), color: COL.info, footer: { text: "Demandé par " + who } }] }) }); };
      const p = fin(); if (bg(p)) return res.json({ type: 5 });
      res.json({ type: 5 }); await p; return;
    }
    if (i.type === 2) return res.json(await run(i));
  } catch (e) { return res.json(eph("😵 Erreur : " + String(e.message || e).slice(0, 180))); }
  res.json(eph("Commande inconnue"));
}
