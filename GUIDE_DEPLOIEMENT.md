# NEXI ONE — Guide de déploiement (sécurisé)

Ce guide t'accompagne de VS Code jusqu'à une application en ligne, sécurisée,
où le Google Sheet est la **seule source de vérité** : n'importe quel
téléphone avec le bon identifiant/mot de passe voit exactement les mêmes
données que les autres.

Toutes les données ont été testées automatiquement avant livraison
(voir la section "Tests inclus" à la fin). 14 + 9 + 11 = 34 tests passent.

---

## 0. Ce qui a changé par rapport à ta version précédente

- **`config.js` / `APPS_SCRIPT_URL` / `APP_SECRET` ne sont plus jamais dans
  le code du navigateur.** Ils vivent uniquement dans les variables
  d'environnement de Vercel, lues côté serveur par `api/execute-script.js`.
- Le frontend (`js/sync.js`) n'appelle plus que **ta** fonction Vercel
  (`window.NEXI_CONFIG.API_URL`), jamais Google directement.
- `Code.gs` utilise maintenant `doPost(e)` (et plus `doGet`), avec un
  verrou (`LockService`) pour éviter que deux téléphones n'écrivent en
  même temps et se corrompent les données.
- L'ordre des scripts est corrigé partout : `config.js` → `sync.js` →
  `auth.js` → script de page (`admin.js`/`superviseur.js`/`eleve.js`).
  Plus d'erreur `NexiSync is not defined`.

---

## 1. Créer le Google Sheet (la base de données)

