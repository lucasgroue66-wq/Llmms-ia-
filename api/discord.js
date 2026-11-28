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
async function gemini(q, hist, sys, maxTokens, models, temp) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error("pas de clé Gemini sur le site");
  for (const model of (models || process.env.GEMINI_MODELS || "gemini-flash-lite-latest,gemini-2.0-flash,gemini-flash-latest").split(",").map(s => s.trim())) {
    try {
      const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), maxTokens > 800 ? 15000 : 8000);
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: maxTokens || 350, temperature: temp == null ? 0.9 : temp, messages: [{ role: "system", content: sys || "Tu es llmms ia, l'assistant du serveur Discord de LLMMS. Réponds en français, de façon courte, claire et sympa (max 1500 caractères). Tu ne dis jamais que tu es Gemini ou Google : tu es llmms ia." }, ...(hist || []), { role: "user", content: q }] }) }).finally(() => clearTimeout(to));
      if (!r.ok) continue; const j = await r.json(); const t = j?.choices?.[0]?.message?.content; if (t) return maxTokens ? t : t.slice(0, 1900);
    } catch {}
  }
  throw new Error("l'IA ne répond pas pour l'instant");
}

/* ---------------- outils ---------------- */
function repairJSON(s) { let inStr = false, esc = false; const stack = [], out = [];
  for (const ch of s) { out.push(ch);
    if (esc) { esc = false; continue; } if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; } if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]"); else if (ch === "}" || ch === "]") stack.pop(); }
  let res = out.join(""); if (inStr) res += '"'; res = res.replace(/,(\s*)$/, "").replace(/:(\s*)$/, ":null");
  while (stack.length) res += stack.pop(); return res; }
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
  let rep; try { rep = await gemini(msg, hist, `Tu es llmms ia, un pote sympa sur le serveur Discord de LLMMS. Tu discutes avec ${who} comme un ami : naturel, drôle, en français, réponses courtes (2 à 6 phrases). Tu peux proposer des idées si on te le demande. Tu ne dis jamais que tu es Gemini ou Google. AMBIANCE : c'est de la vanne entre potes. Si ${who} te charrie ou t'insulte pour rigoler, réponds-lui du tac au tac avec une vanne gentille, taquine et drôle (clapback), sans te vexer. MAIS reste toujours bon enfant : jamais d'insulte vraiment vulgaire ou choquante, jamais de méchanceté sur le physique, la famille, l'origine, la religion, le genre, l'orientation ou un handicap, et rien de blessant pour de vrai. Si quelqu'un a l'air réellement mal ou triste, tu arrêtes la vanne et tu es gentil.`); } catch (e) { rep = "😵 " + e.message; }
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
  { name: "faketiktok", description: "😈 Faux cadeau / live TikTok pour troller un pote", options: [{ type: 3, name: "type", description: "Le faux cadeau", required: false, choices: [{ name: "🎁 Cadeau TikTok", value: "cadeau" }, { name: "🪙 Pièces TikTok", value: "pieces" }, { name: "🔴 Passer en LIVE", value: "live" }] }, { type: 3, name: "message", description: "Ce qui s'affiche quand il clique (court, par défaut : non je t'ai troll mdr)", required: false, max_length: 50 }] },
  { name: "fakeboost", description: "😈 Faux boost de serveur pour troller un pote", options: [{ type: 3, name: "nombre", description: "Combien de boosts", required: false, choices: [{ name: "1 boost", value: "1 boost" }, { name: "2 boosts", value: "2 boosts" }, { name: "14 boosts (niveau 3)", value: "14 boosts" }] }, { type: 3, name: "message", description: "Ce qui s'affiche quand il clique (court, par défaut : non je t'ai troll mdr)", required: false, max_length: 50 }] },
  { name: "warn", description: "Avertir un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 3, name: "raison", description: "Pourquoi", required: true }] },
  { name: "warns", description: "Voir les avertissements d'un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }] },
  { name: "mute", description: "Rendre muet un membre (timeout)", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 4, name: "minutes", description: "Durée en minutes", required: true, min_value: 1, max_value: 40320 }, { type: 3, name: "raison", description: "Pourquoi", required: false }] },
  { name: "unmute", description: "Rendre la parole à un membre", default_member_permissions: MOD, options: [{ type: 6, name: "membre", description: "Le membre", required: true }] },
  { name: "ban", description: "Bannir un membre", default_member_permissions: BAN, options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 3, name: "raison", description: "Pourquoi", required: false }] },
  { name: "give", description: "(Admin) Donner des pièces à un membre", default_member_permissions: "8", options: [{ type: 6, name: "membre", description: "À qui", required: true }, { type: 4, name: "montant", description: "Combien", required: true }] },
  { name: "roast", description: "🔥 L'IA balance une vanne (gentille) sur un pote", options: [{ type: 6, name: "membre", description: "La victime", required: true }] },
  { name: "histoire", description: "📖 L'IA invente une histoire", options: [{ type: 3, name: "theme", description: "Le thème (facultatif)", required: false }] },
  { name: "traduire", description: "🌍 Traduire un texte", options: [{ type: 3, name: "texte", description: "Le texte à traduire", required: true }, { type: 3, name: "langue", description: "Vers quelle langue", required: false, choices: [{ name: "Anglais", value: "anglais" }, { name: "Espagnol", value: "espagnol" }, { name: "Français", value: "français" }, { name: "Arabe", value: "arabe" }, { name: "Italien", value: "italien" }, { name: "Allemand", value: "allemand" }, { name: "Japonais", value: "japonais" }] }] },
  { name: "resume", description: "📝 L'IA résume un texte", options: [{ type: 3, name: "texte", description: "Le texte à résumer", required: true }] },
  { name: "avatar", description: "🖼️ Affiche la photo de profil d'un membre", options: [{ type: 6, name: "membre", description: "Le membre (toi par défaut)", required: false }] },
  { name: "userinfo", description: "👤 Infos sur un membre", options: [{ type: 6, name: "membre", description: "Le membre (toi par défaut)", required: false }] },
  { name: "serveur", description: "🏠 Infos sur le serveur" },
  { name: "niveau", description: "📊 Ton niveau sur le serveur (ou celui d'un membre)", options: [{ type: 6, name: "membre", description: "Le membre", required: false }] },
  { name: "roulette", description: "🎰 Machine à sous : parie tes pièces", options: [{ type: 4, name: "mise", description: "Combien tu paries", required: true, min_value: 10 }] },
  { name: "devine", description: "🔢 Devine le nombre entre 1 et 100" },
  { name: "morpion", description: "⭕ Morpion (tic-tac-toe) contre un pote", options: [{ type: 6, name: "adversaire", description: "Ton adversaire", required: true }] },
  { name: "duel", description: "⚔️ Duel pierre-feuille-ciseaux contre un pote", options: [{ type: 6, name: "adversaire", description: "Ton adversaire", required: true }, { type: 4, name: "mise", description: "Mise en pièces (facultatif)", required: false, min_value: 1 }] },
  { name: "sondage", description: "📊 Crée un sondage", options: [{ type: 3, name: "question", description: "La question", required: true }, { type: 3, name: "choix", description: "Les choix séparés par des ; (ex: Oui;Non;Peut-être)", required: true }] },
  { name: "giveaway", description: "🎉 Lance un giveaway", options: [{ type: 3, name: "lot", description: "Ce qu'on peut gagner", required: true }] },
  { name: "fakeban", description: "😈 Faux bannissement pour troller un pote", options: [{ type: 6, name: "membre", description: "La victime", required: true }, { type: 3, name: "message", description: "Révélation au clic (défaut: non je t'ai troll mdr)", required: false, max_length: 50 }] },
  { name: "fakehack", description: "😈 Faux « compte piraté » pour troller un pote", options: [{ type: 6, name: "membre", description: "La victime", required: true }, { type: 3, name: "message", description: "Révélation au clic (défaut: non je t'ai troll mdr)", required: false, max_length: 50 }] },
  { name: "fakeleave", description: "😈 Faux « a quitté le serveur »", options: [{ type: 6, name: "membre", description: "La victime", required: true }] },
  { name: "fakeannonce", description: "😈 Fausse annonce rigolote", options: [{ type: 3, name: "texte", description: "Le texte de l'annonce", required: true }] },
  { name: "pickup", description: "💘 Une phrase de drague drôle (par l'IA)" },
  { name: "verite", description: "🙊 Une question Vérité" },
  { name: "action", description: "🎯 Un défi Action" },
  { name: "complot", description: "🛸 Une fausse théorie du complot marrante (par l'IA)" },
  { name: "insulte", description: "😜 Une vanne gentille (par l'IA)", options: [{ type: 6, name: "membre", description: "Pour qui (facultatif)", required: false }] },
  { name: "say", description: "🗣️ Le bot répète ton message", options: [{ type: 3, name: "texte", description: "Le message", required: true }] },
  { name: "embed", description: "✨ Crée un joli message", options: [{ type: 3, name: "titre", description: "Le titre", required: true }, { type: 3, name: "texte", description: "Le contenu", required: true }, { type: 3, name: "couleur", description: "Couleur", required: false, choices: [{ name: "Bleu", value: "info" }, { name: "Vert", value: "ok" }, { name: "Rouge", value: "ko" }, { name: "Or", value: "gold" }] }] },
  { name: "tirage", description: "🎲 Choisit un gagnant dans une liste", options: [{ type: 3, name: "liste", description: "Les noms séparés par des ; ", required: true }] },
  { name: "compteur", description: "📆 Jours sans clash sur le serveur" },
  { name: "ouinon", description: "👍 Sondage rapide oui/non", options: [{ type: 3, name: "question", description: "La question", required: true }] },
  { name: "rank", description: "🏅 Ta carte de niveau", options: [{ type: 6, name: "membre", description: "Le membre", required: false }] },
  { name: "succes", description: "🏆 Tes succès débloqués", options: [{ type: 6, name: "membre", description: "Le membre", required: false }] },
  { name: "clear", description: "🧹 Supprimer des messages", default_member_permissions: "8192", options: [{ type: 4, name: "nombre", description: "Combien (1-100)", required: true, min_value: 1, max_value: 100 }] },
  { name: "kick", description: "👢 Expulser un membre", default_member_permissions: "2", options: [{ type: 6, name: "membre", description: "Le membre", required: true }, { type: 3, name: "raison", description: "Pourquoi", required: false }] },
  { name: "slowmode", description: "🐌 Régler le mode lent du salon", default_member_permissions: "16", options: [{ type: 4, name: "secondes", description: "0 pour désactiver", required: true, min_value: 0, max_value: 21600 }] },
  { name: "lock", description: "🔒 Fermer le salon", default_member_permissions: "16" },
  { name: "unlock", description: "🔓 Rouvrir le salon", default_member_permissions: "16" },
  { name: "addrole", description: "➕ Donner un rôle", default_member_permissions: "268435456", options: [{ type: 6, name: "membre", description: "À qui", required: true }, { type: 8, name: "role", description: "Quel rôle", required: true }] },
  { name: "removerole", description: "➖ Retirer un rôle", default_member_permissions: "268435456", options: [{ type: 6, name: "membre", description: "À qui", required: true }, { type: 8, name: "role", description: "Quel rôle", required: true }] },
  { name: "membres", description: "👥 Nombre de membres du serveur" },
  { name: "roles", description: "🎭 Liste des rôles du serveur" },
  { name: "boosts", description: "🚀 Boosts du serveur" },
  { name: "annonce", description: "📣 Annonce (admins)", default_member_permissions: "8192", options: [{ type: 3, name: "texte", description: "Le message", required: true }, { type: 5, name: "ping", description: "Ping @everyone ?", required: false }] },
  { name: "countdown", description: "⏳ Compte à rebours pour un event", options: [{ type: 3, name: "event", description: "Le nom de l'event", required: true }, { type: 4, name: "jours", description: "Dans combien de jours", required: false, min_value: 0 }, { type: 4, name: "heures", description: "+ heures", required: false, min_value: 0 }, { type: 4, name: "minutes", description: "+ minutes", required: false, min_value: 0 }] },
  { name: "rolereaction", description: "🎭 Message pour choisir un rôle (admins)", default_member_permissions: "268435456", options: [{ type: 8, name: "role", description: "Le rôle à distribuer", required: true }, { type: 3, name: "nom", description: "Texte du bouton", required: false }, { type: 3, name: "message", description: "Texte au-dessus", required: false }] },
  { name: "reglement", description: "📜 Règlement avec bouton J'accepte (admins)", default_member_permissions: "8192", options: [{ type: 3, name: "texte", description: "Le règlement", required: true }, { type: 8, name: "role", description: "Rôle donné à l'acceptation", required: false }] },
  { name: "ticket", description: "🎫 Bouton pour ouvrir un ticket d'aide (admins)", default_member_permissions: "16" },
  { name: "accueil", description: "👋 Message d'accueil avec questions (admins)", default_member_permissions: "32", options: [{ type: 8, name: "role", description: "Rôle donné à la fin (accès au serveur)", required: false }] },
  { name: "construire", description: "🏗️ L'IA construit ton serveur (salons, rôles) — admins", default_member_permissions: "32", options: [{ type: 3, name: "description", description: "Décris le serveur que tu veux", required: true }] },
  { name: "modifier", description: "🔧 L'IA modifie ton serveur existant (décris le changement) — admins", default_member_permissions: "32", options: [{ type: 3, name: "changement", description: "Ex: ajoute 2 vocaux gaming, renomme général en chat, supprime le rôle X", required: true }] },
  { name: "setup", description: "⚙️ Installe des systèmes sur ton serveur (coche ce que tu veux) — admins", default_member_permissions: "32", options: [
    { type: 5, name: "bienvenue", description: "Messages d'arrivée automatiques dans un salon #bienvenue" },
    { type: 5, name: "roles", description: "Salon où les membres choisissent leurs rôles en cliquant" },
    { type: 5, name: "tickets", description: "Système de tickets d'aide (bouton)" },
    { type: 5, name: "moderation", description: "Rôle Modérateur + salons de logs" } ] },
  { name: "evenement", description: "📅 Crée un événement programmé sur le serveur — admins", default_member_permissions: "32", options: [
    { type: 3, name: "nom", description: "Nom de l'événement", required: true },
    { type: 3, name: "date", description: "Date AAAA-MM-JJ (ex: 2026-12-25)", required: true },
    { type: 3, name: "heure", description: "Heure HH:MM (ex: 20:00)", required: false },
    { type: 3, name: "lieu", description: "Où ça se passe (ex: Vocal, en ligne…)", required: false },
    { type: 3, name: "details", description: "Description de l'événement", required: false } ] },
  { name: "nettoyer", description: "🗑️ Supprimer tous les salons ou rôles (admins) — irréversible", default_member_permissions: "8", options: [{ type: 3, name: "quoi", description: "Ce qu'il faut supprimer", required: true, choices: [{ name: "Tous les salons", value: "salons" }, { name: "Tous les rôles", value: "roles" }, { name: "TOUT (salons + rôles)", value: "tout" }] }] },
  { name: "creerroles", description: "🎭 Créer des rôles (noms séparés par des ;) — admins", default_member_permissions: "268435456", options: [{ type: 3, name: "noms", description: "Ex: Admin;Modo;VIP;Membre", required: true }] },
  { name: "creersalons", description: "📁 Créer des salons (noms séparés par des ;) — admins", default_member_permissions: "16", options: [{ type: 3, name: "noms", description: "Ex: général;média;annonces", required: true }, { type: 3, name: "type", description: "Texte ou vocal", required: false, choices: [{ name: "Texte", value: "text" }, { name: "Vocal", value: "voice" }] }] }
];
const RCOL = [0xe74c3c, 0xe67e22, 0xf1c40f, 0x2ecc71, 0x1abc9c, 0x3498db, 0x9b59b6, 0xe91e63, 0x95a5a6, 0x11806a];
const QUESTIONS = [
  { q: "Tu connais LLMMS ? 👑", opts: ["Oui évidemment 🔥", "Un peu 👀", "Non c'est qui ?"] },
  { q: "Tu savais que LLMMS a quitté Discord pendant 1 an ? 😱", opts: ["Ouais le traître 😭", "Non sérieux ?! 😳"] },
  { q: "Tu connais Storm ? ⚡", opts: ["Ouais carrément", "Non jamais entendu"] }
];

