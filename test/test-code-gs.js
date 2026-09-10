/**
 * Test local (Node, via vm) du fichier google-apps-script/Code.gs.
 * On simule les objets globaux fournis par l'environnement Google Apps
 * Script (SpreadsheetApp, PropertiesService, LockService, ContentService)
 * pour vérifier la logique métier SANS avoir besoin d'un vrai compte Google.
 * Exécuter avec : node test/test-code-gs.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; console.log('OK   -', message); }
  else { failed++; console.log('FAIL -', message); }
}

// ---- Mock d'une feuille de calcul en mémoire ----
function makeMockSpreadsheet() {
  const sheets = {}; // nom -> tableau de tableaux (values), ligne 0 = en-têtes

  function makeSheetObject(name) {
    return {
      getDataRange: function () {
        return { getValues: function () { return sheets[name].map(function (r) { return r.slice(); }); } };
      },
      clearContents: function () { sheets[name] = []; },
      getRange: function (row, col, numRows, numCols) {
        return {
          setValues: function (values) {
            values.forEach(function (rowValues, i) {
              const targetRow = row - 1 + i;
              while (sheets[name].length <= targetRow) sheets[name].push([]);
              sheets[name][targetRow] = rowValues.slice();
            });
          }
        };
      }
    };
  }

  return {
    _sheets: sheets,
    getSheetByName: function (name) {
      if (!sheets[name]) return null;
      return makeSheetObject(name);
    },
    insertSheet: function (name) {
      sheets[name] = [];
      return makeSheetObject(name);
    }
  };
}

function buildSandbox(secret) {
  const mockSs = makeMockSpreadsheet();
  const sandbox = {
    console: console,
    PropertiesService: {
      getScriptProperties: function () {
        return { getProperty: function (key) { return key === 'APP_SECRET' ? secret : null; } };
      }
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return mockSs; }
    },
    LockService: {
      getScriptLock: function () {
        return { tryLock: function () { return true; }, releaseLock: function () {} };
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: function (text) {
        return {
          _text: text,
          setMimeType: function () { return this; }
        };
      }
    }
  };
  sandbox.global = sandbox;
  return { sandbox: sandbox, mockSs: mockSs };
}

function run() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'google-apps-script', 'Code.gs'), 'utf8');
  const SECRET = 'Michael-nexi-magic';
  const { sandbox, mockSs } = buildSandbox(SECRET);
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'Code.gs' });

  // 1. secret invalide -> refusé
  {
    const result = JSON.parse(vm.runInContext(
      'JSON.stringify(doPost({postData:{contents: JSON.stringify({secret:"faux",action:"getAll"})}})._text)',
      sandbox
    ));
    const parsed = JSON.parse(result);
    assert(parsed.ok === false, 'Secret invalide refusé par doPost');
  }

  // 2. getAll sur des feuilles vides -> tableaux vides pour chaque onglet
  {
    const out = vm.runInContext(
      'doPost({postData:{contents: JSON.stringify({secret:"' + SECRET + '",action:"getAll"})}})._text',
      sandbox
    );
    const parsed = JSON.parse(out);
    assert(parsed.ok === true, 'getAll répond ok:true sur feuilles vides');
    assert(Array.isArray(parsed.data.Utilisateurs) && parsed.data.Utilisateurs.length === 0, 'Utilisateurs vide au départ');
  }

  // 3. saveAll écrit bien les données, puis getAll les relit correctement
  {
    const payload = {
      Utilisateurs: [
        { identifiant: 'admin', motDePasse: 'secret1', nomCompte: 'Admin', role: 'admin', ecole: '', classe: '', statut: 'actif', avatar: '', theme: '', dateInscription: '2026-09-10' },
        { identifiant: 'aline_k', motDePasse: 'nexi2026', nomCompte: 'Aline Kasongo', role: 'eleve', ecole: 'Collège Imara', classe: '5e', statut: 'actif', avatar: '3', theme: 'bleu', dateInscription: '2026-09-10' }
      ],
      Defis: [{ defiId: 'defi_1', titre: 'Logique 1', description: 'Test', visible: 'Visible', publie: 'Publié', dateDeclenchement: '' }]
    };

    const saveOut = vm.runInContext(
      'doPost({postData:{contents: ' + JSON.stringify(JSON.stringify({ secret: SECRET, action: 'saveAll', payload: payload })) + '}})._text',
      sandbox
    );
    const saveParsed = JSON.parse(saveOut);
    assert(saveParsed.ok === true, 'saveAll accepte et écrit le payload');

    const reloadOut = vm.runInContext(
      'doPost({postData:{contents: JSON.stringify({secret:"' + SECRET + '",action:"getAll"})}})._text',
      sandbox
    );
    const reloadParsed = JSON.parse(reloadOut);
    assert(reloadParsed.data.Utilisateurs.length === 2, 'Les 2 utilisateurs sont bien relus après saveAll');
    assert(reloadParsed.data.Utilisateurs[1].identifiant === 'aline_k', 'Les champs de chaque utilisateur sont bien préservés');
    assert(reloadParsed.data.Defis[0].titre === 'Logique 1', 'Le défi enregistré est bien relu');
  }

  // 4. Verrou : si tryLock échoue, saveAll renvoie une erreur propre (pas de crash)
  {
    const { sandbox: sandbox2 } = buildSandbox(SECRET);
    sandbox2.LockService.getScriptLock = function () {
      return { tryLock: function () { return false; }, releaseLock: function () {} };
    };
    vm.createContext(sandbox2);
    vm.runInContext(code, sandbox2, { filename: 'Code.gs' });
    const out = vm.runInContext(
      'doPost({postData:{contents: JSON.stringify({secret:"' + SECRET + '",action:"saveAll",payload:{Utilisateurs:[]}})}})._text',
      sandbox2
    );
    const parsed = JSON.parse(out);
    assert(parsed.ok === false, 'Verrou indisponible => erreur propre sans crash');
  }

  // 5. action inconnue
  {
    const out = vm.runInContext(
      'doPost({postData:{contents: JSON.stringify({secret:"' + SECRET + '",action:"bidon"})}})._text',
      sandbox
    );
    const parsed = JSON.parse(out);
    assert(parsed.ok === false && /inconnue/.test(parsed.error), 'Action inconnue renvoie une erreur explicite');
  }

  console.log('\n' + passed + ' tests réussis, ' + failed + ' échoués.');
  if (failed > 0) process.exit(1);
}

run();
