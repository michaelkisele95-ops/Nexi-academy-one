/**
 * NEXI ONE - Backend Google Apps Script
 * -------------------------------------------------------
 * Ce script est le SEUL endroit qui touche directement le Google Sheet.
 * Il ne répond QU'aux requêtes POST envoyées par la fonction Vercel
 * (api/execute-script.js), jamais directement au navigateur des élèves.
 *
 * Le mot de passe secret (APP_SECRET) doit être identique à celui
 * configuré côté Vercel (variable d'environnement APP_SECRET).
 * Ici, on le stocke dans les "Script Properties" du projet Apps Script
 * (Extensions > Propriétés du projet > Propriétés du script),
 * PAS en dur dans le code, pour pouvoir le changer sans redéployer.
 *
 * INSTALLATION RAPIDE :
 * 1. Ouvre ton Google Sheet "NEXI_ONE_DB".
 * 2. Extensions > Apps Script, colle ce fichier (remplace Code.gs).
 * 3. Extensions > Propriétés du projet > Propriétés du script :
 *      clé = APP_SECRET   valeur = Michael-nexi-magic
 * 4. Déployer > Nouveau déploiement > Type = Application Web
 *      - Exécuter en tant que : Moi
 *      - Qui a accès : Tout le monde
 * 5. Copie l'URL /exec obtenue => c'est ton APPS_SCRIPT_URL (pour Vercel).
 * 6. Crée les onglets listés dans SHEETS ci-dessous (voir README pour
 *    les colonnes exactes de chaque onglet).
 */

// Noms des onglets attendus dans le Google Sheet. Adapte si besoin,
// mais garde la cohérence avec js/sync.js côté client.
const SHEETS = {
  utilisateurs: 'Utilisateurs',
  ecoles: 'Ecoles',
  defis: 'Defis',
  questions: 'Questions',
  resultats: 'Resultats',
  affinites: 'Affinites',
  questionsAffinites: 'QuestionsAffinites',
  reponsesAffinites: 'ReponsesAffinites',
  suggestions: 'Suggestions'
};

function getSecret_() {
  return PropertiesService.getScriptProperties().getProperty('APP_SECRET');
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Point d'entrée unique. Reçoit uniquement des requêtes POST envoyées
 * par la Vercel Serverless Function (jamais directement par un navigateur).
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Requête vide' });
    }

    const body = JSON.parse(e.postData.contents);
    const secret = body.secret;
    const action = body.action;
    const payload = body.payload;

    if (!secret || secret !== getSecret_()) {
      return jsonResponse_({ ok: false, error: 'Non autorisé (secret invalide)' });
    }

    if (action === 'getAll') {
      return jsonResponse_({ ok: true, data: getAllData_() });
    }

    if (action === 'saveAll') {
      // Verrou pour éviter que deux téléphones n'écrivent en même temps
      // et se corrompent mutuellement les données.
      const lock = LockService.getScriptLock();
      const gotLock = lock.tryLock(10000); // attend jusqu'à 10s
      if (!gotLock) {
        return jsonResponse_({ ok: false, error: 'Sauvegarde en cours ailleurs, réessaie dans un instant.' });
      }
      try {
        saveAllData_(payload);
        return jsonResponse_({ ok: true });
      } finally {
        lock.releaseLock();
      }
    }

    return jsonResponse_({ ok: false, error: 'Action inconnue : ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Erreur serveur : ' + err.message });
  }
}

// Utile pour vérifier rapidement dans le navigateur que le déploiement
// répond (ne renvoie jamais de données sensibles).
function doGet(e) {
  return jsonResponse_({ ok: true, message: 'NEXI ONE backend actif. Utilise POST.' });
}

/* ---------------------------------------------------------------- */
/* Lecture / écriture générique feuille <-> tableau d'objets JSON     */
/* ---------------------------------------------------------------- */

function sheetToObjects_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  const headers = values[0];
  const rows = values.slice(1);
  return rows
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    });
}

function objectsToSheet_(sheetName, objects, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (objects.length === 0) return;
  const rows = objects.map(obj => headers.map(h => (obj[h] !== undefined ? obj[h] : '')));
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

// Défini une bonne fois pour toutes les colonnes de chaque onglet,
// dans l'ordre. Si tu ajoutes un champ côté app, ajoute-le ici aussi.
const HEADERS = {
  [SHEETS.utilisateurs]: ['identifiant', 'motDePasse', 'nomCompte', 'role', 'ecole', 'classe', 'statut', 'avatar', 'theme', 'dateInscription'],
  [SHEETS.ecoles]: ['nomEtablissement', 'identifiantSuperviseur', 'motDePasseSuperviseur', 'maxEleves'],
  [SHEETS.defis]: ['defiId', 'titre', 'description', 'visible', 'publie', 'dateDeclenchement'],
  [SHEETS.questions]: ['defiId', 'ordre', 'question', 'optionA', 'optionB', 'optionC', 'optionD', 'bonnesReponses', 'temps'],
  [SHEETS.resultats]: ['identifiant', 'defiId', 'score', 'tempsTotal', 'date', 'detailReponses'],
  [SHEETS.affinites]: ['affiniteId', 'titre', 'description', 'visible', 'publie'],
  [SHEETS.questionsAffinites]: ['affiniteId', 'ordre', 'question', 'optionA', 'optionB', 'optionC', 'optionD', 'axe'],
  [SHEETS.reponsesAffinites]: ['identifiant', 'affiniteId', 'date', 'detailReponses', 'profilCalcule'],
  [SHEETS.suggestions]: ['ecole', 'nomSuggere', 'classeSuggere', 'identifiantSouhaite', 'statut', 'date']
};

function getAllData_() {
  const data = {};
  Object.values(SHEETS).forEach(sheetName => {
    data[sheetName] = sheetToObjects_(sheetName);
  });
  return data;
}

function saveAllData_(payload) {
  if (!payload) throw new Error('Aucune donnée reçue à sauvegarder');
  Object.values(SHEETS).forEach(sheetName => {
    if (payload[sheetName] !== undefined) {
      objectsToSheet_(sheetName, payload[sheetName], HEADERS[sheetName]);
    }
  });
}
