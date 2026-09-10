/**
 * Test local (Node) de api/execute-script.js SANS déployer sur Vercel.
 * On simule req/res et on remplace global.fetch pour vérifier que :
 *  - OPTIONS répond 200 avec les bons en-têtes CORS
 *  - GET est refusé (405)
 *  - une requête sans "action" est refusée (400)
 *  - une requête sans variables d'env est refusée (500)
 *  - une requête valide injecte bien le secret et transmet action/payload
 *  - une réponse non-JSON de Google est gérée proprement (502)
 * Exécuter avec : node test/test-execute-script.js
 */

process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/FAKE/exec';
process.env.APP_SECRET = 'Michael-nexi-magic';

const handler = require('../api/execute-script.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log('OK   -', message);
  } else {
    failed++;
    console.log('FAIL -', message);
  }
}

function mockRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    ended: false,
    setHeader: function (k, v) { res.headers[k] = v; },
    status: function (code) { res.statusCode = code; return res; },
    json: function (obj) { res.body = obj; res.ended = true; return res; },
    end: function () { res.ended = true; return res; }
  };
  return res;
}

async function run() {
  // 1. OPTIONS preflight
  {
    const req = { method: 'OPTIONS' };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 200, 'OPTIONS renvoie 200');
    assert(res.headers['Access-Control-Allow-Origin'] === '*', 'En-tête CORS Access-Control-Allow-Origin présent');
  }

  // 2. Méthode GET refusée
  {
    const req = { method: 'GET' };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 405, 'GET est refusé avec 405');
  }

  // 3. POST sans "action"
  {
    const req = { method: 'POST', body: {} };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 400, 'POST sans action renvoie 400');
  }

  // 4. Variables d'environnement manquantes
  {
    const savedUrl = process.env.APPS_SCRIPT_URL;
    delete process.env.APPS_SCRIPT_URL;
    const req = { method: 'POST', body: { action: 'getAll' } };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 500, 'Variables env manquantes renvoient 500');
    process.env.APPS_SCRIPT_URL = savedUrl;
  }

  // 5. Requête valide "getAll" : vérifie l'injection du secret et le forwarding
  {
    let capturedUrl = null;
    let capturedBody = null;
    global.fetch = async function (url, options) {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return {
        text: async () => JSON.stringify({ ok: true, data: { Utilisateurs: [] } })
      };
    };

    const req = { method: 'POST', body: { action: 'getAll' } };
    const res = mockRes();
    await handler(req, res);

    assert(capturedUrl === process.env.APPS_SCRIPT_URL, 'La requête part bien vers APPS_SCRIPT_URL');
    assert(capturedBody.secret === 'Michael-nexi-magic', 'Le secret est injecté côté serveur uniquement');
    assert(capturedBody.action === 'getAll', 'L\'action est bien transmise');
    assert(res.statusCode === 200 && res.body.ok === true, 'La réponse est renvoyée telle quelle au client');
  }

  // 6. Requête valide "saveAll" avec payload
  {
    let capturedBody = null;
    global.fetch = async function (url, options) {
      capturedBody = JSON.parse(options.body);
      return { text: async () => JSON.stringify({ ok: true }) };
    };

    const payload = { Utilisateurs: [{ identifiant: 'test', role: 'eleve' }] };
    const req = { method: 'POST', body: { action: 'saveAll', payload: payload } };
    const res = mockRes();
    await handler(req, res);

    assert(capturedBody.action === 'saveAll', 'Action saveAll transmise');
    assert(JSON.stringify(capturedBody.payload) === JSON.stringify(payload), 'Le payload est transmis intact');
    assert(res.body.ok === true, 'saveAll renvoie ok:true');
  }

  // 7. Réponse non-JSON de Google (ex: page d'erreur HTML) -> 502 propre
  {
    global.fetch = async function () {
      return { text: async () => '<html>Erreur Google</html>' };
    };
    const req = { method: 'POST', body: { action: 'getAll' } };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 502, 'Réponse non-JSON de Google gérée proprement (502)');
  }

  // 8. Body déjà en chaîne (cas où Vercel ne l'a pas parsé)
  {
    global.fetch = async function (url, options) {
      return { text: async () => JSON.stringify({ ok: true, data: {} }) };
    };
    const req = { method: 'POST', body: JSON.stringify({ action: 'getAll' }) };
    const res = mockRes();
    await handler(req, res);
    assert(res.statusCode === 200 && res.body.ok === true, 'Body reçu en chaîne JSON est correctement parsé');
  }

  console.log('\n' + passed + ' tests réussis, ' + failed + ' échoués.');
  if (failed > 0) process.exit(1);
}

run();
