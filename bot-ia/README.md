# 🤖 Bot IA 24/7 — auto-réponse dans #ia

Ce bot répond **tout seul** quand quelqu'un écrit un message dans le salon `#ia`
(pas besoin de taper une `/commande`). Il discute, il vanne, et il clapback si on le
charrie — en restant bon enfant.

⚠️ Ce bot doit tourner **en permanence** (24/7). Il ne peut PAS être hébergé sur Vercel
(serverless). Utilise un hébergeur qui reste allumé : **Railway**, **Replit**, un VPS,
ou un vieux PC / Raspberry Pi.

---

## 1) Préparer le bot (une seule fois)

Dans le **portail développeur Discord** → ton application → **Bot** →
**Privileged Gateway Intents** : active **MESSAGE CONTENT INTENT** ✅
(c'est ce qui lui permet de lire les messages). Enregistre.

> Tu peux utiliser le **même bot / même token** que tes commandes slash : un bot peut
> très bien avoir ses commandes `/` (sur Vercel) **et** tourner en Gateway ici en même temps.

## 2) Variables d'environnement

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DISCORD_BOT_TOKEN` | ✅ | Le token de ton bot |
| `GEMINI_API_KEY` | ✅ | Ta clé Gemini (la même que sur le site) |
| `IA_CHANNEL_ID` | ❌ | L'ID d'UN salon précis où répondre. Si vide, il répond dans tout salon dont le **nom contient** `ia` |
| `IA_CHANNEL_NAME` | ❌ | Le mot-clé du nom de salon (défaut : `ia`) |
| `TENOR_API_KEY` | ❌ | Pour envoyer des GIFs drôles quand on le chambre |

## 3) Lancer

### Option A — Railway (recommandé, gratuit au début)
1. Va sur https://railway.app → **New Project** → **Deploy from GitHub repo** → choisis ce repo.
2. Dans **Settings → Root Directory**, mets `bot-ia`.
3. Dans **Variables**, ajoute `DISCORD_BOT_TOKEN` et `GEMINI_API_KEY` (+ les optionnelles).
4. Railway lance `npm install` puis `npm start` tout seul. C'est bon ✅

### Option B — Replit
1. Crée un Repl **Node.js**, importe ce dossier `bot-ia`.
2. Mets tes variables dans l'onglet **Secrets** 🔒.
3. Clique **Run**. (Pour qu'il reste allumé, active « Always On » ou utilise un UptimeRobot.)

### Option C — Sur ton PC / un Raspberry (il faut que la machine reste allumée)
```bash
cd bot-ia
npm install
DISCORD_BOT_TOKEN=ton_token GEMINI_API_KEY=ta_cle npm start
```
(ou mets les variables dans un fichier `.env` + lance avec `node --env-file=.env index.js` sur Node 20+)

## 4) Côté serveur

- Crée un salon **`#ia`** (ou mets `IA_CHANNEL_ID` sur le salon de ton choix).
- Donne au bot la permission de **lire + écrire** dans ce salon.
- Écris « salut » dedans → il répond. 🎉

---

Mémoire : le bot se souvient des derniers messages **par salon**, en RAM. S'il redémarre,
il oublie (c'est voulu, pour rester léger). Les insultes vraiment vulgaires / racistes /
sexuelles et tout ce qui est illégal sont bloqués côté IA.
