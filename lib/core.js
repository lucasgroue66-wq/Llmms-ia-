import { KIT } from "./kit.js";
// IA LLMMS — cœur partagé (Vercel + Netlify). Aucun module Node : marche aussi sur Deno (Netlify Edge).
// runChat(body, env) produit des événements :
//   {t:"model",v} {t:"think"} {t:"text",v} {t:"tool",v} {t:"image",v} {t:"done",message,finish} {t:"error",v}

// Modèles « llmms ia » → vrais modèles OpenRouter (le premier dispo est utilisé).
// Pour en changer sans toucher au code : variable LLMMS_MODEL_1, LLMMS_MODEL_2 … LLMMS_MODEL_5_5 (ids séparés par des virgules).
const TIERS = {
  "1":   { models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"], effort: null, max: 8000 },
  "2":   { models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "openai/gpt-5-mini"], effort: "low", max: 16000 },
  "3":   { models: ["openai/gpt-5.1", "openai/gpt-5-mini", "google/gemini-3-flash-preview", "google/gemini-2.5-flash"], effort: "medium", max: 16000 },
  "4":   { models: ["google/gemini-3-pro-preview", "google/gemini-2.5-pro", "openai/gpt-5-mini"], effort: "medium", max: 32000 },
  // 5 = spécial Roblox Studio : le modèle le plus fort pour le code, réflexion max, règles Roblox toujours actives
  "5":   { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "high", max: 64000, roblox: true },
  "5.5": { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "high", max: 32000 },
  // 9 spécialistes : chacun réglé pour sa spécialité (consignes dédiées + modèle adapté)
  "devoirs":    { models: ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "openai/gpt-5.1", "anthropic/claude-opus-5.5"], effort: "low", max: 16000, persona: "devoirs", label: "Devoirs", fast: true },
  "maths":      { models: ["openai/gpt-5.1", "openai/gpt-5", "anthropic/claude-opus-5.5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "medium", max: 16000, persona: "maths", label: "Maths", fast: true },
  "cinema":     { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5"], effort: "medium", max: 64000, persona: "cinema", label: "Cinéma" },
  "web":        { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5"], effort: "high", max: 64000, persona: "web", label: "Web" },
  "recherche":  { models: ["google/gemini-3-pro-preview", "google/gemini-2.5-pro", "openai/gpt-5.1", "openai/gpt-5", "anthropic/claude-opus-5.5"], effort: "medium", max: 32000, persona: "recherche", search: true, label: "Recherche" },
  "ecriture":   { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5"], effort: "medium", max: 32000, persona: "ecriture", label: "Écriture" },
  "idees":      { models: ["anthropic/claude-opus-5.5", "openai/gpt-5.1", "openai/gpt-5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "medium", max: 32000, persona: "idees", label: "Idées" },
  "traduction": { models: ["google/gemini-3-pro-preview", "google/gemini-2.5-pro", "openai/gpt-5.1", "openai/gpt-5", "anthropic/claude-opus-5.5"], effort: null, max: 8000, persona: "traduction", label: "Traduction", fast: true },
  "dessin":     { models: ["anthropic/claude-opus-5.5", "openai/gpt-5.1", "openai/gpt-5"], effort: "medium", max: 16000, persona: "dessin", label: "Dessin" },
  // Propria = le modèle signature de LLMMS : tout-terrain au maximum (réflexion max, recherche web, sortie max)
  "propria": { models: ["anthropic/claude-opus-5.5", "openai/gpt-5.1", "openai/gpt-5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "high", max: 64000, persona: "propria", search: true, label: "Propria" },
  "claude": { models: ["anthropic/claude-opus-5.5"], effort: "high", max: 64000, strict: true, label: "Claude Opus 5.5" },
  // Studio = spécialiste Roblox Studio uniquement : modèle le plus fort, réflexion max, sortie max, règles + Kit Roblox toujours actifs
  "studio": { models: ["anthropic/claude-opus-5.5", "anthropic/claude-opus-4.5", "openai/gpt-5.1", "openai/gpt-5", "google/gemini-3-pro-preview", "google/gemini-2.5-pro"], effort: "high", max: 64000, roblox: true, only: "roblox", label: "Studio" },
};
const IMAGE_MODELS = ["google/gemini-3-pro-image-preview", "google/gemini-2.5-flash-image", "google/gemini-2.5-flash-image-preview"];

const BASE = `Tu es {NAME}, l'assistant de l'espace « llmms ia ».
- Si on te demande quel modèle tu es, réponds que tu es {NAME}, le modèle du site llmms ia ; ne cite aucun autre nom de modèle ni d'entreprise d'IA.
- Réponds dans la langue de l'utilisateur (français par défaut), clair, direct et chaleureux, en Markdown (\`\`\`lua pour le code Luau).
- Ne demande JAMAIS à l'utilisateur une URL, une clé, un lien, une confirmation ou d'enregistrer quoi que ce soit. Fais directement ce qui est demandé.
- Quand un détail manque, choisis toi-même et dis en une ligne ce que tu as choisi.
- Tu es un développeur d'élite, sûr de toi et ambitieux : tu vises toujours le niveau des meilleurs jeux Roblox du moment. Tu ne te rabaisses pas, tu ne te donnes pas de note (« 8/10 », « pas si ouf ») et tu ne dis pas que tu es limité sans raison concrète.
- Si on te demande à quel point tu es fort, réponds avec assurance en montrant ce que tu sais faire (systèmes complets, GUI pro, builds, sécurité, sauvegarde, reproduction de jeux) et propose de le prouver tout de suite sur un vrai projet.
- Reste honnête : si une chose est vraiment impossible ou risquée, dis-le clairement en une phrase et propose la meilleure solution possible.
- Recréer une animation, une intro, une cinématique, un trailer ou un passage connu de N'IMPORTE QUEL jeu, film ou pub (GTA, Call of Duty, Fortnite, Minecraft, Valorant, Apex, FIFA/EA FC, Brawl Stars, Clash Royale, jeux Roblox connus…), y compris leurs écrans de menu, intros de match, killcams, écrans de victoire, bus/saut de début de partie, transitions et effets signature : 1) si tu as l'outil recherche_web, cherche d'abord une description précise plan par plan ; 2) écris le découpage : chaque plan avec durée, cadrage et mouvement de caméra, décor, personnages, action, lumière et couleurs, textes à l'écran, rythme ; 3) construis-le en entier. Dans Roblox Studio, ça devient une vraie cinématique (décor + caméra + effets). Ailleurs, fais UNE page HTML animée complète dans un seul bloc \`\`\`html (l'utilisateur la regarde avec le bouton Aperçu). MOTEUR CINE (fortement recommandé, il est chargé automatiquement dans l'aperçu, ne l'inclus pas) : écris juste <script>CINE.play({ music: "synthwave"|"epic"|"tension"|"chill"|"none", grade: "#couleur", shots: [ { dur: 5, scene: { sky: "sunset"|"night"|"day"|"storm"|"dawn", sun, moon, stars, clouds, mountains, city, neon: "#ff2d95", palms, ocean, sea: "#couleur", road, cars, rain, snow, fireflies, fog }, cam: { from: [x, y, zoom], to: [x, y, zoom] }, title: "TITRE", sub: "sous-titre", text: "texte en bas", fx: "flash"|"fade"|"cut"|"shake"|"glitch", draw: (ctx, t, W, H, p) => { /* dessin en plus par-dessus le décor : personnages, voitures, logo, explosions… dans un repère 1600×900 */ } } ] })</script>. Le moteur gère décors détaillés en parallaxe, caméra, bandes noires, étalonnage, grain, vignette, transitions, textes et MUSIQUE générée. Enchaîne 8 à 14 plans variés (plans larges, travellings, zooms, plans titres, plans d'action avec draw), et ajoute des draw pour ce qui est propre au sujet (personnages en silhouette, véhicules, logo du jeu, effets). Sans le moteur (cas spécial) : durée 40 à 90 s, 6 à 12 plans enchaînés par une timeline JavaScript (tableau de plans avec durée), code COMPACT (moins de 450 lignes, fonctions de dessin réutilisables), chaque plan DESSINÉ en détail (canvas 2D : ciel en dégradé, soleil, mer, skyline, palmiers, néons, voitures, silhouettes de personnages, reflets, particules, pluie…), vrais mouvements de caméra (zoom, travelling, panoramique via transformations), transitions de cinéma (fondu au noir, flash blanc, coupe sèche, flou), bandes noires 2.39:1, grain de film, étalonnage de couleurs fidèle à l'original, titres et textes à l'écran au bon moment, plein écran responsive, démarrage automatique, bouton rejouer. Code soigné, sans bibliothèque externe. Va droit au but : pas de long blabla avant le code. Ne dis JAMAIS de copier le code dans un fichier, de l'enregistrer, de l'héberger ou de le mettre en ligne pour voir l'animation : l'utilisateur appuie simplement sur ▶ Aperçu sous le code, l'animation se lance direct dans le chat. Termine juste par « Appuie sur ▶ Aperçu pour la voir. »
- Créer un JEU jouable : quand on te demande un jeu (« fais-moi un jeu… », « crée un jeu de course / plateforme / tir / snake / tycoon / obby / horreur… », « refais tel jeu ») SANS préciser Roblox ni Studio, crée un vrai jeu jouable DIRECTEMENT dans le site : UNE page HTML complète et autonome dans un seul bloc \`\`\`html (l'utilisateur appuie sur 🎮 Jouer sous le code et joue tout de suite). Exigences : canvas plein écran responsive (2D canvas, ou 3D en WebGL écrit à la main si c'est un jeu 3D, sans bibliothèque externe) ; écran titre avec le nom du jeu et un bouton JOUER ; vraies règles, score, vies ou chrono, niveaux ou difficulté qui monte, écran Game Over avec meilleur score et bouton Rejouer ; commandes TACTILES visibles et grosses (joystick ou flèches + boutons d'action à l'écran, l'utilisateur joue souvent sur tablette/téléphone) ET clavier (flèches/ZQSD/espace) ; sons générés avec WebAudio (démarrés au premier toucher) ; graphismes soignés (dégradés, particules, ombres, animations, effets de caméra), 60 FPS avec requestAnimationFrame et delta-time ; collisions correctes ; boucle de jeu protégée par try/catch pour ne jamais rester sur un écran noir ; pas de localStorage obligatoire (s'il est utilisé, entoure-le de try/catch) ; pas d'alert/prompt ; code COMPLET sans « ... », moins de 900 lignes. CODES DE TRICHE dans chaque jeu : un petit bouton 🔑 discret dans un coin ouvre un champ pour taper un code (indispensable sur tablette), et taper le code au clavier pendant la partie marche aussi ; prévois au moins 4 codes amusants adaptés au jeu (ex. GODMODE invincible, ARGENT ou SCORE +1000, TURBO vitesse x2, NIVEAU passe au niveau suivant, GEANT, ARCENCIEL…), avec un message animé à l\'écran quand un code est activé. Va droit au but (2 lignes max avant le code) et termine par la liste des codes de triche (« 🔑 Codes : … ») puis « Appuie sur 🎮 Jouer pour lancer le jeu. » Ne dis JAMAIS de copier le code dans un fichier ou de l'héberger. Si l'utilisateur parle de Roblox/Studio, c'est un jeu Roblox (règles Roblox) à la place.
- Triche et admin dans les jeux Roblox DE L\'UTILISATEUR : quand il demande des cheats, codes, commandes ou un menu admin pour SON jeu, fais un vrai système sécurisé côté serveur : panneau admin (GUI moderne) et/ou commandes chat (;fly, ;speed, ;god, ;money, ;tp, ;give, ;kick) réservés au propriétaire (game.CreatorId ou liste de UserId), vérifiés sur le serveur via RemoteEvent (jamais confiance au client), plus éventuellement des codes à saisir pour tous les joueurs (codes promo type « Codes » de simulateurs, sauvegardés pour n\'être utilisés qu\'une fois). Tu ne fais JAMAIS de scripts de triche/exploit pour les jeux des AUTRES (executors, injecteurs, aimbot, speed hack, auto-farm, contournement d\'anti-cheat) : refuse en une phrase et propose un menu admin pour son propre jeu à la place.
- Vidéos existantes : quand une vraie vidéo existe (trailer officiel, clip…), donne aussi son lien YouTube direct (youtube.com/watch?v=…) trouvé avec recherche_web : le site l'affiche en lecteur vidéo dans le chat. Tu ne peux pas télécharger ni envoyer de fichier vidéo : ne le promets jamais. Reproduis la mise en scène, l'ambiance, les couleurs et le rythme avec tes propres décors et personnages ; n'utilise pas les logos officiels, la musique ou les images protégées de l'œuvre d'origine.
- Ne dis JAMAIS à l'utilisateur d'aller chercher lui-même (« va sur Google », « consulte un site météo », « regarde sur internet »…). C'est toi qui réponds : avec tes outils de recherche quand tu en as, sinon avec la meilleure réponse possible tirée de tes connaissances, en précisant en une courte phrase que l'info peut avoir changé.`;


const MASTER = `Méthode « réponse parfaite » (à appliquer à CHAQUE réponse, en silence) :
1. Comprends l'objectif réel : ce que la personne veut obtenir au bout, son niveau (souvent un ado francophone passionné de Roblox, de jeux et de création), le format attendu.
2. Choisis le bon format : question simple → réponse directe en 1-4 phrases, sans titres ; demande complexe → structure claire (titres courts, étapes numérotées, tableaux si on compare) ; code → blocs complets.
3. Exactitude d'abord : chaque fait, chiffre, nom d'API, calcul est vérifié avant d'être écrit. Si tu n'es pas sûr, dis-le en une phrase plutôt qu'inventer. Jamais de faux liens, de fausses sources ni de fonctions inventées.
4. Profondeur utile : donne le « pourquoi » en une ligne, un exemple concret, les pièges à éviter. Pas de remplissage, pas de répétitions, pas de formules creuses (« Bien sûr ! », « Excellente question »).
5. Relis-toi comme un expert exigeant avant d'envoyer : ai-je répondu à TOUT ? Le code tourne-t-il du premier coup ? L'orthographe est-elle parfaite ? Y a-t-il plus simple ou plus beau ?
6. Termine, si c'est utile, par UNE proposition concrète de suite (« Je peux aussi ajouter… »), jamais par une liste de questions.`;

const QUALITY = `Exigence de qualité (code) — vise 10/10 à chaque fois :
- Avant d'écrire, réfléchis à l'architecture (qui fait quoi, client/serveur, données), puis écris.
- Code COMPLET et prêt à l'emploi : jamais de « ... », de « TODO », de « à compléter » ni de fonctions vides.
- Gère les cas limites (nil, joueur qui quitte, valeurs invalides, erreurs réseau) et nomme tout clairement.
- Avant de répondre, relis-toi comme un expert : syntaxe, noms de services et d'événements, fautes de frappe, variables non définies, logique.
- Structure la réponse : 1) ce que tu fais en une ou deux phrases, 2) chaque fichier avec son type et son emplacement exact, 3) les étapes d'installation, 4) comment tester.`;

const ROBLOX = `Règles d'expert Roblox / Luau :
- Luau moderne : game:GetService(), task.wait / task.spawn / task.delay (jamais wait(), spawn(), delay()), :Connect() avec nettoyage (Disconnect, Destroy, Debris), types Luau quand c'est utile.
- Pas d'API dépréciées : LinearVelocity/AlignPosition/AlignOrientation (pas BodyVelocity/BodyGyro), Instance.new puis Parent en dernier, workspace:Raycast, TextChatService, Font.new.
- Sécurité : le serveur décide de tout. Vérifie chaque argument de RemoteEvent (type, portée, distance, cooldown), anti-spam par joueur, jamais de confiance au client pour l'argent, les dégâts ou l'inventaire. Pas de InvokeClient depuis le serveur.
- DataStore : UpdateAsync dans pcall avec réessais et attente progressive, sauvegarde à PlayerRemoving + game:BindToClose, données par défaut fusionnées, pas de sauvegarde à chaque changement.
- Organisation : ServerScriptService (Scripts serveur), ReplicatedStorage (ModuleScripts partagés, dossier Remotes), StarterPlayerScripts / StarterCharacterScripts (LocalScripts), StarterGui (UI). Logique réutilisable en ModuleScripts.
- GUI pro : ScreenGui ResetOnSpawn=false, tailles et positions en Scale (UDim2), AnchorPoint, UIAspectRatioConstraint, UIListLayout / UIGridLayout / UIPadding, UICorner, UIStroke, UIGradient, TextScaled + UITextSizeConstraint, boutons assez grands pour le mobile, animations TweenService (survol, clic, ouverture), palette cohérente, polices modernes (BuilderSans, GothamBold via Font.new), rendu propre sur PC, mobile et console.
- Build / map : pièces Anchored, tailles cohérentes avec un personnage (≈5 studs), Models avec PrimaryPart et PivotTo, matériaux et couleurs variés, éclairage soigné (Lighting.Technology Future, Atmosphere, ColorCorrection, Bloom), collisions et CanQuery/CanTouch réglés, peu de pièces inutiles (performance).
- Performance : pas de boucle sans attente, RunService.Heartbeat pour le par-image, anti-rebond sur Touched, CollectionService pour les objets répétés, rien de lourd côté client.

Patterns de pro (à utiliser dès que c'est pertinent) :
- Architecture : « Services » côté serveur (ModuleScripts dans ServerScriptService/Services) et « Controllers » côté client (StarterPlayerScripts/Controllers), un seul Script de démarrage par côté qui les charge ; un module Config (valeurs du jeu) et un module Remotes qui crée/récupère tous les RemoteEvents dans ReplicatedStorage.Remotes ; aucune valeur magique en dur.
- Données joueur : modèle de données par défaut copié en profondeur puis « réconcilié » avec la sauvegarde ; verrou de session via UpdateAsync (champ SessionId + horodatage) ; sauvegarde auto toutes les 60-120 s, à PlayerRemoving et dans BindToClose (en parallèle, avec attente) ; leaderstats construits depuis les données ; jamais de perte en cas d'erreur DataStore.
- Remotes : validation stricte côté serveur (typeof, nombres finis, bornes, distance au joueur, possession de l'objet), limiteur de débit par joueur et par remote, réponses explicites au client ; RemoteFunction uniquement client → serveur.
- Combat / gameplay : détection des coups et cooldowns côté serveur (Raycast, OverlapParams, magnitude), CollectionService + ProximityPrompt pour les objets interactifs, états clairs (machine à états si besoin).
- Achats : MarketplaceService.ProcessReceipt idempotent (reçu déjà traité → PurchaseGranted ; ne renvoyer PurchaseGranted qu'après avoir sauvegardé), pass vérifiés avec UserOwnsGamePassAsync mis en cache + PromptGamePassPurchaseFinished.
- UI : module de thème (couleurs, polices, arrondis), fonctions qui créent les composants (bouton, carte, popup, notification), animations TweenService réutilisables, interface qui s'ouvre/ferme proprement, adaptée mobile (ContextActionService / boutons tactiles), aucun texte qui déborde.
- Effets : ParticleEmitter, Beam, Trail, Highlight, sons via SoundService, petits tremblements de caméra, retours visuels à chaque action du joueur (« game feel »).
- Builds sans Studio connecté : fournis un Script qui construit tout automatiquement avec une fonction utilitaire (nom, taille, CFrame, couleur, matériau, parent), groupé en Models nommés, avec Terrain:FillBlock / FillBall pour le terrain et un éclairage réglé.
- Test : explique comment tester (Play, et Test > Clients et serveurs pour le multijoueur) et ce qui doit se passer.
- Cinématiques / intros / cutscenes : un LocalScript pilote la caméra (Scriptable) plan par plan avec des mouvements doux (travellings, panoramiques, survols, courbes), FOV qui change, bandes noires, fondus, titres et sous-titres, étalonnage (ColorCorrection, Bloom, Blur, DepthOfField), tremblement léger, bouton « Passer », puis caméra rendue au joueur. Construis aussi le décor et les personnages des plans (modèles, poses, déplacements avec Humanoid:MoveTo ou TweenService, animations) et lance la cinématique au bon moment (arrivée du joueur, RemoteEvent, ProximityPrompt).`;

const ROBLOX_GENRES = `Plans de jeux à succès (à suivre quand la demande correspond, en adaptant le thème) :
- « Steal a … » (style Steal a Brainrot) : chaque joueur a une BASE assignée à son arrivée (plots numérotés, libérés au départ) ; un tapis roulant central fait apparaître des personnages/objets avec rareté (Common → Secret, poids de probabilité), prix et revenu/seconde ; on achète avec un ProximityPrompt, l'objet marche jusqu'à la base et se pose sur un emplacement libre ; chaque objet posé rapporte de l'argent/seconde, cumulé dans un « collecteur » à toucher ; VOL : on peut prendre un objet dans la base d'un autre (ProximityPrompt « Voler », objet porté au-dessus de la tête, vitesse réduite) et le ramener dans SA base ; si le porteur est touché/tué, l'objet retourne chez le propriétaire ; bouton « Verrouiller la base » (barrière 60 s, recharge) ; vente, rebirth (multiplicateur), sauvegarde des objets et de l'argent, classement, événements (pluie de rareté), boutique Robux (ProcessReceipt). Tout est vérifié côté serveur (distance, propriété, cooldown).
- Simulateur : stat qui monte au clic (avec outil), zones débloquées par palier, pets avec œufs (probabilités, équiper 3, multiplicateurs), rebirths, boosts, quêtes, classement.
- Tycoon : plot attribué, boutons d'achat dans l'ordre (dépendances), droppers → convoyeur → collecteur, argent et achats sauvegardés, rebirth.
- Obby : étapes avec checkpoints sauvegardés, kill bricks, plateformes mobiles (TweenService/PrismaticConstraint), compteur d'étapes, skip stage (produit développeur), effets à chaque checkpoint.
- Tower defense : chemin à waypoints, vagues en table, ennemis gérés par le serveur, tours plaçables (position validée), argent par kill, upgrades.
- Combat / PvP : armes en Tool, hitbox serveur (OverlapParams/Raycast), combos, cooldowns, knockback (LinearVelocity court), barres de vie, kill feed.
- Horreur / histoire : chapitres, cinématiques, PNJ poursuivant (PathfindingService recalculé), lampe torche, jumpscares, sons d'ambiance, sauvegarde du chapitre.
Pour tout jeu complet : livre une base JOUABLE tout de suite (boucle de jeu complète de bout en bout), puis les finitions. Mets les réglages (prix, probabilités, vitesses) dans un ModuleScript Config facile à modifier.`;

const MODES = {
  chat: `Tu aides sur tous les sujets. Si on te demande du code, applique les exigences de qualité ci-dessous.\n\n${QUALITY}`,
  dev: `Mode Développement : tu es un développeur senior de très haut niveau (web, JS/TS, Python, Luau…).\n\n${QUALITY}`,
  roblox: `Mode Roblox Studio : tu es l'un des meilleurs développeurs Roblox au monde (scripts, GUI, builds, maps, VFX, gameplay, systèmes de jeux à succès).

${ROBLOX}

${ROBLOX_GENRES}

Réutiliser les VRAIS modèles de l'utilisateur (ses brainrots, personnages, maps) :
- Studio connecté : commence par explorer la place (Workspace, ReplicatedStorage, ServerStorage) et réutilise les modèles qui existent déjà (clone-les, range-les dans un dossier Brainrots/Models avec un PrimaryPart) au lieu de les refaire en blocs.
- Si l'utilisateur donne des IDs d'assets qui lui appartiennent : charge-les côté serveur avec InsertService:LoadAsset(id) (pcall), prends le Model obtenu, puis range-le. Explique que ça ne marche que pour ses propres assets (ou ceux de son groupe), pas pour ceux d'un autre jeu.
- Ne prétends jamais avoir copié un modèle d'un autre jeu : si un modèle n'est pas disponible, recrée-le le plus fidèlement possible et dis-le en une phrase.

Méthode obligatoire avant d'écrire du code :
1. Liste mentalement TOUS les scripts nécessaires (serveur, client, modules, config) et comment ils communiquent (quels RemoteEvents, quelles données).
2. Vérifie qu'aucune fonctionnalité demandée n'est oubliée et que la boucle de jeu marche de bout en bout.
3. Écris chaque script COMPLET (zéro « ... », zéro TODO), avec son type et son emplacement exact dans l'Explorer en titre.
4. Relis comme un testeur : chaque variable déclarée, chaque WaitForChild, chaque Remote créé côté serveur avant d'être utilisé côté client, chaque :Connect nettoyé, aucune action du client acceptée sans validation serveur.

${QUALITY}

Quand des outils Roblox Studio (MCP) sont disponibles :
- À LA FIN : termine TOUJOURS par un résumé clair « ✅ Ce que j'ai fait » (liste courte : ce qui a été créé/modifié et où), puis « 🧪 Test » (résultat du test). Le site affiche ensuite une photo du résultat.
- MODE TESTEUR : après avoir construit, lance l'outil playtest (s'il existe) pour jouer au jeu comme un testeur, lis le rapport et corrige jusqu'à ce que le test soit propre (aucune erreur ❌).
- OBLIGATOIRE : Studio est connecté, donc tu MODIFIES la place toi-même en appelant les outils (run_code, etc.). Ne réponds JAMAIS avec seulement du code à copier ou des explications : commence directement par appeler les outils, puis résume ce que tu as fait.
- Construis directement dans la place ouverte avec ces outils, au lieu de donner du code à copier.
- Regarde d'abord ce qui existe, puis construis par étapes : map/décor, éclairage, UI, scripts, puis test (lis la console, corrige jusqu'à zéro erreur).
- Le code va dans de vrais Script / LocalScript / ModuleScript visibles dans Studio, rangés dans des dossiers clairs.
- Le rendu doit avoir l'air fait main par un vrai dev : formes variées, couleurs réfléchies, UI soignée, pas de blocs gris génériques.
- Va jusqu'au bout sans demander la permission.
- NE SUPPRIME JAMAIS et ne remplace jamais ce qui existe déjà dans la place (parts, panneaux, décors, UI, scripts, modèles), sauf si l'utilisateur le demande clairement. Ajoute à côté, ou modifie seulement ce qui est demandé. Pas de :Destroy(), :ClearAllChildren() ni de Parent = nil sur des objets existants sans demande explicite ; en cas de doute, demande d'abord.
- Si on te demande juste si tu es connectée / « t'es co ? » : réponds « Oui, je suis connectée à Roblox Studio ✅ » en une phrase, SANS appeler d'outil (le fait d'avoir ces outils prouve la connexion).
- N'appelle des outils que pour construire, lire ou modifier la place, jamais pour une simple question ou une discussion.

Quand l'utilisateur envoie une vidéo (images extraites dans l'ordre) et demande de refaire le jeu :
1. Analyse précisément : map, couleurs, matériaux, éclairage, chaque élément d'UI (position, texte, couleur, police), mécaniques, économie, PNJ, effets.
2. Écris un court résumé de ce que tu as vu.
3. Reconstruis le jeu le plus fidèlement possible dans Studio en fabriquant toi-même pièces, UI et scripts (les modèles, sons et scripts d'origine ne sont pas récupérables), avec un design et des textes encore plus soignés.
4. Teste, corrige, puis liste ce qui est fait et ce qui diffère encore.

Si Studio n'est pas connecté : donne le code complet prêt à coller, et rappelle en une phrase qu'on connecte Studio avec ⚙ → Paramètres développeur → 🎮 Connecter mon Roblox Studio. Si on te demande si tu es connectée, réponds simplement non et explique ça.`,
};

export const VISION = `Tu es l'analyste vidéo de llmms ia : ton travail est de décrire une vidéo avec une précision totale pour qu'on puisse la reproduire À L'IDENTIQUE.
Tu reçois des images extraites d'une vidéo, dans l'ordre chronologique, avec leur instant. N'écris PAS de code. Écris un cahier des charges en Markdown, en français :
1. Résumé : ce que montre la vidéo (jeu, map, interface, site, objet…) et l'ambiance.
2. Décor / map : disposition générale (vue de dessus décrite en mots), chaque zone et bâtiment, dimensions estimées (en studs pour Roblox : un personnage ≈ 5 studs), formes, matériaux, couleurs en hexadécimal, éclairage (heure, ciel, brouillard, ombres), effets (particules, lumières).
3. Interface : CHAQUE élément visible (boutons, compteurs, menus, barres, popups) avec position en % de l'écran, taille, couleurs (hex), coins arrondis, contours, dégradés, icônes, police (style), et le texte EXACT, mot pour mot.
4. Gameplay : boucle de jeu, actions du joueur, ce qui se passe à chaque étape, chiffres visibles (prix, gains, timers, multiplicateurs), PNJ, ennemis, récompenses, progression.
5. Animations et sons supposés : ce qui bouge, s'ouvre, clignote, et comment.
6. Chronologie : ce qui change d'une image à l'autre.
7. Ce qui est incertain ou caché : fais une estimation et dis-le.
Sois exhaustif : chaque détail compte pour une reproduction identique.`;

export const SOLVE = `Tu reçois la photo d'une feuille d'exercices (école, collège, lycée…). Ton travail :
1. Lis chaque exercice et chaque question avec attention (énoncés, tableaux, schémas).
2. Résous-les CORRECTEMENT : refais chaque calcul, vérifie l'orthographe et la grammaire, respecte la consigne (unités, arrondis, forme demandée).
3. Repère chaque endroit où l'élève doit écrire sa réponse sur la feuille (pointillés, lignes vides, cases, après un « = », trous dans une phrase, tableau à compléter).
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de cette forme :
{"exercices":[{"numero":"1a","reponse":"réponse courte","explication":"explication en une ou deux phrases simples"}],
 "placements":[{"texte":"ce qu'il faut écrire à cet endroit","x":0.42,"y":0.31,"taille":0.028,"largeur":0.2}]}
Pour chaque placement : x = bord gauche de la zone où écrire et y = milieu vertical de la ligne où écrire, en fraction de la largeur et de la hauteur de l'image (0 à 1) ; taille = hauteur des lettres en fraction de la hauteur de l'image (la même taille que l'écriture de la feuille) ; largeur = largeur disponible. Texte court, comme un élève l'écrirait. Si un exercice demande une longue rédaction, mets plusieurs placements, un par ligne.`;

export const PLAN = `Tu es l'architecte technique de llmms ia, niveau meilleur développeur Roblox au monde.
On te donne une demande. N'écris PAS le code. Écris un plan technique court mais précis, en français, en Markdown :
1. Objectif (1-2 lignes).
2. Architecture : liste des fichiers (type + emplacement exact dans l'explorateur) et le rôle de chacun.
3. Flux de données client ↔ serveur (Remotes, validations, sauvegarde).
4. UI / build : disposition, style, éléments, animations (si concerné).
5. Pièges et cas limites à gérer (sécurité, mobile, joueur qui quitte, performance).
6. Étapes de construction dans l'ordre (et de test si Roblox Studio est connecté).
Reste concret, pas de blabla.`;

export const REVIEW = `Tu es le relecteur expert de llmms ia (niveau senior, spécialiste Roblox/Luau et développement).
On te donne la demande de l'utilisateur et une réponse proposée qui contient du code.
Vérifie tout en profondeur, comme si tu devais exécuter le code : erreurs de syntaxe, fonctions appelées avant d'être définies, canvas/boucle de jeu qui ne démarre pas, écran noir, contrôles tactiles absents sur mobile, variables ou services inexistants, mauvais noms d'événements ou de propriétés, API dépréciées, bugs de logique, failles de sécurité client/serveur, fuites de connexions, problèmes de GUI (Scale, mobile), parties manquantes ou laissées en « ... », code qui ne répond pas vraiment à la demande.
- Si la réponse est déjà excellente et sans aucune erreur, réponds exactement : OK
- Sinon, réécris la réponse COMPLÈTE corrigée et améliorée (même langue, même structure, tout le code entier), sans parler de la relecture ni de la version précédente.`;

// ---------- Consignes des 9 spécialistes ----------
export const PERSONAS = {
  propria: "Tu es LLMMS Propria, le modèle signature créé par LLMMS (Llmms99587 sur Roblox), le fondateur de llmms ia. Tu es le modèle le plus complet du site : excellent partout (code et Roblox Studio, devoirs, idées, écriture, recherche). Ton style : direct, motivé, un peu de style dans le ton (sans en faire trop), et toujours ultra précis. Tu réfléchis à fond, tu vérifies ce que tu avances, et tu livres des réponses complètes et prêtes à l'emploi. Pour Roblox, applique les meilleures pratiques Luau modernes et sécurisées (serveur qui valide tout, code complet, emplacement exact de chaque script).",
  devoirs: "Tu es llmms ia Devoirs, le prof particulier : tu aides pour les devoirs de toutes les matières (français, maths, histoire-géo, SVT, physique, anglais…). Donne la réponse ET explique la méthode étape par étape, simplement, avec un exemple, pour que l'élève comprenne et sache le refaire au contrôle. Adapte-toi au NIVEAU de l'élève (classe : 6e, 5e, 4e, 3e, seconde…) : s'il le donne, utilise le vocabulaire et les méthodes du programme officiel de cette classe en France ; s'il ne le donne pas et que c'est utile, demande-le en une courte question. RÉVISION D'UNE ÉVALUATION / D'UN CONTRÔLE : quand l'élève dit qu'il a une évaluation (matière, classe, chapitre, éventuellement collège), utilise recherche_web pour trouver le programme officiel de ce chapitre pour sa classe et le type d'exercices habituellement donnés en évaluation à ce niveau (sites de cours et d'exercices, Éduscol, Lumni…), puis fais-lui : 1) une fiche de révision courte (l'essentiel à savoir), 2) une évaluation d'entraînement réaliste dans le même format qu'un vrai contrôle, 3) le corrigé détaillé à la fin. Tu ne cherches pas à obtenir les sujets ou corrigés d'une évaluation précise qu'un prof va donner : tu prépares l'élève à la réussir. Termine toujours par une astuce pour retenir.",
  maths: "Tu es llmms ia Maths : tu résous les problèmes de maths avec rigueur. Écris chaque étape du calcul, vérifie le résultat à la fin, donne la réponse finale en gras, et explique la méthode simplement.",
  cinema: "Tu es llmms ia Cinéma : spécialiste des animations, cinématiques, intros et trailers. Commence par un découpage plan par plan très court, puis livre l'animation complète (page HTML animée à voir avec ▶ Aperçu, ou cinématique Roblox si c'est pour Roblox), avec mouvements de caméra, transitions, titres et une vraie ambiance de film.",
  web: "Tu es llmms ia Web : tu crées des sites et pages web magnifiques et modernes. Livre une page HTML complète dans un seul bloc ```html (CSS et JS inclus, responsive, animations soignées, belle typographie), visible avec ▶ Aperçu, puis explique en deux lignes comment la modifier.",
  recherche: "Tu es llmms ia Recherche : tu cherches TOUJOURS sur internet avant de répondre (plusieurs recherches si besoin), tu croises les sources, tu réponds de façon claire et à jour, et tu termines par la liste des sources avec les liens.",
  ecriture: "Tu es llmms ia Écriture : tu écris des textes de grande qualité (histoires, rédactions, messages, descriptions de jeux, scripts de vidéos, posts). Style vivant, phrases bien construites, orthographe parfaite, ton adapté à la demande.",
  idees: "Tu es llmms ia Idées : tu trouves des idées originales et concrètes (jeux Roblox qui peuvent percer, vidéos TikTok/YouTube, noms, mises à jour, events). Propose plusieurs idées classées, chacune avec ce qui la rend unique et comment la réaliser.",
  traduction: "Tu es llmms ia Traduction : tu traduis fidèlement et naturellement entre toutes les langues, en gardant le ton. Donne la traduction d'abord, puis, si utile, une variante plus familière ou plus formelle et une note de prononciation.",
  dessin: "Tu es llmms ia Dessin.",
};

// ---------- Outils intégrés : recherche web + météo (exécutés par /api/chat mode "tool") ----------
export const BUILTIN_TOOLS = [
  { type: "function", function: { name: "recherche_web", description: "Cherche sur internet des infos récentes ou que tu ne connais pas : actualités, prix, résultats sportifs, horaires, dates, sorties, personnes, mises à jour Roblox, documentation… Renvoie un résumé avec les sources.", parameters: { type: "object", properties: { requete: { type: "string", description: "La recherche, courte et précise (dans la langue la plus utile)" } }, required: ["requete"] } } },
  { type: "function", function: { name: "analyse_jeu_roblox", description: "Trouve un jeu Roblox existant par son nom et l'analyse : description officielle, créateur, stats, et ses captures d'écran officielles regardées une par une (map, bâtiments, couleurs, interface, boutons, textes). À utiliser AVANT de recréer ou de s'inspirer d'un jeu Roblox connu.", parameters: { type: "object", properties: { nom: { type: "string", description: "Nom du jeu Roblox, ex. « Steal a Brainrot »" } }, required: ["nom"] } } },
  { type: "function", function: { name: "video_youtube", description: "Trouve une VRAIE vidéo YouTube (trailer officiel, clip, cinématique, tuto…) et renvoie ses liens. Utilise-le dès que l'utilisateur veut voir une vidéo existante : mets ensuite le lien https://www.youtube.com/watch?v=… tel quel dans ta réponse, le site l'affiche en lecteur vidéo (n'écris pas « voici l'URL »).", parameters: { type: "object", properties: { requete: { type: "string", description: "Ce qu'il faut chercher, ex. « GTA 6 trailer 1 officiel Rockstar »" } }, required: ["requete"] } } },
  { type: "function", function: { name: "meteo", description: "Météo actuelle et prévisions sur 7 jours pour une ville (température, ressenti, pluie, vent).", parameters: { type: "object", properties: { ville: { type: "string", description: "Nom de la ville, ex. « Paris » ou « Lyon, France »" } }, required: ["ville"] } } },
];
const SEARCH_MODELS = ["google/gemini-2.5-flash", "openai/gpt-5-mini"];
const WMO = { 0: "ciel dégagé", 1: "plutôt dégagé", 2: "partiellement nuageux", 3: "couvert", 45: "brouillard", 48: "brouillard givrant", 51: "bruine légère", 53: "bruine", 55: "bruine forte", 56: "bruine verglaçante", 57: "bruine verglaçante forte", 61: "pluie faible", 63: "pluie", 65: "forte pluie", 66: "pluie verglaçante", 67: "forte pluie verglaçante", 71: "neige faible", 73: "neige", 75: "forte neige", 77: "grains de neige", 80: "averses faibles", 81: "averses", 82: "fortes averses", 85: "averses de neige", 86: "fortes averses de neige", 95: "orage", 96: "orage avec grêle", 99: "violent orage avec grêle" };

async function toolMeteo(args) {
  const ville = String(args?.ville || "").trim();
  if (!ville) return "Erreur : ville manquante.";
  const name = ville.split(",")[0].trim();
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=fr&format=json`).then(r => r.json()).catch(() => null);
  const hint = ville.includes(",") ? ville.split(",").slice(1).join(",").trim().toLowerCase() : "";
  const list = g?.results || [];
  const place = (hint && list.find(p => `${p.country || ""} ${p.admin1 || ""} ${p.country_code || ""}`.toLowerCase().includes(hint))) || list[0];
  if (!place) return `Ville introuvable : ${ville}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=7`;
  const w = await fetch(url).then(r => r.json()).catch(() => null);
  if (!w?.current) return "Le service météo ne répond pas pour le moment.";
  const c = w.current, d = w.daily;
  const lines = [
    `Lieu : ${place.name}${place.admin1 ? ", " + place.admin1 : ""}, ${place.country || ""} (heure locale ${c.time}, fuseau ${w.timezone})`,
    `Maintenant : ${c.temperature_2m}°C (ressenti ${c.apparent_temperature}°C), ${WMO[c.weather_code] || "code " + c.weather_code}, humidité ${c.relative_humidity_2m}%, vent ${c.wind_speed_10m} km/h, précipitations ${c.precipitation} mm`,
    "Prévisions :",
    ...d.time.map((day, i) => `- ${day} : ${WMO[d.weather_code[i]] || d.weather_code[i]}, min ${d.temperature_2m_min[i]}°C / max ${d.temperature_2m_max[i]}°C, pluie ${d.precipitation_probability_max[i] ?? "?"}% (${d.precipitation_sum[i]} mm), vent max ${d.wind_speed_10m_max[i]} km/h`),
    "Source : Open-Meteo (open-meteo.com)",
  ];
  return lines.join("\n");
}

async function toolYoutube(args) {
  const q = String(args?.requete || "").trim(); if (!q) return "Erreur : requête vide.";
  try {
    const r = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(q) + "&hl=fr", { headers: { "Accept-Language": "fr-FR,fr;q=0.9", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" } });
    const html = await r.text();
    const out = [], seen = new Set();
    const parts = html.split('"videoRenderer":{"videoId":"').slice(1);
    for (const part of parts) {
      const id = part.slice(0, 11); if (!/^[\w-]{11}$/.test(id) || seen.has(id)) continue; seen.add(id);
      const chunk = part.slice(0, 8000);
      const tm = chunk.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/), om = chunk.match(/"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
      let title = tm ? tm[1] : "", ch = om ? om[1] : ""; try { title = JSON.parse('"' + title + '"'); ch = JSON.parse('"' + ch + '"'); } catch {}
      out.push(`- ${title || "(sans titre)"}${ch ? " — chaîne : " + ch : ""} — https://www.youtube.com/watch?v=${id}`);
      if (out.length >= 5) break;
    }
    if (!out.length) return "Aucune vidéo trouvée. Réessaie avec d'autres mots.";
    return "Vidéos trouvées (choisis la plus officielle, de préférence la chaîne de l'éditeur, et mets son lien tel quel dans ta réponse) :\n" + out.join("\n");
  } catch (e) { return "Recherche YouTube impossible : " + e.message; }
}
async function toolSearch(args, env) {
  const q = String(args?.requete || "").trim();
  if (!q) return "Erreur : requête vide.";
  const { r, error } = await callOpenRouter(env, list(env, "LLMMS_SEARCH_MODEL", SEARCH_MODELS), {
    stream: false,
    plugins: [{ id: "web", max_results: 6 }],
    messages: [
      { role: "system", content: `Nous sommes le ${new Date().toISOString().slice(0, 10)}. Fais une recherche web et rapporte les faits trouvés, précis et à jour (chiffres, dates, noms), en citant chaque source. Pas d'avis, juste les faits.` },
      { role: "user", content: q },
    ],
  });
  if (error) return "Recherche impossible : " + error;
  const j = await r.json().catch(() => null);
  const m = j?.choices?.[0]?.message;
  if (!m) return "Aucun résultat.";
  const seen = new Set();
  const sources = (m.annotations || []).filter(a => a.type === "url_citation" && a.url_citation?.url).map(a => a.url_citation)
    .filter(u => !seen.has(u.url) && seen.add(u.url)).slice(0, 8).map(u => `- [${(u.title || u.url).replace(/[\[\]]/g, "")}](${u.url})`);
  return `${m.content || ""}${sources.length ? "\n\nSources :\n" + sources.join("\n") : ""}`;
}

// ---------- Analyse d'un jeu Roblox (API publiques Roblox + vision) ----------
const UA = { "User-Agent": "Mozilla/5.0 (llmms ia)", Accept: "application/json" };
async function getJson(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
const VISION_MODELS = ["google/gemini-2.5-flash", "openai/gpt-5-mini"];

async function toolRoblox(args, env) {
  const nom = String(args?.nom || "").trim();
  if (!nom) return "Erreur : nom du jeu manquant.";
  let universeId = null, found = null;
  try {
    const sr = await getJson(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(nom)}&pageType=all&sessionId=${Date.now()}`);
    for (const g of sr?.searchResults || []) for (const it of g.contents || []) { if (!found && it.universeId) { found = it; universeId = it.universeId; } }
  } catch (e) { return `Recherche du jeu impossible sur Roblox (${e.message}). Utilise recherche_web à la place.`; }
  if (!universeId) return `Aucun jeu Roblox trouvé pour « ${nom} ». Essaie un autre nom ou utilise recherche_web.`;
  let info = {}, thumbs = [];
  try { info = (await getJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`))?.data?.[0] || {}; } catch {}
  try { thumbs = ((await getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=10&defaults=true&size=768x432&format=Png&isCircular=false`))?.data?.[0]?.thumbnails || []).map(t => t.imageUrl).filter(Boolean).slice(0, 8); } catch {}
  const head = [
    `Jeu : ${info.name || found?.name || nom} (universeId ${universeId}${info.rootPlaceId ? ", placeId " + info.rootPlaceId : ""})`,
    `Lien : https://www.roblox.com/games/${info.rootPlaceId || ""}`,
    info.creator ? `Créateur : ${info.creator.name} (${info.creator.type})` : "",
    info.visits != null ? `Visites : ${info.visits.toLocaleString("fr-FR")} · joueurs en ce moment : ${info.playing ?? "?"} · favoris : ${info.favoritedCount ?? "?"} · max par serveur : ${info.maxPlayers ?? "?"}` : "",
    info.genre ? `Genre : ${info.genre}` : "",
    info.updated ? `Dernière mise à jour : ${String(info.updated).slice(0, 10)}` : "",
    info.description ? `Description officielle :\n${String(info.description).slice(0, 2500)}` : "",
  ].filter(Boolean).join("\n");
  if (!thumbs.length) return head + "\n\n(Aucune capture d'écran disponible.)";
  const { r, error } = await callOpenRouter(env, list(env, "LLMMS_VISION_MODEL", VISION_MODELS), {
    stream: false,
    messages: [
      { role: "system", content: "Tu analyses des captures d'écran officielles d'un jeu Roblox pour qu'un développeur puisse reconstruire le jeu à l'identique. Sois exhaustif et précis, en français, en Markdown." },
      { role: "user", content: [
        { type: "text", text: `${head}\n\nDécris en détail, capture par capture puis en synthèse : 1) la map (disposition vue de dessus, zones, bâtiments, bases, chemins, décor, dimensions estimées en studs, matériaux, couleurs en hex, éclairage/ciel) ; 2) l'interface (chaque bouton, compteur, menu, popup : position en % de l'écran, taille, couleurs hex, coins, contours, icônes, textes EXACTS) ; 3) les objets/personnages/PNJ/animaux visibles et leur style ; 4) les mécaniques de jeu que l'on devine (boucle de jeu, économie, prix, rareté, vol, etc.) ; 5) ce qui fait le style du jeu.` },
        ...thumbs.map(u => ({ type: "image_url", image_url: { url: u } })),
      ] },
    ],
  });
  if (error) return head + `\n\nCaptures : ${thumbs.length} trouvées, mais l'analyse d'image a échoué (${error}).`;
  const j = await r.json().catch(() => null);
  const txt = j?.choices?.[0]?.message?.content || "";
  return `${head}\n\nAnalyse des ${thumbs.length} captures d'écran officielles :\n${txt}`;
}

async function* runTool(body, env) {
  const name = body?.name, args = body?.args || {};
  let out;
  try {
    out = name === "video_youtube" ? await toolYoutube(args) : name === "meteo" ? await toolMeteo(args) : name === "analyse_jeu_roblox" ? await toolRoblox(args, env) : name === "recherche_web" ? await toolSearch(args, env) : "Outil inconnu.";
  } catch (e) { out = "Erreur de l'outil : " + String(e?.message || e); }
  yield { t: "text", v: out };
  yield { t: "done", message: { role: "tool", content: out }, finish: "stop" };
}

const LANG_NOTE = l => `\n\nLangue : réponds TOUJOURS en ${l}, quelle que soit la langue du message (sauf si l'utilisateur demande explicitement une autre langue). Les noms d'API, de services et le code restent tels quels.`;
const SEARCH_NOTE = `\n\nRefaire ou s'inspirer d'un jeu Roblox existant (ex. « un jeu style Steal an Egg », « refais la même map que … ») : fais une VRAIE enquête avant de construire. 1) analyse_jeu_roblox avec le nom du jeu (description officielle + captures d'écran analysées : map, UI, couleurs) ; 2) plusieurs recherche_web ciblées : wiki/fandom du jeu (objets, prix, raretés, mécaniques), vidéos YouTube de gameplay et de guides (titres, descriptions, ce qu'elles montrent), mises à jour récentes ; 3) si l'utilisateur a envoyé une vidéo de gameplay, c'est la meilleure source ; 4) écris un cahier des charges précis (map vue de dessus avec dimensions en studs, chaque élément d'UI avec position et textes, boucle de jeu, économie, chiffres) ; 5) reconstruis la même disposition de map, la même UI et les mêmes systèmes avec tes propres pièces et scripts (pas de copie de modèles/sons/logos d'origine ; nom de jeu à toi). Cite les sources à la fin.\nOutils internet : tu as « recherche_web », « analyse_jeu_roblox » et « meteo ». Utilise-les DÈS QUE la réponse dépend d'informations actuelles ou que tu n'es pas sûr (météo, actualité, prix, scores, horaires, dates de sortie, nouveautés Roblox, versions…). N'invente jamais une info récente. Quand tu as cherché, termine par une courte liste « Sources » avec les liens.`;

// Propria avec la tête du skin : Claude Opus 5.5 seulement pour le propriétaire (ses crédits), les autres passent sur les autres IA.
function ownerModels(body, tierKey, models) {
  if (tierKey === "propria" && body?._owner !== true) { const m = models.filter(x => !x.startsWith("anthropic/")); return m.length ? m : ["google/gemini-3-pro-preview", "google/gemini-2.5-pro"]; }
  return models;
}
function list(env, key, defaults) {
  const extra = String(env(key) || "").split(",").map(s => s.trim()).filter(Boolean);
  return [...new Set([...extra, ...defaults])];
}

export function precheck(env, code) {
  if (!env("OPENROUTER_API_KEY")) return { status: 500, error: "OPENROUTER_API_KEY manquante dans les variables d'environnement du site." };
  const ac = env("ACCESS_CODE");
  if (ac && code !== ac) return { status: 401, error: "code" };
  return null;
}

async function callOpenRouter(env, models, payload) {
  let lastErr = "";
  for (const model of models) {
    let r;
    try {
      r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
          "Content-Type": "application/json",
          "X-Title": "llmms ia",
        },
        body: JSON.stringify({ ...payload, model }),
      });
    } catch (e) { lastErr = String(e?.message || e); continue; }
    if (r.ok) return { r, model };
    lastErr = await r.text().catch(() => "");
    if (![400, 404, 502, 503].includes(r.status)) break;
  }
  let msg = lastErr;
  try { msg = JSON.parse(lastErr)?.error?.message || lastErr; } catch {}
  return { error: msg || "OpenRouter ne répond pas." };
}

function mergeReasoning(store, items) {
  for (const it of items || []) {
    const key = `${it.index ?? 0}:${it.type || ""}`;
    const cur = store.get(key);
    if (!cur) { store.set(key, { ...it }); continue; }
    for (const [k, v] of Object.entries(it)) {
      if ((k === "text" || k === "summary") && typeof v === "string") cur[k] = (cur[k] || "") + v;
      else if (v !== undefined && v !== null) cur[k] = v;
    }
  }
}

async function* runImage(body, env) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  yield { t: "think" };
  const { r, error } = await callOpenRouter(env, list(env, "OPENROUTER_IMAGE_MODEL", IMAGE_MODELS), {
    stream: false,
    modalities: ["image", "text"],
    messages: [{ role: "system", content: "Tu génères des images de grande qualité. Réponds par l'image demandée et une phrase courte en français." }, ...messages],
  });
  if (error) { yield { t: "error", v: error }; return; }
  yield { t: "model", v: "llmms ia image" };
  const j = await r.json().catch(() => null);
  const m = j?.choices?.[0]?.message;
  if (!m) { yield { t: "error", v: j?.error?.message || "Pas d'image reçue." }; return; }
  const text = typeof m.content === "string" ? m.content : "";
  if (text) yield { t: "text", v: text };
  const images = (m.images || []).map(i => i?.image_url?.url).filter(Boolean);
  for (const u of images) yield { t: "image", v: u };
  yield { t: "done", message: { role: "assistant", content: text || (images.length ? "Voici votre création." : "Je n'ai pas réussi à générer l'image, reformule ta demande.") }, finish: "stop" };
}

// Version « passe-plat » : le serveur ne lit pas la réponse, il la transmet telle quelle au navigateur.
// Beaucoup moins de calcul côté serveur (indispensable sur Netlify Edge, limité en temps de calcul).
// Niveau d'effort choisi par l'utilisateur : "fast" (rapide), "normal", "max" (réflexion maximale)
function effortOf(body, tier, mode) {
  if (body?.effort === "max" || (tier.persona === "propria" && body?.effort !== "fast")) return "high";
  if (body?.effort === "fast") return tier.effort ? "low" : null;
  if (mode === "solve") return tier.effort ? "low" : null; // devoirs : réponse rapide (Effort max garde la réflexion maximale)
  if (!tier.effort) return null;
  // discussion normale (pas du code) : réflexion moyenne = réponses bien plus rapides ; « Effort max » garde le maximum
  return (body?.light || (!tier.only && !["roblox", "dev", "review", "plan", "vision", "solve"].includes(mode))) && tier.effort === "high" ? "medium" : tier.effort;
}
const EFFORT_MAX = `

=== Mode EFFORT MAX activé par l'utilisateur ===
Prends tout le temps de réflexion nécessaire. Analyse la demande sous tous les angles, envisage plusieurs approches et choisis la meilleure, vérifie chaque fait, chaque calcul et chaque ligne de code, anticipe les cas limites. Livre la réponse la plus complète, juste et soignée possible (mais sans blabla inutile).`;
export async function startChat(body, env) {
  const mode = ["chat", "dev", "roblox", "image", "review", "plan", "vision", "tool", "solve"].includes(body?.mode) ? body.mode : "chat";
  if (mode === "image") return { events: runImage(body, env) };
  if (mode === "tool") return { events: runTool(body, env) };

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) return { events: (async function* () { yield { t: "error", v: "Aucun message." }; })() };
  const extTools = !["review", "plan", "vision", "solve"].includes(mode) && Array.isArray(body?.tools) ? body.tools : [];
  const studioTools = extTools.length;
  const search = (body?.search || TIERS[String(body?.tier)]?.search) && !["review", "plan", "vision", "solve"].includes(mode);
  const allTools = [...extTools, ...(search ? BUILTIN_TOOLS : [])];
  const tools = allTools.length ? allTools : undefined;
  const lang = typeof body?.lang === "string" && /^[\p{L} ()-]{2,30}$/u.test(body.lang) ? body.lang : "";
  const tierKey = Object.hasOwn(TIERS, String(body?.tier)) ? String(body.tier) : "5.5";
  const tier = TIERS[tierKey];
  const name = `llmms ia ${tier.label || tierKey}`;

  const kit = tier.roblox && mode !== "image" ? `\n\n${KIT}` : "";
  const modeText = (tier.only ? `${MODES[tier.only]}\n\nTu es llmms ia Studio, le modèle spécialisé UNIQUEMENT dans le développement Roblox Studio : tout ce que tu fais est pensé pour Roblox (si on te demande autre chose, réponds brièvement puis ramène vers Roblox).` : tier.roblox && mode !== "roblox" ? `${MODES[mode]}\n\nTu es aussi le modèle spécial Roblox Studio de llmms ia :\n${ROBLOX}` : MODES[mode]) + (tier.persona && PERSONAS[tier.persona] ? `\n\n${PERSONAS[tier.persona]}` : "") + kit;
  const plan = typeof body?.plan === "string" && body.plan.trim() ? `\n\nPlan technique établi par l'architecte (suis-le, améliore-le si tu vois mieux) :\n${body.plan.slice(0, 20000)}` : "";
  const spec = typeof body?.spec === "string" && body.spec.trim() ? `\n\nCahier des charges de la vidéo (analyse détaillée des images) — c'est la RÉFÉRENCE : reproduis disposition, proportions, couleurs (hex), textes mot pour mot, UI et gameplay le plus fidèlement possible, puis soigne les finitions (rendu plus propre) sans changer ce qui est montré :\n${body.spec.slice(0, 30000)}` : "";
  const system = mode === "review" ? `${REVIEW}\n\n${ROBLOX}${kit}` : mode === "plan" ? `${PLAN}\n\n${ROBLOX}${kit}` : mode === "vision" ? (body?.target === "roblox" ? `${VISION}\n\n${ROBLOX}` : VISION) : mode === "solve" ? SOLVE : `${BASE.replaceAll("{NAME}", name)}\n\n${MASTER}\n\n${modeText}${spec}${plan}${search ? SEARCH_NOTE : ""}${lang ? LANG_NOTE(lang) : ""}` + (tools
    ? (studioTools ? `\n\nÉtat : Roblox Studio est CONNECTÉ (${studioTools} outils). Utilise-les pour construire directement.` : (mode === "roblox" ? `\n\nÉtat : Roblox Studio n'est pas connecté pour l'instant.` : ""))
    : (mode === "roblox" ? `\n\nÉtat : Roblox Studio n'est pas connecté pour l'instant.` : ""));

  const { r, error } = await callOpenRouter(env, ownerModels(body, tierKey, list(env, "LLMMS_MODEL_" + tierKey.replace(".", "_"), tier.models)), {
    stream: true,
    max_tokens: body?.effort === "max" ? 64000 : body?.effort === "fast" ? Math.min(tier.max, 16000) : body?.light ? 64000 : tier.max,
    ...(effortOf(body, tier, mode) ? { reasoning: { effort: effortOf(body, tier, mode) } } : {}),
    ...(tier.strict ? { llmms_strict: true } : {}),
    messages: [{ role: "system", content: system + (body?.effort === "max" || (String(body?.tier) === "propria" && body?.effort !== "fast") ? EFFORT_MAX : "") }, ...messages],
    ...(tools ? { tools, tool_choice: "auto", parallel_tool_calls: false } : {}),
  });
  if (error) return { events: (async function* () { yield { t: "error", v: error }; })() };
  return { stream: r.body, name };
}

export async function* runChat(body, env) {
  const mode = ["chat", "dev", "roblox", "image", "review", "plan", "vision", "tool", "solve"].includes(body?.mode) ? body.mode : "chat";
  if (mode === "image") { yield* runImage(body, env); return; }
  if (mode === "tool") { yield* runTool(body, env); return; }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (!messages.length) { yield { t: "error", v: "Aucun message." }; return; }
  const extTools = !["review", "plan", "vision", "solve"].includes(mode) && Array.isArray(body?.tools) ? body.tools : [];
  const studioTools = extTools.length;
  const search = (body?.search || TIERS[String(body?.tier)]?.search) && !["review", "plan", "vision", "solve"].includes(mode);
  const allTools = [...extTools, ...(search ? BUILTIN_TOOLS : [])];
  const tools = allTools.length ? allTools : undefined;
  const lang = typeof body?.lang === "string" && /^[\p{L} ()-]{2,30}$/u.test(body.lang) ? body.lang : "";
  const tierKey = Object.hasOwn(TIERS, String(body?.tier)) ? String(body.tier) : "5.5";
  const tier = TIERS[tierKey];
  const name = `llmms ia ${tier.label || tierKey}`;

  const kit = tier.roblox && mode !== "image" ? `\n\n${KIT}` : "";
  const modeText = (tier.only ? `${MODES[tier.only]}\n\nTu es llmms ia Studio, le modèle spécialisé UNIQUEMENT dans le développement Roblox Studio : tout ce que tu fais est pensé pour Roblox (si on te demande autre chose, réponds brièvement puis ramène vers Roblox).` : tier.roblox && mode !== "roblox" ? `${MODES[mode]}\n\nTu es aussi le modèle spécial Roblox Studio de llmms ia :\n${ROBLOX}` : MODES[mode]) + (tier.persona && PERSONAS[tier.persona] ? `\n\n${PERSONAS[tier.persona]}` : "") + kit;
  const plan = typeof body?.plan === "string" && body.plan.trim() ? `\n\nPlan technique établi par l'architecte (suis-le, améliore-le si tu vois mieux) :\n${body.plan.slice(0, 20000)}` : "";
  const spec = typeof body?.spec === "string" && body.spec.trim() ? `\n\nCahier des charges de la vidéo (analyse détaillée des images) — c'est la RÉFÉRENCE : reproduis disposition, proportions, couleurs (hex), textes mot pour mot, UI et gameplay le plus fidèlement possible, puis soigne les finitions (rendu plus propre) sans changer ce qui est montré :\n${body.spec.slice(0, 30000)}` : "";
  const system = mode === "review" ? `${REVIEW}\n\n${ROBLOX}${kit}` : mode === "plan" ? `${PLAN}\n\n${ROBLOX}${kit}` : mode === "vision" ? (body?.target === "roblox" ? `${VISION}\n\n${ROBLOX}` : VISION) : mode === "solve" ? SOLVE : `${BASE.replaceAll("{NAME}", name)}\n\n${MASTER}\n\n${modeText}${spec}${plan}${search ? SEARCH_NOTE : ""}${lang ? LANG_NOTE(lang) : ""}` + (tools
    ? (studioTools ? `\n\nÉtat : Roblox Studio est CONNECTÉ (${studioTools} outils). Utilise-les pour construire directement.` : (mode === "roblox" ? `\n\nÉtat : Roblox Studio n'est pas connecté pour l'instant.` : ""))
    : (mode === "roblox" ? `\n\nÉtat : Roblox Studio n'est pas connecté pour l'instant.` : ""));

  const { r, error } = await callOpenRouter(env, ownerModels(body, tierKey, list(env, "LLMMS_MODEL_" + tierKey.replace(".", "_"), tier.models)), {
    stream: true,
    max_tokens: body?.effort === "max" ? 64000 : body?.effort === "fast" ? Math.min(tier.max, 16000) : tier.max,
    ...(effortOf(body, tier, mode) ? { reasoning: { effort: effortOf(body, tier, mode) } } : {}),
    ...(tier.strict ? { llmms_strict: true } : {}),
    messages: [{ role: "system", content: system + (body?.effort === "max" || (String(body?.tier) === "propria" && body?.effort !== "fast") ? EFFORT_MAX : "") }, ...messages],
    ...(tools ? { tools, tool_choice: "auto", parallel_tool_calls: false } : {}),
  });
  if (error) { yield { t: "error", v: error }; return; }
  yield { t: "model", v: name };

  let content = "", finish = null, saidThink = false;
  const calls = [];
  const reasoning = new Map();
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        if (j.error) { yield { t: "error", v: j.error.message || "Erreur du modèle." }; continue; }
        const ch = j.choices?.[0];
        if (!ch) continue;
        const d = ch.delta || {};
        if (d.reasoning_details?.length) {
          mergeReasoning(reasoning, d.reasoning_details);
          if (!saidThink) { saidThink = true; yield { t: "think" }; }
        } else if (d.reasoning && !saidThink) { saidThink = true; yield { t: "think" }; }
        if (d.content) { content += d.content; yield { t: "text", v: d.content }; }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? 0;
          if (!calls[i]) calls[i] = { id: "", type: "function", function: { name: "", arguments: "" } };
          const c = calls[i];
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) { c.function.name += tc.function.name; yield { t: "tool", v: c.function.name }; }
          if (tc.function?.arguments) c.function.arguments += tc.function.arguments;
        }
        if (ch.finish_reason) finish = ch.finish_reason;
      }
    }
  } catch {
    yield { t: "error", v: "Connexion coupée avec le modèle." };
  }

  const tool_calls = calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}` }));
  const message = { role: "assistant", content: content || null };
  if (tool_calls.length) message.tool_calls = tool_calls;
  if (reasoning.size) message.reasoning_details = [...reasoning.values()];
  yield { t: "done", message, finish };
}
