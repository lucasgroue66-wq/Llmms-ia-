# llmms ia — version 1.0

## Lancer la vraie version (checklist)
1. GitHub : dépôt `llmms-ia` avec tout le contenu de ce dossier (depuis un ordinateur).
2. Netlify (ou ton projet Vercel `ia-llmms-1`, qui a déjà ta clé OpenRouter) : importer le dépôt, déployer.
3. Variables d'environnement :
   - `OPENROUTER_API_KEY` (obligatoire, l'IA)
   - `RESEND_API_KEY` (obligatoire pour la connexion par e-mail — sans elle, le site reste ouvert à tous)
   - `MAIL_FROM` = `llmms ia <code@ton-domaine.com>` (domaine vérifié chez Resend, pour envoyer le code à tout le monde)
   - `AUTH_SECRET` = une longue phrase secrète
4. Redéployer, ouvrir l'adresse, se connecter avec son e-mail + le code reçu.
5. Google Search Console (voir plus bas).

Remise à zéro : chaque appareil a été remis à zéro à sa première visite de cette version (discussions, réglages, connexion).
Pour refaire une remise à zéro générale plus tard : augmenter `DATA_VERSION` dans index.html.

## Pourquoi « Failed to fetch » ?
Le site a besoin de sa fonction serveur `/api/chat` (c'est elle qui parle à l'IA avec ta clé).
Elle ne marche PAS si :
- tu ouvres `index.html` directement sur ton appareil ;
- tu mets le dossier en ligne par simple glisser-déposer (Netlify Drop) : seules les pages sont publiées, pas la fonction.

## Mettre en ligne (une seule fois)
1. Crée un dépôt GitHub et mets-y tout le contenu de ce dossier (sur github.com : *New repository* → *uploading an existing file*, glisse tous les fichiers et dossiers).
2. Choisis UN hébergeur :
   - **Netlify** : *Add new site → Import an existing project → GitHub* → choisis le dépôt → *Deploy*.
   - **Vercel** : *Add New → Project* → choisis le dépôt → Framework : *Other* → *Deploy*.
3. Ajoute la variable d'environnement `OPENROUTER_API_KEY` = ta clé OpenRouter
   (Netlify : *Site configuration → Environment variables* ; Vercel : *Settings → Environment Variables*), puis redéploie.

## Les modèles llmms ia 1 → 5.5
Sur le site, on choisit entre llmms ia 1, 2, 3, 4, 5 et 5.5. Chaque version utilise en vrai un modèle OpenRouter (défini dans `lib/core.js`) :
1 = le plus rapide … 5.5 = le plus puissant. L'IA se présente toujours sous son nom llmms ia.
Pour changer le vrai modèle d'une version sans toucher au code, ajoute une variable `LLMMS_MODEL_1`, `LLMMS_MODEL_2` … `LLMMS_MODEL_5_5`
avec l'identifiant OpenRouter (plusieurs possibles, séparés par des virgules).

## Recherche web et météo
Activée par défaut (bouton 🌐 ou Paramètres). L'IA cherche toute seule quand il faut :
- météo : service gratuit Open-Meteo (aucune clé) ;
- recherche internet : passe par OpenRouter (plugin web, quelques centimes par recherche). Modèle changeable avec `LLMMS_SEARCH_MODEL`.

Variables optionnelles :
- `OPENROUTER_IMAGE_MODEL` : modèle d'images à essayer en premier
- `ACCESS_CODE` : un code demandé une seule fois, pour que seuls tes potes l'utilisent

## Brancher Roblox Studio (sur ton PC)
1. Ouvre Roblox Studio avec ta place et le plugin MCP.
2. Double-clique sur `pont-studio/LANCER-LE-PONT.bat` (il faut Node.js : https://nodejs.org).
3. Sur le site, dans le navigateur DU MÊME PC, colle dans le chat le lien affiché (`http://localhost:3333/mcp`).
   Si Chrome demande l'accès au réseau local → **Autoriser**.

## Analyse de jeux Roblox
Demande par exemple « fais-moi un jeu style Steal an Egg, la même map » : l'IA trouve le jeu sur Roblox (description, stats, captures d'écran officielles qu'elle regarde), fait des recherches (wiki, YouTube, guides), écrit un cahier des charges puis reconstruit la map et les systèmes.
Pour la meilleure fidélité : enregistre ton écran en jouant 1 à 2 minutes et envoie la vidéo.

## Travail en arrière-plan
- Studio connecté : c'est le pont (sur ton PC) qui fait tourner tout le travail de l'IA. Tu peux fermer le site : il continue tant que le PC, le pont et Studio restent ouverts. Quand tu rouvres le site, tu retrouves le résultat.
- Sans Studio : si tu fermes la page ou changes d'appli pendant une réponse, elle reprend automatiquement à ton retour.

## Recréer un jeu depuis une vidéo
Bouton **+** (ou glisse la vidéo dans la page), puis « refais ce jeu identique ».
Le site extrait 8 à 20 images de la vidéo ; l'IA analyse la map, l'UI, les textes et les mécaniques, puis reconstruit tout dans Studio.

## Apparaître sur Google (« llmms ia »)
Le site est déjà prêt : titre et description pour Google, icône, image de partage, robots.txt et sitemap.xml automatiques.
1. Mets le site en ligne (Netlify via GitHub) et ouvre son adresse une fois pour vérifier.
2. Va sur https://search.google.com/search-console → « Ajouter une propriété » → type « Préfixe de l'URL » → colle l'adresse du site (https://….netlify.app).
3. Vérification : choisis « Balise HTML », copie la balise `<meta name="google-site-verification" content="…">` et colle-la dans `index.html` juste sous `<title>…</title>` (ou envoie-la à Claude), remets en ligne, puis clique « Valider ».
4. Dans Search Console → « Sitemaps », ajoute `sitemap.xml` et envoie. Puis « Inspection de l'URL » → colle l'adresse → « Demander une indexation ».
5. Attends quelques jours : en tapant « llmms ia » sur Google, le site apparaît.
Astuce : un nom de domaine à toi (ex. llmmsia.com, branché dans Netlify → Domain management) et des liens vers le site (Discord, YouTube, TikTok, profil Roblox) l'aident à monter plus vite.

## Connexion par e-mail (code à 6 chiffres)
Activée dès que `RESEND_API_KEY` est réglée (sinon le site reste ouvert sans connexion).
1. Crée un compte gratuit sur https://resend.com → « API Keys » → crée une clé → mets-la dans Netlify/Vercel : `RESEND_API_KEY`.
2. Pour envoyer le code à n'importe qui (tes potes) : dans Resend → « Domains », ajoute ton nom de domaine (ex. llmmsia.com) et suis les instructions, puis mets `MAIL_FROM` = `llmms ia <code@llmmsia.com>`.
   Sans domaine, Resend n'envoie qu'à l'adresse de ton propre compte Resend (pratique pour tester).
3. Optionnel : `AUTH_SECRET` = une longue phrase secrète (signe les connexions) ; `ALLOWED_EMAILS` = liste d'e-mails autorisés séparés par des virgules (seuls eux peuvent entrer).
La connexion dure 30 jours sur chaque appareil. Menu ⚙ → « Se déconnecter ».
ok