1. Va sur [sheets.google.com](https://sheets.google.com) et crée un nouveau
   classeur, nomme-le par exemple `NEXI_ONE_DB`.
2. Tu n'as **rien à créer manuellement** dans les onglets : le script les
   crée tout seul au premier `saveAll`. Tu peux laisser la feuille "Feuille 1"
   par défaut, elle ne sera pas utilisée.
3. Menu **Extensions > Apps Script**.
4. Supprime le contenu par défaut de `Code.gs` et colle le contenu du
   fichier `google-apps-script/Code.gs` fourni dans ce zip.
5. Menu **Extensions du projet (icône engrenage) > Propriétés du script**
   (ou "Project Settings" selon la langue) > **Ajouter une propriété du
   script** :
   - Clé : `APP_SECRET`
   - Valeur : `Michael-nexi-magic` (ou change-le, voir section 4)
6. Clique **Déployer > Nouveau déploiement**.
   - Type : **Application Web**
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
7. Autorise les permissions demandées (c'est ton propre script, sur ton
   propre compte).
8. Copie l'URL qui se termine par `/exec`. C'est ton **`APPS_SCRIPT_URL`**,
   garde-la de côté pour l'étape 3.

⚠️ Si tu modifies `Code.gs` plus tard, il faut faire **Déployer > Gérer
les déploiements > Modifier > Nouvelle version** pour que les changements
soient pris en compte par l'URL existante.

---

## 2. Ouvrir le projet dans VS Code

1. Dézippe `nexi-one.zip` où tu veux sur ton PC.
2. Ouvre le dossier `nexi-one` dans VS Code (`Fichier > Ouvrir le dossier`).
3. Tu peux tester l'affichage des pages HTML avec l'extension **Live
   Server**, mais la connexion et les données ne fonctionneront qu'une
   fois Vercel configuré (étapes 3-4).

---

## 3. Créer le dépôt GitHub

1. Dans VS Code, onglet **Contrôle de code source** (icône branche) >
   **Publier sur GitHub** (ou utilise `git init`, `git add .`,
   `git commit -m "Nexi One v1"` puis crée un dépôt sur github.com et
   fais `git remote add origin ...` + `git push`).
2. Vérifie bien que le fichier `.gitignore` fourni est présent : il
   empêche d'envoyer un éventuel fichier `.env` par erreur.
3. **Ne mets jamais** `APPS_SCRIPT_URL` ni `APP_SECRET` dans un fichier
   commité. Ils ne doivent exister que dans Vercel (étape suivante).

---

## 4. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com), connecte-toi avec GitHub.
2. **Add New > Project**, choisis le dépôt `nexi-one`.
3. Vercel détecte automatiquement `api/execute-script.js` comme fonction
   serverless et sert le reste (`index.html`, etc.) comme fichiers
   statiques. Aucune configuration de build n'est nécessaire.
4. Avant de cliquer sur **Deploy**, ouvre la section **Environment
   Variables** et ajoute :
   - `APPS_SCRIPT_URL` = l'URL `/exec` copiée à l'étape 1.
   - `APP_SECRET` = `Michael-nexi-magic` (doit être **identique** à la
     propriété du script Apps Script de l'étape 1.5).
5. Clique **Deploy**. Au bout de quelques secondes, Vercel te donne une
   URL du type `https://nexi-one-tonpseudo.vercel.app`.

### Relier le frontend à ton URL Vercel

1. Ouvre `js/config.js`.
2. Remplace :
   ```js
   API_URL: 'https://REMPLACE-PAR-TON-DOMAINE.vercel.app/api/execute-script',
   ```
   par ton URL réelle, par exemple :
   ```js
   API_URL: 'https://nexi-one-tonpseudo.vercel.app/api/execute-script',
   ```
3. Commit + push ce changement. Vercel redéploie automatiquement.

### Créer ton premier compte admin

Comme la base est vide au départ, connecte-toi une fois à
`https://ton-app.vercel.app/api/execute-script` n'est pas possible depuis
un navigateur (c'est une API POST, pas une page). Pour créer ton premier
identifiant admin, le plus simple est d'ouvrir le Google Sheet une fois
que l'onglet `Utilisateurs` a été créé (après un premier `saveAll`,
par exemple en essayant de créer un enfant depuis l'appli — ça échouera
poliment tant qu'il n'y a pas d'admin, mais ça crée les onglets), puis
d'ajouter directement une ligne dans l'onglet `Utilisateurs` :

| identifiant | motDePasse | nomCompte | role  | ... |
|-------------|-----------|-----------|-------|-----|
| ADEM        | tonMotDePasse | Administrateur | admin | ... |

Recharge la page de connexion : tu peux maintenant te connecter en admin
et créer le reste (enfants, superviseurs, défis...) directement depuis
l'application.

---

## 5. Installer l'app sur les téléphones (PWA)

- **Android / Chrome** : ouvrir l'URL Vercel, le navigateur propose
  "Ajouter à l'écran d'accueil".
- **iPhone / Safari** : ouvrir l'URL, bouton **Partager** > **Sur l'écran
  d'accueil**.
- **Windows / Edge** : icône d'installation dans la barre d'adresse.

Dans les 3 cas, l'app s'ouvre plein écran avec sa propre icône. Le
`manifest.json` et `service-worker.js` fournis gèrent ça automatiquement
— aucune configuration supplémentaire.

⚠️ Le service worker ne met en cache que les fichiers de l'application
(HTML/CSS/JS), jamais les données du Sheet : chaque connexion revérifie
toujours les identifiants et récupère les dernières données à jour.

---

## 6. Comment la synchronisation garantit "un compte, tous les téléphones"

- Il n'y a **aucune donnée stockée durablement sur le téléphone**
  (pas de `localStorage`). Seul `sessionStorage` garde "qui est connecté"
  pour la session en cours, et il est vidé à la déconnexion.
- Chaque action importante (créer un enfant, publier un défi, terminer
  un défi, répondre à un questionnaire d'affinités...) déclenche un
  `doPushNow()` qui réécrit l'intégralité des données dans le Google
  Sheet.
- Chaque page, à l'ouverture, fait un `pull(true)` qui relit tout depuis
  le Sheet. En plus, un rafraîchissement automatique toutes les 20
  secondes (`startAutoSync`) permet qu'une action faite sur le
  téléphone 1 finisse par apparaître sur les téléphones 2 et 3 sans
  qu'ils aient besoin de se déconnecter/reconnecter.
- Résultat : un identifiant + mot de passe correct suffit pour retrouver
  exactement les mêmes données depuis n'importe quel appareil.

---

## 7. Limites connues / pistes d'amélioration

- **NEXI BOT** : la version fournie est une animation CSS simple (bulle
  de dialogue + cercle animé), pas un modèle 3D. Un vrai bot 3D
  (three.js/Spline) demande des assets graphiques dédiés — dis-moi si tu
  veux qu'on l'ajoute dans une prochaine itération.
- **Icônes de l'app** : générées automatiquement à partir de ton logo
  `Nexi_Logo.png` (192×192 et 512×512). Tu peux les remplacer dans
  `icons/` si tu veux un rendu différent sur l'écran d'accueil.
- **Synchronisation "getAll/saveAll"** : simple et robuste pour un
  pilote (quelques dizaines à quelques centaines d'utilisateurs), mais
  réécrit l'intégralité du Sheet à chaque sauvegarde. Si le nombre
  d'utilisateurs grossit beaucoup, on pourra faire évoluer le backend
  vers des actions plus fines (ex: `addResult`, `addUser`) sans changer
  l'architecture de sécurité (Vercel reste la passerelle).
- **50 avatars enfants** : le catalogue d'avatars visible dans tes
  captures n'est pas encore intégré comme sélecteur visuel dans
  `eleve.html` (actuellement un simple champ numérique) — je peux le
  brancher si tu me fournis les images individuelles ou leur
  numérotation exacte.

---

## 8. Tests inclus (déjà exécutés avant livraison)

Dans le dossier `test/` :

- `test-execute-script.js` : 14 tests sur la passerelle Vercel (CORS,
  méthodes, injection du secret, gestion des erreurs Google).
- `test-code-gs.js` : 9 tests sur le backend Google Apps Script
  (sécurité du secret, lecture/écriture des onglets, verrou
  anti-collision).
- `test-sync-client.js` : 11 tests sur `js/sync.js` (pull/push, cache,
  synchronisation multi-appareils).

Pour les relancer toi-même (nécessite Node.js installé) :

```bash
node test/test-execute-script.js
node test/test-code-gs.js
node test/test-sync-client.js
```

Les 34 tests passent (`34 tests réussis, 0 échoués`).