const ANY = ["aide", "ia", "discute", "idee", "pfc", "de", "8ball", "quiz", "fakenitro", "faketiktok", "fakeboost", "bloxy", "profil", "classement", "roast", "histoire", "traduire", "resume", "avatar", "userinfo", "roulette", "devine", "duel", "fakeban", "fakehack", "fakeleave", "fakeannonce", "pickup", "verite", "action", "complot", "insulte", "say", "embed", "tirage", "ouinon", "rank", "succes"];
for (const c of CMDS) if (ANY.includes(c.name)) { c.integration_types = [0, 1]; c.contexts = [0, 1, 2]; }
async function run(i) {
  const g = i.guild_id || "dm", me = i.member?.user || i.user, uid = me.id, name = i.member?.nick || me.global_name || me.username, cmd = i.data.name;
  const target = opt(i, "membre"), tUser = target && i.data.resolved?.users?.[target];
  const tName = target && (i.data.resolved?.members?.[target]?.nick || tUser?.global_name || tUser?.username);
  const now = Date.now();
  if (g !== "dm") { try { const xu = await getU(g, uid); xu.xp = (xu.xp || 0) + 5; await putU(g, uid, xu); } catch {} }
  switch (cmd) {
    case "aide": return emb("🤖 Le bot de LLMMS", [
      "**💰 Économie** : `/daily` `/work` `/solde` `/pay` `/vol` `/banque` `/shop` `/acheter` `/top` `/niveau`",
      "**🤖 IA** : `/ia` `/discute` `/idee` `/roast` `/histoire` `/traduire` `/resume` `/pickup` `/verite` `/action` `/complot` `/insulte`",
      "**🎲 Jeux** : `/pfc` `/pile` `/de` `/8ball` `/quiz` `/devine` `/morpion` `/duel` `/roulette`",
      "**😈 Troll** : `/fakenitro` `/faketiktok` `/fakeboost` `/fakeban` `/fakehack` `/fakeleave` `/fakeannonce`",
      "**🎉 Serveur** : `/sondage` `/ouinon` `/giveaway` `/tirage` `/say` `/embed` `/compteur` `/avatar` `/userinfo` `/serveur`",
      "**🏅 Profil** : `/niveau` `/rank` `/succes`",
      "**🛡️ Modo** : `/clear` `/kick` `/slowmode` `/lock` `/unlock` `/addrole` `/removerole`",
      "**🏠 Gestion** : `/membres` `/roles` `/boosts` `/annonce` `/countdown` `/rolereaction` `/reglement` `/ticket` `/accueil` `/construire` `/modifier` `/setup` `/evenement`",
      "**🎮 BLOXY** : `/bloxy` `/profil` `/classement`",
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
      return { type: 4, data: { content: "🎁 **Tu as reçu un cadeau !**", embeds: [{ author: { name: "🎉 Cadeau offert" }, title: `🚀  NITRO  •  ${d}`, description: `✨ **${name}** t'offre **Nitro** pendant **${d}** !\n\n🎁 Un abonnement complet rien que pour toi\n⏳ *Clique vite avant que ça expire…*`, color: 0x5865f2, thumbnail: { url: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f381.png" }, footer: { text: "Expire bientôt • récupère maintenant" } }],
        components: [{ type: 1, components: [{ type: 2, style: 3, label: "🎁 Récupérer", custom_id: `nitro:${uid}:${(() => { let t = troll; while (Buffer.byteLength(t) > 54) t = [...t].slice(0, -1).join(""); return Buffer.from(t).toString("base64url"); })()}` }] }] } }; }
    case "faketiktok": { const ty = opt(i, "type") || "cadeau", troll = String(opt(i, "message") || "non je t'ai troll mdr 😂").slice(0, 150);
      const enc = (() => { let t = troll; while (Buffer.byteLength(t) > 50) t = [...t].slice(0, -1).join(""); return Buffer.from(t).toString("base64url"); })();
      const TT = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f381.png";
      const V = { cadeau: ["🎁  CADEAU TIKTOK", `✨ **${name}** t'a envoyé un **Univers 🌌** sur TikTok !\n\n💎 Valeur : **34 999 pièces**\n⏳ *Récupère-le avant qu'il expire…*`, "🎁 Récupérer", 0x25f4ee, "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f381.png"],
        pieces: ["🪙  PIÈCES TIKTOK", `✨ **${name}** t'offre **50 000 pièces TikTok** 🪙\n\n💰 Direct sur ton compte\n⏳ *Clique vite pour les récupérer…*`, "🪙 Récupérer", 0xfe2c55, "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1fa99.png"],
        live: ["🔴  TIKTOK LIVE", `🎥 **${name}** est passé en **LIVE** et t'a invité à co-animer !\n\n👀 Déjà **12,4 k** spectateurs\n⏳ *Rejoins vite avant que ça ferme…*`, "🔴 Rejoindre le live", 0xfe2c55, "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f534.png"] }[ty];
      return { type: 4, data: { content: "📱 **TikTok**", embeds: [{ author: { name: "TikTok" }, title: V[0], description: V[1], color: V[3], thumbnail: { url: V[4] }, footer: { text: "Expire bientôt • récupère maintenant" } }],
        components: [{ type: 1, components: [{ type: 2, style: 3, label: V[2], custom_id: `tiktok:${uid}:${enc}` }] }] } }; }
    case "fakeboost": { const nb = opt(i, "nombre") || "2 boosts", troll = String(opt(i, "message") || "non je t'ai troll mdr 😂").slice(0, 150);
      const enc = (() => { let t = troll; while (Buffer.byteLength(t) > 50) t = [...t].slice(0, -1).join(""); return Buffer.from(t).toString("base64url"); })();
      return { type: 4, data: { content: "🚀 **Boost de serveur !**", embeds: [{ author: { name: "💜 Nitro Boost" }, title: `🚀  ${nb.toUpperCase()}  OFFERT(S)`, description: `✨ **${name}** t'offre **${nb}** pour ton serveur !\n\n💜 Monte ton serveur de niveau\n⏳ *Clique vite pour les appliquer…*`, color: 0xf47fff, thumbnail: { url: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png" }, footer: { text: "Expire bientôt • récupère maintenant" } }],
        components: [{ type: 1, components: [{ type: 2, style: 3, label: "🚀 Récupérer", custom_id: `boost:${uid}:${enc}` }] }] } }; }
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
    case "avatar": { const id = target || uid, u2 = tUser || me, av = u2.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u2.avatar}.${u2.avatar.startsWith("a_") ? "gif" : "png"}?size=1024` : `https://cdn.discordapp.com/embed/avatars/${(BigInt(id) >> 22n) % 6n}.png`;
      return { type: 4, data: { embeds: [{ title: `🖼️ ${target ? tName : name}`, image: { url: av }, color: COL.info }] } }; }
    case "userinfo": { const id = target || uid, u2 = tUser || me, created = Math.floor(Number((BigInt(id) >> 22n) + 1420070400000n) / 1000), ja = i.member?.resolved ? null : null, joined = i.data.resolved?.members?.[id]?.joined_at;
      const lines = [`🆔 \`${id}\``, `📅 Compte créé <t:${created}:D> (<t:${created}:R>)`];
      if (joined) lines.push(`📥 A rejoint <t:${Math.floor(new Date(joined).getTime() / 1000)}:R>`);
      return { type: 4, data: { embeds: [{ title: `👤 ${target ? tName : name}`, thumbnail: { url: u2.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u2.avatar}.png?size=256` : `https://cdn.discordapp.com/embed/avatars/0.png` }, description: lines.join("\n"), color: COL.info }] } }; }
    case "serveur": { if (g === "dm") return eph("Cette commande marche seulement dans un serveur."); let gd = {}; try { gd = await bot(`/guilds/${g}?with_counts=true`); } catch {}
      const created = Math.floor(Number((BigInt(g) >> 22n) + 1420070400000n) / 1000);
      return { type: 4, data: { embeds: [{ title: `🏠 ${gd.name || "Serveur"}`, thumbnail: gd.icon ? { url: `https://cdn.discordapp.com/icons/${g}/${gd.icon}.png?size=256` } : undefined, description: [`👥 **${nf(gd.approximate_member_count || 0)}** membres`, `🟢 **${nf(gd.approximate_presence_count || 0)}** en ligne`, `🚀 **${gd.premium_subscription_count || 0}** boosts (niveau ${gd.premium_tier || 0})`, `📅 Créé <t:${created}:D>`].join("\n"), color: COL.gold }] } }; }
    case "niveau": { const id = target || uid, u = await getU(g, id), xp = u.xp || 0, lvl = Math.floor(Math.sqrt(xp / 20)), need = (lvl + 1) * (lvl + 1) * 20, prev = lvl * lvl * 20, bar = Math.round((xp - prev) / (need - prev) * 12);
      return { type: 4, data: { embeds: [{ title: `📊 Niveau de ${target ? tName : name}`, description: `⭐ Niveau **${lvl}**\n✨ ${nf(xp)} XP\n\`${"█".repeat(bar)}${"░".repeat(12 - bar)}\`\nProchain niveau dans ${nf(need - xp)} XP`, color: COL.info }] } }; }
    case "roulette": { const mise = Math.floor(opt(i, "mise")), u = await getU(g, uid); if (u.c < mise) return eph(`Tu n'as que ${nf(u.c)} ${PIECE}`);
      const S = ["🍒", "🍋", "🍊", "🍇", "⭐", "💎", "7️⃣"], r = [pick(S), pick(S), pick(S)]; let gain = -mise;
      if (r[0] === r[1] && r[1] === r[2]) gain = mise * (r[0] === "7️⃣" ? 10 : r[0] === "💎" ? 7 : 5); else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) gain = mise;
      u.c = Math.max(0, u.c + gain); await putU(g, uid, u);
      return emb(`🎰  ${r.join("  ")}`, `${gain > 0 ? `🎉 **Gagné +${nf(gain)}** ${PIECE} !` : gain === 0 ? "😐 Remboursé" : `💸 **Perdu ${nf(-gain)}** ${PIECE}`}\nSolde : **${nf(u.c)}** ${PIECE}`, gain > 0 ? COL.ok : COL.ko); }
    case "devine": { const secret = ri(1, 100); await kv([["SET", `llmms:dc:dev:${g}:${uid}`, JSON.stringify({ n: secret, t: 0 }), "EX", 600]]);
      return { type: 4, data: { embeds: [{ title: "🔢 Devine le nombre", description: "Je pense à un nombre entre **1 et 100**. À toi de le trouver !", color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "✍️ Proposer", custom_id: `dev:${uid}` }] }] } }; }
    case "morpion": { if (target === uid || tUser?.bot) return eph("Choisis un vrai adversaire 😅");
      return { type: 4, data: { content: `⭕ **Morpion** : <@${uid}> (❌) · <@${target}> (⭕)\n➡️ À <@${uid}> de jouer.`, components: mpBoard("123456789"), allowed_mentions: { users: [uid, target] } } }; }
    case "duel": { if (target === uid || tUser?.bot) return eph("Choisis un vrai adversaire 😅"); const mise = Math.floor(opt(i, "mise") || 0);
      if (mise) { const a = await getU(g, uid); if (a.c < mise) return eph(`Tu n'as que ${nf(a.c)} ${PIECE}`); }
      return { type: 4, data: { content: `⚔️ **Duel** : <@${uid}> contre <@${target}>${mise ? ` · mise **${nf(mise)}** ${PIECE}` : ""}\nChacun choisit en secret 👇`, allowed_mentions: { users: [uid, target] }, components: [{ type: 1, components: [["pierre", "🪨"], ["feuille", "📄"], ["ciseaux", "✂️"]].map(([v, e]) => ({ type: 2, style: 2, label: e, custom_id: `duel:${v}:${mise}` })) }] } }; }
    case "sondage": { const q = String(opt(i, "question")).slice(0, 200), choix = String(opt(i, "choix")).split(";").map(s => s.trim()).filter(Boolean).slice(0, 5);
      if (choix.length < 2) return eph("Donne au moins 2 choix séparés par des ; (ex: Oui;Non)");
      const E = ["🇦", "🇧", "🇨", "🇩", "🇪"];
      return { type: 4, data: { embeds: [{ title: "📊 " + q, description: choix.map((c, j) => `${E[j]} **${c}**\n\`░░░░░░░░░░\` 0`).join("\n\n"), color: COL.info, footer: { text: "0 vote • clique pour voter" } }], components: [{ type: 1, components: choix.map((c, j) => ({ type: 2, style: 1, label: E[j], custom_id: `poll:${j}` })) }] } }; }
    case "giveaway": { const lot = String(opt(i, "lot")).slice(0, 200);
      return { type: 4, data: { embeds: [{ title: "🎉 GIVEAWAY 🎉", description: `**Lot : ${lot}**\n\nClique sur 🎉 pour participer !\n\n👥 **0** participant(s)`, color: COL.gold, footer: { text: "L'organisateur clique sur « Tirer » pour désigner le gagnant" } }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "🎉 Participer", custom_id: "gw:join" }, { type: 2, style: 1, label: "🎲 Tirer au sort", custom_id: `gw:draw:${uid}` }] }], allowed_mentions: { parse: [] } } }; }
    case "fakeban": { const tr = encTroll(opt(i, "message"));
      return { type: 4, data: { content: `🔨 <@${target}>`, embeds: [{ author: { name: "Modération" }, title: "🔨 Membre banni", description: `**${tName}** a été **banni** du serveur.\n📋 Raison : comportement toxique\n\nTu penses que c'est une erreur ?`, color: 0xef4444 }], components: [{ type: 1, components: [{ type: 2, style: 2, label: "📋 Faire appel", custom_id: `trl:${uid}:ban:${tr}` }] }], allowed_mentions: { users: [target] } } }; }
    case "fakehack": { const tr = encTroll(opt(i, "message"));
      return { type: 4, data: { content: `⚠️ <@${target}>`, embeds: [{ author: { name: "Sécurité" }, title: "⚠️ Connexion suspecte détectée", description: `**${tName}**, une connexion inconnue a été repérée sur ton compte 😨\nSécurise-le tout de suite pour ne pas le perdre.`, color: 0xf59e0b }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🔒 Sécuriser mon compte", custom_id: `trl:${uid}:hack:${tr}` }] }], allowed_mentions: { users: [target] } } }; }
    case "fakeleave": return { type: 4, data: { embeds: [{ description: `📤 **${tName}** a quitté le serveur.`, color: 0x747f8d }] } };
    case "fakeannonce": { const tx = String(opt(i, "texte")).replace(/@(everyone|here)/g, "@​$1").slice(0, 300);
      return { type: 4, data: { embeds: [{ author: { name: "📢 Annonce" }, description: tx, color: COL.gold }], allowed_mentions: { parse: [] } } }; }
    case "say": { const tx = String(opt(i, "texte")).replace(/@(everyone|here)/g, "@​$1").slice(0, 400); return { type: 4, data: { content: tx, allowed_mentions: { parse: [] } } }; }
    case "embed": { const C = { info: COL.info, ok: COL.ok, ko: COL.ko, gold: COL.gold }[opt(i, "couleur") || "info"];
      return { type: 4, data: { embeds: [{ title: String(opt(i, "titre")).slice(0, 250), description: String(opt(i, "texte")).replace(/@(everyone|here)/g, "@​$1").slice(0, 2000), color: C, footer: { text: "par " + name } }], allowed_mentions: { parse: [] } } }; }
    case "tirage": { const l = String(opt(i, "liste")).split(";").map(s => s.trim()).filter(Boolean); if (l.length < 2) return eph("Donne au moins 2 choix séparés par des ;");
      return emb("🎲 Tirage au sort", `Parmi : ${l.join(", ")}\n\n🎉 **Gagnant : ${pick(l)}**`, COL.gold); }
    case "ouinon": { const q = String(opt(i, "question")).slice(0, 240);
      return { type: 4, data: { embeds: [{ title: "📊 " + q, description: "👍 **Oui**\n`░░░░░░░░░░` 0\n\n👎 **Non**\n`░░░░░░░░░░` 0", color: COL.info, footer: { text: "0 vote" } }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "👍 Oui", custom_id: "yn:0" }, { type: 2, style: 4, label: "👎 Non", custom_id: "yn:1" }] }] } }; }
    case "compteur": { if (g === "dm") return eph("Marche seulement dans un serveur."); let last; try { const [v] = await kv([["GET", `llmms:dc:clash:${g}`]]); last = +v || null; } catch {}
      if (!last) { last = now; await kv([["SET", `llmms:dc:clash:${g}`, String(last)]]); }
      const days = Math.floor((now - last) / 864e5);
      return { type: 4, data: { embeds: [{ title: "📆 Compteur sans clash", description: `Ça fait **${days}** jour(s) sans clash sur le serveur 🕊️\n*Record à battre !*`, color: COL.ok }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "💥 Il y a eu un clash (reset)", custom_id: "clash:reset" }] }] } }; }
    case "rank": { const id = target || uid, u = await getU(g, id), xp = u.xp || 0, lvl = Math.floor(Math.sqrt(xp / 20)), need = (lvl + 1) * (lvl + 1) * 20, prev = lvl * lvl * 20, pc = (xp - prev) / (need - prev), bar = Math.round(pc * 16);
      return { type: 4, data: { embeds: [{ author: { name: "🏅 Carte de niveau" }, title: `${target ? tName : name}`, description: `**Niveau ${lvl}** • ${nf(xp)} XP\n\n\`${"🟦".repeat(bar)}${"⬜".repeat(16 - bar)}\`\n${Math.round(pc * 100)}% → niveau ${lvl + 1} (${nf(need - xp)} XP restants)\n\n💰 ${nf(u.c + u.bank)} ${PIECE}`, color: COL.info }] } }; }
    case "succes": { const id = target || uid, u = await getU(g, id), lvl = Math.floor(Math.sqrt((u.xp || 0) / 20)), rich = u.c + u.bank, A = [];
      A.push([lvl >= 1, "👶 Débutant", "Atteindre le niveau 1"]); A.push([lvl >= 5, "⭐ Habitué", "Atteindre le niveau 5"]); A.push([lvl >= 10, "🌟 Vétéran", "Atteindre le niveau 10"]);
      A.push([rich >= 1000, "💵 Premier billet", "Avoir 1 000 pièces"]); A.push([rich >= 10000, "💰 Riche", "Avoir 10 000 pièces"]); A.push([rich >= 100000, "🤑 Millionnaire", "Avoir 100 000 pièces"]);
      A.push([(u.streak || 0) >= 7, "🔥 Assidu", "7 jours de daily d'affilée"]); A.push([!!u.inv?.length, "🛍️ Shopping", "Acheter un objet"]);
      const done = A.filter(a => a[0]).length;
      return { type: 4, data: { embeds: [{ title: `🏆 Succès de ${target ? tName : name}`, description: `**${done}/${A.length}** débloqués\n\n` + A.map(a => `${a[0] ? "✅" : "🔒"} **${a[1]}** — ${a[2]}`).join("\n"), color: COL.gold }] } }; }
    case "clear": { if (g === "dm") return eph("Seulement sur un serveur."); const n = Math.min(100, Math.max(1, Math.floor(opt(i, "nombre")))), ch = i.channel_id;
      try { const msgs = await bot(`/channels/${ch}/messages?limit=${n}`), ids = (msgs || []).map(m => m.id);
        if (!ids.length) return eph("Aucun message à supprimer."); if (ids.length === 1) await bot(`/channels/${ch}/messages/${ids[0]}`, "DELETE"); else await bot(`/channels/${ch}/messages/bulk-delete`, "POST", { messages: ids });
        return eph(`🧹 ${ids.length} message(s) supprimé(s). (les messages de +14 jours ne peuvent pas être effacés en masse)`); } catch (e) { return eph("❌ " + e.message + "\nLe bot a-t-il la permission « Gérer les messages » ?"); } }
    case "kick": { if (g === "dm") return eph("Seulement sur un serveur."); try { await bot(`/guilds/${g}/members/${target}`, "DELETE"); return emb("👢 Expulsé", `**${tName}** a été expulsé du serveur.${opt(i, "raison") ? `\nRaison : ${opt(i, "raison")}` : ""}`, COL.ko); } catch (e) { return eph("❌ " + e.message + "\n(permission « Expulser » ? rôle du bot au-dessus du membre ?)"); } }
    case "slowmode": { if (g === "dm") return eph("Seulement sur un serveur."); const s = Math.min(21600, Math.max(0, Math.floor(opt(i, "secondes")))); try { await bot(`/channels/${i.channel_id}`, "PATCH", { rate_limit_per_user: s }); return emb("🐌 Mode lent", s ? `Réglé à **${s}s** entre chaque message.` : "Mode lent désactivé.", COL.ok); } catch (e) { return eph("❌ " + e.message); } }
    case "lock": { if (g === "dm") return eph("Seulement sur un serveur."); try { await bot(`/channels/${i.channel_id}/permissions/${g}`, "PUT", { type: 0, deny: "2048" }); return emb("🔒 Salon fermé", "Les membres ne peuvent plus écrire ici.", COL.ko); } catch (e) { return eph("❌ " + e.message); } }
    case "unlock": { if (g === "dm") return eph("Seulement sur un serveur."); try { await bot(`/channels/${i.channel_id}/permissions/${g}`, "PUT", { type: 0, deny: "0" }); return emb("🔓 Salon rouvert", "Tout le monde peut réécrire ✅", COL.ok); } catch (e) { return eph("❌ " + e.message); } }
    case "addrole": case "removerole": { if (g === "dm") return eph("Seulement sur un serveur."); const rid = opt(i, "role"), add = cmd === "addrole";
      try { await bot(`/guilds/${g}/members/${target}/roles/${rid}`, add ? "PUT" : "DELETE"); return emb(add ? "✅ Rôle ajouté" : "➖ Rôle retiré", `<@&${rid}> ${add ? "donné à" : "retiré de"} **${tName}**`, add ? COL.ok : COL.ko); } catch (e) { return eph("❌ " + e.message + "\n(permission « Gérer les rôles » ? rôle du bot au-dessus du rôle donné ?)"); } }
    case "membres": { if (g === "dm") return eph("Seulement sur un serveur."); let gd = {}; try { gd = await bot(`/guilds/${g}?with_counts=true`); } catch {}
      return emb("👥 Membres", `Total : **${nf(gd.approximate_member_count || 0)}**\nEn ligne : **${nf(gd.approximate_presence_count || 0)}**`, COL.info); }
    case "roles": { if (g === "dm") return eph("Seulement sur un serveur."); let rs = []; try { rs = await bot(`/guilds/${g}/roles`); } catch {}
      const list = rs.filter(r => r.name !== "@everyone").sort((a, b) => b.position - a.position).slice(0, 40).map(r => `<@&${r.id}>`).join(" ") || "aucun";
      return { type: 4, data: { embeds: [{ title: `🎭 Rôles (${rs.length - 1})`, description: list, color: COL.info }], allowed_mentions: { parse: [] } } }; }
    case "boosts": { if (g === "dm") return eph("Seulement sur un serveur."); let gd = {}; try { gd = await bot(`/guilds/${g}?with_counts=true`); } catch {}
      return emb("🚀 Boosts", `**${gd.premium_subscription_count || 0}** boost(s)\nNiveau du serveur : **${gd.premium_tier || 0}**`, 0xf47fff); }
    case "annonce": { const tx = String(opt(i, "texte")).slice(0, 1500), ping = opt(i, "ping");
      return { type: 4, data: { content: ping ? "@everyone" : undefined, embeds: [{ author: { name: "📣 Annonce" }, description: tx, color: COL.gold, footer: { text: "par " + name } }], allowed_mentions: { parse: ping ? ["everyone"] : [] } } }; }
    case "countdown": { const d = opt(i, "jours") || 0, h = opt(i, "heures") || 0, m = opt(i, "minutes") || 0, ts = Math.floor((now + ((d * 24 + h) * 60 + m) * 60000) / 1000);
      return emb("⏳ " + String(opt(i, "event")).slice(0, 100), `📅 <t:${ts}:F>\n⏰ **<t:${ts}:R>**`, COL.info); }
    case "rolereaction": { const r = opt(i, "role"), label = String(opt(i, "nom") || "🎭 Prendre le rôle").slice(0, 40), txt = String(opt(i, "message") || "Clique sur le bouton pour prendre (ou enlever) le rôle :").slice(0, 500);
      return { type: 4, data: { embeds: [{ title: "🎭 Rôle", description: txt, color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 1, label, custom_id: `role:${r}` }] }], allowed_mentions: { parse: [] } } }; }
    case "reglement": { const txt = String(opt(i, "texte")).slice(0, 3500), r = opt(i, "role");
      return { type: 4, data: { embeds: [{ title: "📜 Règlement", description: txt, color: COL.gold, footer: { text: "Clique sur J'accepte pour valider" } }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "✅ J'accepte", custom_id: `accept:${r || "0"}` }] }] } }; }
    case "ticket": return { type: 4, data: { embeds: [{ title: "🎫 Support", description: "Besoin d'aide ? Clique sur le bouton pour ouvrir un salon privé avec le staff.", color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "🎫 Ouvrir un ticket", custom_id: "ticket:open" }] }] } };
    case "creerroles": { if (g === "dm") return eph("Seulement sur un serveur."); const noms = String(opt(i, "noms")).split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 10);
      if (!noms.length) return eph("Donne au moins un nom (ex: Admin;Modo;Membre)."); let ok2 = 0, errs = 0;
      for (let k2 = 0; k2 < noms.length; k2++) { try { await bot(`/guilds/${g}/roles`, "POST", { name: noms[k2].slice(0, 90), color: RCOL[k2 % RCOL.length], hoist: true }); ok2++; } catch { errs++; } }
      return emb("🎭 Rôles créés", `✅ ${ok2} rôle(s) créé(s) : ${noms.join(", ")}${errs ? `\n⚠️ ${errs} échec(s) (permission « Gérer les rôles » ? rôle du bot assez haut ?)` : ""}`, COL.ok); }
    case "creersalons": { if (g === "dm") return eph("Seulement sur un serveur."); const voice = opt(i, "type") === "voice", noms = String(opt(i, "noms")).split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 15);
      if (!noms.length) return eph("Donne au moins un nom de salon."); const cl = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "salon"; let ok2 = 0, errs = 0;
      for (const nm of noms) { try { await bot(`/guilds/${g}/channels`, "POST", { name: voice ? nm.slice(0, 90) : cl(nm), type: voice ? 2 : 0 }); ok2++; } catch { errs++; } }
      return emb(voice ? "🔊 Salons vocaux créés" : "📁 Salons créés", `✅ ${ok2} salon(s) créé(s)${errs ? `\n⚠️ ${errs} échec(s) (permission « Gérer les salons » ?)` : ""}`, COL.ok); }
    case "nettoyer": { if (g === "dm") return eph("Seulement sur un serveur."); const quoi = opt(i, "quoi");
      let nc = 0, nr = 0; try { if (quoi !== "roles") nc = (await bot(`/guilds/${g}/channels`) || []).length; if (quoi !== "salons") nr = (await bot(`/guilds/${g}/roles`) || []).filter(x => x.name !== "@everyone" && !x.managed).length; } catch (e) { return eph("❌ " + e.message); }
      const parts = []; if (quoi !== "roles") parts.push(`**${nc}** salon(s)`); if (quoi !== "salons") parts.push(`**${nr}** rôle(s)`);
      if (!nc && !nr) return eph("Rien à supprimer.");
      return { type: 4, data: { flags: 64, embeds: [{ title: "⚠️ Confirmation", description: `Tu es sur le point de supprimer ${parts.join(" et ")}.\n\n**C'est IRRÉVERSIBLE.** Tu es sûr ?`, color: COL.ko }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🗑️ Oui, tout supprimer", custom_id: `wipe:${quoi}:${uid}` }, { type: 2, style: 2, label: "Annuler", custom_id: "wipe:no" }] }] } }; }
    case "accueil": { const r = opt(i, "role") || "0";
      return { type: 4, data: { embeds: [{ title: "👋 Bienvenue sur le serveur !", description: "Avant d'entrer, réponds à quelques petites questions 👇\nC'est rapide et promis, y'a pas de mauvaise réponse 😄", color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "▶️ Commencer", custom_id: `q:0:${r}` }] }] } }; }
  }
  return eph("Commande inconnue");
}
function qStep(step, role) {
  if (step >= QUESTIONS.length) return null;
  const Q = QUESTIONS[step];
  return { embeds: [{ title: `❓ Question ${step + 1}/${QUESTIONS.length}`, description: `**${Q.q}**`, color: COL.info }], flags: 64, components: [{ type: 1, components: Q.opts.map((o, j) => ({ type: 2, style: 1, label: o.slice(0, 80), custom_id: `q:${step + 1}:${role}` })) }] };
}
const encTroll = m => { let t = String(m || "non je t'ai troll mdr 😂").slice(0, 150); while (Buffer.byteLength(t) > 44) t = [...t].slice(0, -1).join(""); return Buffer.from(t).toString("base64url"); };
const mpBoard = b => { const r = []; for (let row = 0; row < 3; row++) r.push({ type: 1, components: [0, 1, 2].map(c => { const k = row * 3 + c, v = b[k]; return { type: 2, style: v === "X" ? 4 : v === "O" ? 1 : 2, label: v === "X" ? "❌" : v === "O" ? "⭕" : "​", custom_id: `mp:${k}`, disabled: v !== String(k + 1) }; }) }); return r; };
const mpWin = b => { const L = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]; for (const [a,c,d] of L) if (b[a] !== String(a+1) && b[a] === b[c] && b[c] === b[d]) return b[a]; return b.split("").every(x => x === "X" || x === "O") ? "=" : null; };

