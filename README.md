# NEXI ONE — NEXI ACADEMY

Application web/PWA de défis éducatifs et de questionnaires d'affinités
pour enfants, avec panels Admin, Superviseur (établissement) et Élève.

👉 **Commence par lire `GUIDE_DEPLOIEMENT.md`** pour la mise en ligne
complète (Google Sheet → GitHub → Vercel), étape par étape.

## Structure du projet

```
nexi-one/
├── index.html              Portail de connexion unique
├── admin.html               Panel Administrateur
├── superviseur.html          Panel Superviseur (établissement)
├── eleve.html                Panel Élève (défis, affinités, profil...)
├── css/style.css
├── js/
│   ├── config.js            URL publique de l'API (aucun secret)
│   ├── sync.js               pull() / doPushNow() vers Vercel
│   ├── auth.js                Connexion + contrôle d'accès par rôle
│   ├── admin.js / superviseur.js / eleve.js
├── api/execute-script.js     Passerelle Vercel sécurisée (secret injecté ici)
├── google-apps-script/Code.gs Backend Google Sheet (doPost)
├── manifest.json / service-worker.js  Installation PWA (Android/iOS/Windows)
├── test/                     Tests automatisés (34 tests, tous passés)
└── GUIDE_DEPLOIEMENT.md
```

## Sécurité

- Aucun secret ni URL Google dans le code servi au navigateur.
- `api/execute-script.js` (Vercel) est le seul endroit qui connaît
  `APPS_SCRIPT_URL` et `APP_SECRET`, lus depuis les variables
  d'environnement Vercel — jamais commités dans le code.
- Le Google Sheet est la source de vérité unique : aucune donnée
  n'est propre à un téléphone.