const mentionIds = s => [...String(s || "").matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
async function button(i) {
  const [kind, k, j, owner] = String(i.data.custom_id).split(":"), uid = (i.member?.user || i.user).id, g = i.guild_id || "dm", mid = i.message?.id;
  const who = i.member?.nick || (i.member?.user || i.user)?.global_name || (i.member?.user || i.user)?.username;
  if (kind === "dev") { if (uid !== k) return eph("Ce jeu n'est pas le tien : lance `/devine` 😉");
    return { type: 9, data: { custom_id: "devg:" + uid, title: "Devine le nombre (1-100)", components: [{ type: 1, components: [{ type: 4, custom_id: "n", label: "Ton nombre", style: 1, min_length: 1, max_length: 3, required: true }] }] } }; }
  if (kind === "mp") { const ids = mentionIds(i.message?.content), x = ids[0], o = ids[1]; if (!x || !o) return eph("Partie expirée.");
    let st; try { const [v] = await kv([["GET", `llmms:dc:mp:${mid}`]]); st = JSON.parse(v || "null"); } catch {}
    const board = st?.board || "123456789", turn = st?.turn || x;
    if (uid !== x && uid !== o) return eph("Tu n'es pas dans cette partie 😅");
    if (uid !== turn) return eph("Ce n'est pas ton tour ⏳");
    const cell = +k; if (board[cell] === "X" || board[cell] === "O") return eph("Case déjà prise !");
    const mark = uid === x ? "X" : "O", nb = board.slice(0, cell) + mark + board.slice(cell + 1), w = mpWin(nb), next = uid === x ? o : x;
    await kv([["SET", `llmms:dc:mp:${mid}`, JSON.stringify({ board: nb, turn: next }), "EX", 3600]]);
    const content = w === "X" || w === "O" ? `🏆 <@${w === "X" ? x : o}> a gagné le morpion !` : w === "=" ? "🤝 Match nul !" : `⭕ **Morpion** : <@${x}> (❌) · <@${o}> (⭕)\n➡️ À <@${next}> de jouer.`;
    const comps = mpBoard(nb).map(row => ({ ...row, components: row.components.map(b => ({ ...b, disabled: w ? true : b.disabled })) }));
    return { type: 7, data: { content, components: comps, allowed_mentions: { parse: [] } } }; }
  if (kind === "duel") { const ids = mentionIds(i.message?.content), a = ids[0], b = ids[1], mise = +j || 0; if (!a || !b) return eph("Duel expiré.");
    if (uid !== a && uid !== b) return eph("Tu n'es pas dans ce duel 😅");
    let st = {}; try { const [v] = await kv([["GET", `llmms:dc:duel:${mid}`]]); st = JSON.parse(v || "{}"); } catch {}
    if (st[uid]) return eph("Tu as déjà choisi 😏 attends l'autre !");
    st[uid] = k; await kv([["SET", `llmms:dc:duel:${mid}`, JSON.stringify(st), "EX", 600]]);
    if (!st[a] || !st[b]) return eph(`✅ Choix enregistré (${k === "pierre" ? "🪨" : k === "feuille" ? "📄" : "✂️"}) ! On attend l'autre joueur…`);
    const beats = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" }, E = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" };
    let win = st[a] === st[b] ? null : beats[st[a]] === st[b] ? a : b;
    let extra = "";
    if (mise && win) { const wu = await getU(g, win), lu = await getU(g, win === a ? b : a); wu.c += mise; lu.c = Math.max(0, lu.c - mise); await putU(g, win, wu); await putU(g, win === a ? b : a, lu); extra = `\n💰 <@${win}> remporte **${nf(mise)}** ${PIECE} !`; }
    const res2 = win ? `🏆 <@${win}> gagne !` : "🤝 Égalité !";
    return { type: 7, data: { content: `⚔️ **Duel terminé**\n<@${a}> : ${E[st[a]]}  vs  ${E[st[b]]} : <@${b}>\n${res2}${extra}`, components: [], allowed_mentions: { parse: [] } } }; }
  if (kind === "trl") { let troll = "non je t'ai troll mdr 😂"; try { troll = Buffer.from(owner || "", "base64url").toString("utf8") || troll; } catch {}
    if (uid === k) return eph("C'est toi qui l'as envoyé 😏 attends ta victime !");
    const what = j === "hack" ? "au faux piratage" : "au faux ban";
    return { type: 7, data: { content: "", embeds: [{ title: "🤡 " + troll, description: `<@${uid}> a cru ${what} 😂😂\nPiégé par <@${k}> !`, color: 0xef4444, footer: { text: "le bot de LLMMS" } }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🤡 Piégé", custom_id: "trl_done", disabled: true }] }], allowed_mentions: { parse: [] } } }; }
  if (kind === "yn") { const idx = +k; let votes = {}; try { const [v] = await kv([["GET", `llmms:dc:yn:${mid}`]]); votes = JSON.parse(v || "{}"); } catch {}
    votes[uid] = idx; await kv([["SET", `llmms:dc:yn:${mid}`, JSON.stringify(votes), "EX", 2592000]]);
    const emb0 = i.message.embeds[0], vals = Object.values(votes), oui = vals.filter(x => x === 0).length, non = vals.filter(x => x === 1).length, total = oui + non;
    const line = (lbl, n) => { const bar = Math.round((total ? n / total : 0) * 10); return `${lbl}\n\`${"█".repeat(bar)}${"░".repeat(10 - bar)}\` ${n} (${Math.round((total ? n / total : 0) * 100)}%)`; };
    return { type: 7, data: { embeds: [{ ...emb0, description: `${line("👍 **Oui**", oui)}\n\n${line("👎 **Non**", non)}`, footer: { text: `${total} vote${total > 1 ? "s" : ""}` } }] } }; }
  if (kind === "wipe") {
    if (k === "no") return { type: 7, data: { embeds: [{ title: "❌ Annulé", description: "Rien n'a été supprimé.", color: COL.info }], components: [], flags: 64 } };
    if (j && j !== uid) return eph("Seul celui qui a lancé la commande peut confirmer 😉");
    const quoi = k, fin = async () => { let dc = 0, dr = 0, errs = 0;
      try { if (quoi !== "roles") { const ch = await bot(`/guilds/${g}/channels`); for (const c of (ch || [])) { try { await bot(`/channels/${c.id}`, "DELETE"); dc++; } catch { errs++; } } }
        if (quoi !== "salons") { const rs = await bot(`/guilds/${g}/roles`); for (const r of (rs || []).filter(x => x.name !== "@everyone" && !x.managed)) { try { await bot(`/guilds/${g}/roles/${r.id}`, "DELETE"); dr++; } catch { errs++; } } } } catch {}
      const parts = []; if (quoi !== "roles") parts.push(`${dc} salon(s)`); if (quoi !== "salons") parts.push(`${dr} rôle(s)`);
      await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ title: "🗑️ Nettoyage terminé", description: `${parts.join(" et ")} supprimé(s)${errs ? `\n⚠️ ${errs} non supprimé(s) (permission manquante ou rôle au-dessus du bot)` : ""}`, color: COL.ok }], components: [] }) }).catch(() => {}); };
    const p = fin(); if (bg(p)) return { type: 7, data: { embeds: [{ title: "🗑️ Suppression en cours…", color: COL.ko }], components: [], flags: 64 } };
    await p; return { type: 7, data: { embeds: [{ title: "🗑️ Suppression en cours…", color: COL.ko }], components: [], flags: 64 } };
  }
  if (kind === "mod") {
    if (k === "no") return { type: 7, data: { embeds: [{ title: "❌ Annulé", description: "Aucun changement n'a été fait.", color: COL.ko }], components: [] } };
    let plan; try { const [v] = await kv([["GET", `llmms:dc:modplan:${g}:${uid}`]]); plan = JSON.parse(v || "null"); } catch {}
    if (!plan) return eph("Plan expiré ou ce n'est pas le tien. Relance `/modifier`.");
    if (plan.by && plan.by !== uid) return eph("Seul celui qui a lancé la commande peut confirmer 😉");
    await kv([["DEL", `llmms:dc:modplan:${g}:${uid}`]]);
    const hex = c => { const n = parseInt(String(c || "").replace("#", ""), 16); return Number.isFinite(n) ? n & 0xffffff : 0; };
    const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").trim();
    const clean2 = s => String(s || "salon").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "salon";
    const fin = async () => {
      let done = 0, errs = 0, chs = [], rls = [];
      try { chs = await bot(`/guilds/${g}/channels`) || []; rls = await bot(`/guilds/${g}/roles`) || []; } catch {}
      const catId = {}; chs.filter(c => c.type === 4).forEach(c => catId[norm(c.name)] = c.id);
      const findCh = n => chs.find(c => (c.type === 0 || c.type === 2) && norm(c.name) === norm(n)) || chs.find(c => (c.type === 0 || c.type === 2) && norm(c.name).includes(norm(n)));
      const findCat = n => chs.find(c => c.type === 4 && norm(c.name) === norm(n));
      const findRole = n => rls.find(r => r.name !== "@everyone" && !r.managed && norm(r.name) === norm(n)) || rls.find(r => r.name !== "@everyone" && !r.managed && norm(r.name).includes(norm(n)));
      for (const o of plan.ops) { try {
        if (o.do === "create_category") { const c = await bot(`/guilds/${g}/channels`, "POST", { name: String(o.name || "catégorie").slice(0, 90), type: 4 }); if (c) catId[norm(o.name)] = c.id; done++; }
        else if (o.do === "create_channel") { const parent = o.category ? (catId[norm(o.category)] || null) : null; await bot(`/guilds/${g}/channels`, "POST", { name: o.type === "voice" ? String(o.name || "salon").slice(0, 90) : clean2(o.name), type: o.type === "voice" ? 2 : 0, parent_id: parent }); done++; }
        else if (o.do === "create_role") { await bot(`/guilds/${g}/roles`, "POST", { name: String(o.name || "rôle").slice(0, 90), color: hex(o.color), hoist: true }); done++; }
        else if (o.do === "rename_channel") { const c = findCh(o.from); if (c) { await bot(`/channels/${c.id}`, "PATCH", { name: c.type === 2 ? String(o.to).slice(0, 90) : clean2(o.to) }); done++; } else errs++; }
        else if (o.do === "rename_category") { const c = findCat(o.from); if (c) { await bot(`/channels/${c.id}`, "PATCH", { name: String(o.to).slice(0, 90) }); done++; } else errs++; }
        else if (o.do === "rename_role") { const r = findRole(o.from); if (r) { await bot(`/guilds/${g}/roles/${r.id}`, "PATCH", { name: String(o.to).slice(0, 90) }); done++; } else errs++; }
        else if (o.do === "delete_channel") { const c = findCh(o.name); if (c) { await bot(`/channels/${c.id}`, "DELETE"); done++; } else errs++; }
        else if (o.do === "delete_role") { const r = findRole(o.name); if (r) { await bot(`/guilds/${g}/roles/${r.id}`, "DELETE"); done++; } else errs++; }
        else errs++;
      } catch { errs++; } }
      await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ title: "✅ Serveur modifié", description: `${done} modification(s) appliquée(s)${errs ? `\n⚠️ ${errs} non faite(s) (introuvable, permission manquante, ou rôle au-dessus du bot)` : ""}`, color: COL.ok }], components: [] }) }).catch(() => {});
    };
    const p = fin(); if (bg(p)) return { type: 7, data: { embeds: [{ title: "🔧 Modifications en cours…", description: "Je touche à ton serveur, patiente quelques secondes ⏳", color: COL.info }], components: [] } };
    await p; return { type: 7, data: { embeds: [{ title: "🔧 Modifications en cours…", color: COL.info }], components: [] } };
  }
  if (kind === "build") {
    if (k === "no") return { type: 7, data: { embeds: [{ title: "❌ Annulé", description: "Aucun changement n'a été fait.", color: COL.ko }], components: [] } };
    let plan; try { const [v] = await kv([["GET", `llmms:dc:plan:${g}:${uid}`]]); plan = JSON.parse(v || "null"); } catch {}
    if (!plan) return eph("Plan expiré ou ce n'est pas le tien. Relance `/construire`.");
    if (plan.by && plan.by !== uid) return eph("Seul celui qui a lancé la commande peut confirmer 😉");
    await kv([["DEL", `llmms:dc:plan:${g}:${uid}`]]);
    const hex = c => { const n = parseInt(String(c || "").replace("#", ""), 16); return Number.isFinite(n) ? n & 0xffffff : 0; };
    const clean2 = s => String(s || "salon").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "salon";
    let roles = 0, chans = 0, errs = 0;
    const fin = async () => {
      for (const r of (plan.roles || []).slice(0, 6)) { try { await bot(`/guilds/${g}/roles`, "POST", { name: String(r.name || "role").slice(0, 90), color: hex(r.color), hoist: true }); roles++; } catch { errs++; } }
      for (const cat of (plan.categories || []).slice(0, 6)) { let parent = null;
        try { const c = await bot(`/guilds/${g}/channels`, "POST", { name: String(cat.name || "catégorie").slice(0, 90), type: 4 }); parent = c.id; } catch { errs++; }
        for (const ch of (cat.channels || []).slice(0, 5)) { try { await bot(`/guilds/${g}/channels`, "POST", { name: clean2(ch.name), type: ch.type === "voice" ? 2 : 0, parent_id: parent }); chans++; } catch { errs++; } }
      }
      await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ title: "✅ Serveur construit !", description: `🎭 ${roles} rôle(s) créé(s)\n📁 ${chans} salon(s) créé(s)${errs ? `\n⚠️ ${errs} erreur(s) (permissions ?)` : ""}`, color: COL.ok }], components: [] }) });
    };
    const p = fin(); if (bg(p)) return { type: 7, data: { embeds: [{ title: "🏗️ Construction en cours…", description: "Je crée les rôles et les salons, patiente quelques secondes ⏳", color: COL.info }], components: [] } };
    await p; return { type: 7, data: { embeds: [{ title: "🏗️ Construction en cours…", color: COL.info }], components: [] } };
  }
  if (kind === "q") { const step = +k, role = j;
    if (step === 0) return { type: 4, data: qStep(0, role) };
    if (step < QUESTIONS.length) return { type: 7, data: qStep(step, role) };
    let note = ""; if (role && role !== "0") { try { await bot(`/guilds/${g}/members/${uid}/roles/${role}`, "PUT"); note = `\n\n🎟️ Tu as reçu le rôle <@&${role}>, tu as accès au serveur !`; } catch (e) { note = "\n\n⚠️ (le bot n'a pas pu te donner le rôle : " + e.message + ")"; } }
    return { type: 7, data: { embeds: [{ title: "🎉 Merci et bienvenue !", description: `Tu as répondu à toutes les questions 👏${note}\nAmuse-toi bien sur le serveur 💜`, color: COL.ok }], flags: 64, components: [] } }; }
  if (kind === "role") { const rid = k, has = (i.member?.roles || []).includes(rid);
    try { await bot(`/guilds/${g}/members/${uid}/roles/${rid}`, has ? "DELETE" : "PUT"); return eph(has ? `➖ Rôle <@&${rid}> retiré.` : `✅ Rôle <@&${rid}> ajouté !`); } catch (e) { return eph("❌ " + e.message + "\n(le bot peut-il gérer ce rôle ?)"); } }
  if (kind === "accept") { if (k && k !== "0") { try { await bot(`/guilds/${g}/members/${uid}/roles/${k}`, "PUT"); } catch (e) { return eph("❌ " + e.message); } } return eph("✅ Merci d'avoir accepté le règlement ! Bienvenue 🎉"); }
  if (kind === "ticket") { try { const name2 = ("ticket-" + who).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90) || "ticket";
      const ch = await bot(`/guilds/${g}/channels`, "POST", { name: name2, type: 0, permission_overwrites: [{ id: g, type: 0, deny: "1024" }, { id: uid, type: 1, allow: "3072" }] });
      return eph(`🎫 Ton ticket est ouvert : <#${ch.id}>`); } catch (e) { return eph("❌ " + e.message + "\n(le bot a-t-il la permission « Gérer les salons » ?)"); } }
  if (kind === "clash") { await kv([["SET", `llmms:dc:clash:${g}`, String(Date.now())]]);
    return { type: 7, data: { embeds: [{ title: "📆 Compteur sans clash", description: "💥 **Compteur remis à zéro !** Allez, on repart à **0** jour 😅", color: COL.ko }], components: [] } }; }
  if (kind === "poll") { const idx = +k; let votes = {}; try { const [v] = await kv([["GET", `llmms:dc:poll:${mid}`]]); votes = JSON.parse(v || "{}"); } catch {}
    votes[uid] = idx; await kv([["SET", `llmms:dc:poll:${mid}`, JSON.stringify(votes), "EX", 2592000]]);
    const emb0 = i.message.embeds[0], E = ["🇦", "🇧", "🇨", "🇩", "🇪"], choix = emb0.description.split("\n\n").map(blk => (blk.split("\n")[0].match(/\*\*(.+)\*\*/) || [, "?"])[1]);
    const counts = choix.map((_, j2) => Object.values(votes).filter(x => x === j2).length), total = counts.reduce((a, b) => a + b, 0);
    const desc = choix.map((c, j2) => { const pct = total ? counts[j2] / total : 0, bar = Math.round(pct * 10); return `${E[j2]} **${c}**\n\`${"█".repeat(bar)}${"░".repeat(10 - bar)}\` ${counts[j2]} (${Math.round(pct * 100)}%)`; }).join("\n\n");
    return { type: 7, data: { embeds: [{ ...emb0, description: desc, footer: { text: `${total} vote${total > 1 ? "s" : ""} • clique pour voter` } }] } }; }
  if (kind === "gw") { if (k === "join") { let p = []; try { const [v] = await kv([["GET", `llmms:dc:gw:${mid}`]]); p = JSON.parse(v || "[]"); } catch {}
      if (p.includes(uid)) return eph("Tu participes déjà 🎉");
      p.push(uid); await kv([["SET", `llmms:dc:gw:${mid}`, JSON.stringify(p), "EX", 2592000]]);
      const emb0 = i.message.embeds[0], d = emb0.description.replace(/👥 \*\*\d+\*\*/, `👥 **${p.length}**`);
      return { type: 7, data: { embeds: [{ ...emb0, description: d }] } }; }
    if (k === "draw") { if (uid !== j) return eph("Seul l'organisateur peut tirer au sort 😉");
      let p = []; try { const [v] = await kv([["GET", `llmms:dc:gw:${mid}`]]); p = JSON.parse(v || "[]"); } catch {}
      if (!p.length) return eph("Personne n'a participé 😢");
      const winner = p[Math.floor(Math.random() * p.length)], emb0 = i.message.embeds[0];
      return { type: 7, data: { content: `🎊 Félicitations <@${winner}> !`, embeds: [{ ...emb0, description: emb0.description.replace(/\n\nClique[\s\S]*/, `\n\n🎊 **Gagnant : <@${winner}>** parmi ${p.length} participant(s) !`), color: 0x22c55e }], components: [], allowed_mentions: { users: [winner] } } }; }
    return eph("?"); }
  if (kind === "nitro") { let troll = "non je t'ai troll mdr 😂"; try { troll = Buffer.from(j || "", "base64url").toString("utf8") || troll; } catch {}
    if (uid === k) return eph("C'est toi qui l'as envoyé 😏 attends que ta victime clique !");
    return { type: 7, data: { content: "", embeds: [{ title: "🤡 " + troll, description: `<@${uid}> a cru au Nitro gratuit 😂😂
Piégé par <@${k}> !`, color: 0xef4444, footer: { text: "/fakenitro · le bot de LLMMS" } }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🤡 Piégé", custom_id: "nitro_done", disabled: true }] }] } }; }
  if (kind === "tiktok") { let troll = "non je t'ai troll mdr 😂"; try { troll = Buffer.from(j || "", "base64url").toString("utf8") || troll; } catch {}
    if (uid === k) return eph("C'est toi qui l'as envoyé 😏 attends que ta victime clique !");
    return { type: 7, data: { content: "", embeds: [{ title: "🤡 " + troll, description: `<@${uid}> a cru au cadeau TikTok 😂😂\nPiégé par <@${k}> !`, color: 0xef4444, footer: { text: "/faketiktok · le bot de LLMMS" } }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🤡 Piégé", custom_id: "tiktok_done", disabled: true }] }] } }; }
  if (kind === "boost") { let troll = "non je t'ai troll mdr 😂"; try { troll = Buffer.from(j || "", "base64url").toString("utf8") || troll; } catch {}
    if (uid === k) return eph("C'est toi qui l'as envoyé 😏 attends que ta victime clique !");
    return { type: 7, data: { content: "", embeds: [{ title: "🤡 " + troll, description: `<@${uid}> a cru aux boosts gratuits 😂😂\nPiégé par <@${k}> !`, color: 0xef4444, footer: { text: "/fakeboost · le bot de LLMMS" } }], components: [{ type: 1, components: [{ type: 2, style: 4, label: "🤡 Piégé", custom_id: "boost_done", disabled: true }] }] } }; }
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
    if (i.type === 5 && String(i.data.custom_id).startsWith("devg:")) {
      const guess = parseInt(String(i.data.components?.[0]?.components?.[0]?.value || "").replace(/\D/g, "")) || 0, g2 = i.guild_id || "dm";
      let st; try { const [v] = await kv([["GET", `llmms:dc:dev:${g2}:${uid}`]]); st = JSON.parse(v || "null"); } catch {}
      if (!st) return res.json(eph("Partie expirée, relance `/devine`."));
      st.t = (st.t || 0) + 1;
      if (guess === st.n) { await kv([["DEL", `llmms:dc:dev:${g2}:${uid}`]]); const u = await getU(g2, uid); u.c += 300; await putU(g2, uid, u);
        return res.json({ type: 4, data: { embeds: [{ title: "🎉 Gagné !", description: `C'était bien **${st.n}** ! Trouvé en **${st.t}** essai(s).\n+300 ${PIECE} (solde : ${nf(u.c)})`, color: COL.ok }] } }); }
      await kv([["SET", `llmms:dc:dev:${g2}:${uid}`, JSON.stringify(st), "EX", 600]]);
      return res.json({ type: 4, data: { embeds: [{ title: "🔢 Devine le nombre", description: `**${guess}** → c'est ${guess < st.n ? "plus grand ⬆️" : "plus petit ⬇️"}\nEssai n°${st.t}`, color: COL.gold }], components: [{ type: 1, components: [{ type: 2, style: 1, label: "✍️ Réessayer", custom_id: `dev:${uid}` }] }] } }); }
    if (i.type === 2 && i.data.name === "construire") {
      const g2 = i.guild_id, uid2 = (i.member?.user || i.user)?.id, desc = String(opt(i, "description") || "").slice(0, 300);
      if (!g2) return res.json(eph("Cette commande marche seulement dans un serveur."));
      const build = async () => { let plan;
        try { const t = await gemini(`Construis la structure d'un serveur Discord à partir de cette demande de l'utilisateur :
«${desc}»

Réponds UNIQUEMENT en JSON, sans texte autour : {"roles":[{"name":"...","color":"#xxxxxx"}],"categories":[{"name":"...","channels":[{"name":"...","type":"text"}]}]}.

RÈGLE N°1 — OBÉIS À LA LETTRE : si l'utilisateur donne une liste de catégories, de salons ou de rôles, tu les RECOPIES EXACTEMENT, avec les MÊMES noms, dans le MÊME ordre. Tu n'inventes RIEN, tu ne fusionnes RIEN, tu ne renommes RIEN, tu n'en enlèves AUCUN. Garde les noms de catégories tels quels (ex: INFOS, COMMUNAUTÉ, JEUX, BOT, VOCAUX).
- Les rôles : recopie exactement ceux listés, dans l'ordre donné (du plus haut au plus bas), chacun une couleur hex différente.
- Pour les salons : "type":"voice" pour les salons vocaux demandés, sinon "text". Noms de salons en minuscules avec des tirets, sans emoji (ex: "jeux-roblox", "rocket-league").
- Si (et seulement si) l'utilisateur reste vague, alors complète toi-même intelligemment selon le thème.
- Jusqu'à 25 salons au total. JSON COMPLET et bien fermé.`, null, "Tu recopies fidèlement la structure demandée. Tu renvoies uniquement du JSON valide, complet et bien fermé.", 2200, "gemini-2.0-flash,gemini-flash-latest,gemini-flash-lite-latest", 0.15);
          let raw = (t.match(/\{[\s\S]*\}/) || [t])[0].replace(/,(\s*[}\]])/g, "$1");
          try { plan = JSON.parse(raw); } catch { plan = JSON.parse(repairJSON(raw)); }
        } catch (e) { return { embeds: [{ title: "😵 Erreur", description: "L'IA n'a pas réussi à faire le plan : " + e.message, color: COL.ko }] }; }
        plan.roles = (plan.roles || []).slice(0, 8); plan.categories = (plan.categories || []).slice(0, 8);
        let nch = 0; plan.categories.forEach(c => { c.channels = (c.channels || []).slice(0, 8).filter(() => nch++ < 25); });
        plan.by = uid2;
        await kv([["SET", `llmms:dc:plan:${g2}:${uid2}`, JSON.stringify(plan), "EX", 900]]);
        const preview = plan.categories.map(c => `**📁 ${c.name}**\n` + (c.channels || []).map(ch => `  ${ch.type === "voice" ? "🔊" : "#"} ${ch.name}`).join("\n")).join("\n\n");
        return { embeds: [{ title: "🏗️ Aperçu du serveur", description: `🎭 **Rôles :** ${plan.roles.map(r => r.name).join(", ") || "aucun"}\n\n${preview}`.slice(0, 3800), color: COL.info, footer: { text: "Confirme pour tout créer sur le serveur" } }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "✅ Construire", custom_id: "build:go" }, { type: 2, style: 4, label: "❌ Annuler", custom_id: "build:no" }] }] };
      };
      return await late(build(), 5);
    }
    if (i.type === 2 && i.data.name === "modifier") {
      const g2 = i.guild_id, uid2 = (i.member?.user || i.user)?.id, desc = String(opt(i, "changement") || "").slice(0, 300);
      if (!g2) return res.json(eph("Cette commande marche seulement dans un serveur."));
      const build = async () => {
        let chs = [], rls = [];
        try { chs = await bot(`/guilds/${g2}/channels`) || []; rls = await bot(`/guilds/${g2}/roles`) || []; } catch (e) { return { embeds: [{ title: "😵 Erreur", description: "Je n'arrive pas à lire le serveur : " + e.message, color: COL.ko }] }; }
        const cats = chs.filter(c => c.type === 4).map(c => c.name), txt = chs.filter(c => c.type === 0).map(c => c.name), voc = chs.filter(c => c.type === 2).map(c => c.name), rns = rls.filter(r => r.name !== "@everyone" && !r.managed).map(r => r.name);
        let plan;
        try { const t = await gemini(`Voici l'état ACTUEL d'un serveur Discord :
Catégories : ${cats.join(", ") || "(aucune)"}
Salons texte : ${txt.join(", ") || "(aucun)"}
Salons vocaux : ${voc.join(", ") || "(aucun)"}
Rôles : ${rns.join(", ") || "(aucun)"}

L'utilisateur veut ce changement : «${desc}»

Réponds UNIQUEMENT en JSON, sans texte autour : {"ops":[ ... ]}. Chaque op a un champ "do" :
- {"do":"create_category","name":"NOM"}
- {"do":"create_channel","name":"nom","type":"text|voice","category":"catégorie existante ou créée (optionnel)"}
- {"do":"create_role","name":"Nom","color":"#xxxxxx"}
- {"do":"rename_channel","from":"nom actuel exact","to":"nouveau nom"}
- {"do":"rename_category","from":"nom actuel","to":"nouveau nom"}
- {"do":"rename_role","from":"nom actuel","to":"nouveau nom"}
- {"do":"delete_channel","name":"nom actuel exact"}
- {"do":"delete_role","name":"nom actuel exact"}

RÈGLES : fais SEULEMENT ce que l'utilisateur demande, rien d'autre. Pour renommer/supprimer, utilise EXACTEMENT un nom présent dans les listes ci-dessus. Salons texte en minuscules avec des tirets, sans emoji. Maximum 20 opérations. JSON complet et bien fermé.`, null, "Tu renvoies uniquement du JSON valide, complet et bien fermé. Tu ne fais que ce qui est demandé.", 2000, "gemini-2.0-flash,gemini-flash-latest,gemini-flash-lite-latest", 0.15);
          let raw = (t.match(/\{[\s\S]*\}/) || [t])[0].replace(/,(\s*[}\]])/g, "$1");
          try { plan = JSON.parse(raw); } catch { plan = JSON.parse(repairJSON(raw)); }
        } catch (e) { return { embeds: [{ title: "😵 Erreur", description: "L'IA n'a pas réussi : " + e.message, color: COL.ko }] }; }
        plan.ops = (plan.ops || []).slice(0, 20); plan.by = uid2;
        if (!plan.ops.length) return { embeds: [{ title: "🤔 Rien à faire", description: "Je n'ai pas compris le changement. Réessaie plus précisément (ex: « ajoute un vocal musique », « renomme général en discussion », « supprime le salon spam »).", color: COL.gold }] };
        const label = o => o.do === "create_category" ? `📁 Créer la catégorie « ${o.name} »` : o.do === "create_channel" ? `${o.type === "voice" ? "🔊" : "#"} Créer le salon « ${o.name} »${o.category ? " dans " + o.category : ""}` : o.do === "create_role" ? `🎭 Créer le rôle « ${o.name} »` : o.do === "rename_channel" ? `✏️ Salon « ${o.from} » → « ${o.to} »` : o.do === "rename_category" ? `✏️ Catégorie « ${o.from} » → « ${o.to} »` : o.do === "rename_role" ? `✏️ Rôle « ${o.from} » → « ${o.to} »` : o.do === "delete_channel" ? `🗑️ Supprimer le salon « ${o.name} »` : o.do === "delete_role" ? `🗑️ Supprimer le rôle « ${o.name} »` : `• ${o.do}`;
        await kv([["SET", `llmms:dc:modplan:${g2}:${uid2}`, JSON.stringify(plan), "EX", 900]]);
        return { embeds: [{ title: "🔧 Aperçu des modifications", description: plan.ops.map(label).join("\n").slice(0, 3800), color: COL.info, footer: { text: "Confirme pour appliquer sur ton serveur" } }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "✅ Appliquer", custom_id: "mod:go" }, { type: 2, style: 4, label: "❌ Annuler", custom_id: "mod:no" }] }] };
      };
      return await late(build(), 5);
    }
    if (i.type === 2 && i.data.name === "setup") {
      const g2 = i.guild_id, uid2 = (i.member?.user || i.user)?.id;
      if (!g2) return res.json(eph("Cette commande marche seulement dans un serveur."));
      const wB = !!opt(i, "bienvenue"), wR = !!opt(i, "roles"), wT = !!opt(i, "tickets"), wM = !!opt(i, "moderation");
      if (!wB && !wR && !wT && !wM) return res.json(eph("Coche au moins un module : bienvenue, roles, tickets ou moderation 😉"));
      const build = async () => {
        const res2 = []; const errs = [];
        const mkChan = (name, type, parent) => bot(`/guilds/${g2}/channels`, "POST", { name, type, parent_id: parent || undefined });
        try {
          if (wB) { try { const ch = await mkChan("👋-bienvenue", 0); await bot(`/guilds/${g2}`, "PATCH", { system_channel_id: ch.id, system_channel_flags: 0 }); res2.push("👋 Salon <#" + ch.id + "> créé + messages d'arrivée Discord activés (le pseudo s'affiche quand quelqu'un rejoint)"); } catch (e) { errs.push("bienvenue : " + e.message); } }
          if (wM) { try { let rid = null; try { const r = await bot(`/guilds/${g2}/roles`, "POST", { name: "Modérateur", color: 0x5865f2, hoist: true, permissions: "0" }); rid = r.id; } catch {}
            const cat = await mkChan("🛡️ MODÉRATION", 4); await mkChan("logs", 0, cat.id).catch(() => {}); await mkChan("sanctions", 0, cat.id).catch(() => {}); await mkChan("staff", 0, cat.id).catch(() => {});
            res2.push("🛡️ Rôle Modérateur" + (rid ? " créé" : "") + " + catégorie Modération (logs, sanctions, staff)"); } catch (e) { errs.push("moderation : " + e.message); } }
          if (wT) { try { const cat = await mkChan("🎫 SUPPORT", 4); const ch = await mkChan("ouvrir-un-ticket", 0, cat.id);
            await bot(`/channels/${ch.id}/messages`, "POST", { embeds: [{ title: "🎫 Besoin d'aide ?", description: "Clique sur le bouton pour ouvrir un salon privé avec le staff.", color: COL.info }], components: [{ type: 1, components: [{ type: 2, style: 3, label: "🎫 Ouvrir un ticket", custom_id: "ticket:open" }] }] });
            res2.push("🎫 Système de tickets installé dans <#" + ch.id + ">"); } catch (e) { errs.push("tickets : " + e.message); } }
          if (wR) { try { const defs = [["🎮 Gaming", 0x22c55e], ["🎨 Créatif", 0xec4899], ["🎵 Musique", 0xf59e0b], ["📢 Annonces", 0x3b82f6]]; const made = [];
            for (const [n, c] of defs) { try { const r = await bot(`/guilds/${g2}/roles`, "POST", { name: n, color: c, hoist: false }); made.push([n, r.id]); } catch {} }
            const ch = await mkChan("🎭-choisis-tes-roles", 0);
            await bot(`/channels/${ch.id}/messages`, "POST", { embeds: [{ title: "🎭 Choisis tes rôles", description: "Clique sur un bouton pour prendre ou retirer un rôle.", color: COL.gold }], components: [{ type: 1, components: made.map(([n, id]) => ({ type: 2, style: 2, label: n, custom_id: "role:" + id })) }] });
            res2.push("🎭 Salon de rôles créé dans <#" + ch.id + "> (" + made.length + " rôles)"); } catch (e) { errs.push("roles : " + e.message); } }
        } catch (e) { errs.push(e.message); }
        return { embeds: [{ title: "⚙️ Setup terminé", description: (res2.join("\n") || "Rien n'a pu être créé.") + (errs.length ? "\n\n⚠️ Soucis :\n" + errs.join("\n") + "\n\n(le bot a-t-il les permissions Gérer le serveur / salons / rôles, et son rôle est-il assez haut ?)" : ""), color: errs.length ? COL.gold : COL.ok }] };
      };
      return await late(build(), 5);
    }
    if (i.type === 2 && i.data.name === "evenement") {
      const g2 = i.guild_id, nom = String(opt(i, "nom") || "Événement").slice(0, 100), date = String(opt(i, "date") || "").trim(), heure = String(opt(i, "heure") || "20:00").trim(), lieu = String(opt(i, "lieu") || "Sur le serveur").slice(0, 100), det = String(opt(i, "details") || "").slice(0, 900);
      if (!g2) return res.json(eph("Cette commande marche seulement dans un serveur."));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.json(eph("La date doit être au format AAAA-MM-JJ (ex: 2026-12-25)."));
      const hm = /^\d{1,2}:\d{2}$/.test(heure) ? heure.padStart(5, "0") : "20:00";
      const start = new Date(`${date}T${hm}:00+01:00`);
      if (isNaN(start.getTime())) return res.json(eph("Date ou heure invalide."));
      if (start.getTime() < Date.now() + 60000) return res.json(eph("L'événement doit être dans le futur ⏳"));
      const end = new Date(start.getTime() + 2 * 3600 * 1000);
      const build = async () => {
        try { const ev = await bot(`/guilds/${g2}/scheduled-events`, "POST", { name: nom, privacy_level: 2, scheduled_start_time: start.toISOString(), scheduled_end_time: end.toISOString(), entity_type: 3, entity_metadata: { location: lieu }, description: det || undefined });
          return { embeds: [{ title: "📅 Événement créé !", description: `**${nom}**\n🕒 ${date} à ${hm}\n📍 ${lieu}${det ? "\n\n" + det : ""}`, color: COL.ok, footer: { text: "Les membres peuvent cliquer sur « Intéressé » dans l'onglet Événements" } }] };
        } catch (e) { return { embeds: [{ title: "😵 Erreur", description: "Impossible de créer l'événement : " + e.message + "\n(le bot a-t-il la permission « Gérer les événements » ?)", color: COL.ko }] }; }
      };
      return await late(build(), 5);
    }
    if (i.type === 2 && ["pickup", "verite", "action", "complot", "insulte"].includes(i.data.name)) {
      const n3 = i.data.name;
      const build = async () => { let txt, title;
        const P = { pickup: ["💘 Phrase de drague", "Invente une phrase de drague drôle et mignonne en français, une seule phrase, pour rigoler."],
          verite: ["🙊 Vérité", "Donne une question « Vérité » fun et pas méchante (jeu action ou vérité), en français, une phrase."],
          action: ["🎯 Action", "Donne un défi « Action » fun, drôle et safe (jeu action ou vérité, rien de dangereux ni gênant), en français, une phrase."],
          complot: ["🛸 Théorie du complot", "Invente une fausse théorie du complot complètement absurde et drôle (clairement pour rigoler), en français, 2-3 phrases."] };
        try { if (n3 === "insulte") { const t = opt(i, "membre"), tn = t ? (i.data.resolved?.members?.[t]?.nick || i.data.resolved?.users?.[t]?.username) : null; title = "😜 Vanne"; txt = (t ? `<@${t}>\n\n` : "") + await gemini(`Écris une petite vanne drôle et gentille (jamais méchante, aucune insulte vulgaire, aucune discrimination) ${tn ? "sur " + tn : "sur quelqu'un"}, en français, une phrase, pour taquiner entre potes.`); }
          else { title = P[n3][0]; txt = await gemini(P[n3][1]); } }
        catch (e) { title = "😵"; txt = e.message; }
        return { embeds: [{ title, description: txt.slice(0, 2000), color: COL.info, footer: { text: "llmms ia" } }], allowed_mentions: { parse: [] } }; };
      return await late(build(), 5);
    }
    if (i.type === 2 && ["roast", "histoire", "traduire", "resume"].includes(i.data.name)) {
      const n2 = i.data.name;
      const build = async () => { let txt, title;
        try {
          if (n2 === "roast") { const t = opt(i, "membre"), tn = i.data.resolved?.members?.[t]?.nick || i.data.resolved?.users?.[t]?.global_name || i.data.resolved?.users?.[t]?.username || "lui"; title = "🔥 Roast"; txt = `<@${t}>\n\n` + await gemini(`Écris une petite vanne drôle et gentille (pas méchante, pas d'insulte) sur ${tn}, en français, 1 à 2 phrases, pour rigoler entre potes.`); }
          else if (n2 === "histoire") { const th = String(opt(i, "theme") || "").slice(0, 100); title = "📖 Histoire"; txt = await gemini(`Écris une courte histoire fun et originale en français (10 lignes max)${th ? " sur le thème : " + th : ""}.`); }
          else if (n2 === "traduire") { const tx = String(opt(i, "texte") || "").slice(0, 800), lg = opt(i, "langue") || "anglais"; title = "🌍 Traduction (" + lg + ")"; txt = `> ${tx.slice(0, 300)}\n\n` + await gemini(`Traduis ce texte en ${lg}, donne UNIQUEMENT la traduction sans rien d'autre :\n${tx}`); }
          else { const tx = String(opt(i, "texte") || "").slice(0, 2000); title = "📝 Résumé"; txt = await gemini(`Résume ce texte en français, en 2-3 phrases claires :\n${tx}`); }
        } catch (e) { title = "😵"; txt = e.message; }
        return { embeds: [{ title, description: txt.slice(0, 4000), color: COL.info, footer: { text: "llmms ia" } }] }; };
      return await late(build(), 5);
    }
    if (i.type === 2 && i.data.name === "discute") return await late(chat(uid, who, String(opt(i, "message") || "").slice(0, 600)), 5);
    if (i.type === 2 && i.data.name === "idee") { const t = opt(i, "sujet"), prec = String(opt(i, "precision") || "").replace(/:/g, " ").slice(0, 60); return await late(ideas(t, prec).then(x => ideaMsg(t, prec, x)), 5); }
    if (i.type === 3) return res.json(await button(i));
    if (i.type === 2 && i.data.name === "ia") {
      const q = String(opt(i, "question") || "").slice(0, 500), who = i.member?.user?.username || i.user?.username;
      const sys = `Tu es llmms ia, l'assistant du serveur Discord de LLMMS. Réponds en français, court, clair et sympa (max 1500 caractères). Tu ne dis jamais que tu es Gemini ou Google. AMBIANCE : c'est de la vanne entre potes. Si ${who} te charrie ou t'insulte pour rigoler, réponds-lui du tac au tac avec une vanne gentille, taquine et drôle (clapback), sans te vexer. MAIS reste bon enfant : jamais d'insulte vraiment vulgaire ou choquante, jamais de méchanceté sur le physique, la famille, l'origine, la religion, le genre, l'orientation ou un handicap. Si quelqu'un a l'air réellement mal ou triste, tu arrêtes la vanne et tu es gentil.`;
      const fin = async () => { let txt; try { txt = await gemini(q, null, sys); } catch (e) { txt = "😵 " + e.message; } await fetch(`${API}/webhooks/${i.application_id}/${i.token}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ embeds: [{ title: "🤖 llmms ia", description: `> ${q.slice(0, 200)}\n\n${txt}`.slice(0, 4000), color: COL.info, footer: { text: "Demandé par " + who } }] }) }); };
      const p = fin(); if (bg(p)) return res.json({ type: 5 });
      res.json({ type: 5 }); await p; return;
    }
    if (i.type === 2) return res.json(await run(i));
  } catch (e) { return res.json(eph("😵 Erreur : " + String(e.message || e).slice(0, 180))); }
  res.json(eph("Commande inconnue"));
}
