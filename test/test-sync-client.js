/**
 * Test local (Node, via vm) de js/sync.js : on simule `window` et `fetch`
 * pour vérifier pull(), doPushNow() et le cache mémoire, sans navigateur.
 * Exécuter avec : node test/test-sync-client.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('OK   -', msg); }
  else { failed++; console.log('FAIL -', msg); }
}

async function run() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'sync.js'), 'utf8');

  let fetchCalls = [];
  const sandbox = {
    console: console,
    window: {
      NEXI_CONFIG: { API_URL: 'https://example.vercel.app/api/execute-script', AUTO_SYNC_INTERVAL: 20000 }
    },
    fetch: function (url, options) {
      fetchCalls.push({ url: url, body: JSON.parse(options.body) });
      const body = JSON.parse(options.body);
      if (body.action === 'getAll') {
        return Promise.resolve({
          ok: true,
          json: function () { return Promise.resolve({ ok: true, data: { Utilisateurs: [{ identifiant: 'x' }] } }); }
        });
      }
      if (body.action === 'saveAll') {
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ ok: true }); } });
      }
      return Promise.reject(new Error('action inconnue dans le mock'));
    },
    setInterval: setInterval,
    clearInterval: clearInterval
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'sync.js' });

  assert(typeof sandbox.window.NexiSync === 'object', 'window.NexiSync est bien défini après chargement');
  assert(typeof sandbox.window.NexiSync.pull === 'function', 'pull() est exposée');
  assert(typeof sandbox.window.NexiSync.doPushNow === 'function', 'doPushNow() est exposée');

  // pull() force réseau
  const data1 = await sandbox.window.NexiSync.pull(true);
  assert(data1.Utilisateurs.length === 1, 'pull(true) renvoie bien les données du mock');
  assert(fetchCalls.length === 1 && fetchCalls[0].body.action === 'getAll', 'pull() envoie action=getAll');

  // pull() sans forcer réutilise le cache (pas de nouvel appel réseau)
  const callsBefore = fetchCalls.length;
  const data2 = await sandbox.window.NexiSync.pull(false);
  assert(fetchCalls.length === callsBefore, 'pull(false) réutilise le cache mémoire, pas de nouvel appel réseau');
  assert(data2.Utilisateurs.length === 1, 'Le cache renvoie les mêmes données');

  // doPushNow()
  await sandbox.window.NexiSync.doPushNow({ Utilisateurs: [{ identifiant: 'y' }, { identifiant: 'z' }] });
  const lastCall = fetchCalls[fetchCalls.length - 1];
  assert(lastCall.body.action === 'saveAll', 'doPushNow() envoie action=saveAll');
  assert(lastCall.body.payload.Utilisateurs.length === 2, 'doPushNow() transmet le payload complet');

  // Après un push, un pull(false) doit refléter le nouveau cache local
  const data3 = await sandbox.window.NexiSync.pull(false);
  assert(data3.Utilisateurs.length === 2, 'Le cache est mis à jour immédiatement après doPushNow()');

  // clearCache() vide bien le cache (un prochain pull(false) redemande le réseau)
  sandbox.window.NexiSync.clearCache();
  const callsBeforeClear = fetchCalls.length;
  await sandbox.window.NexiSync.pull(false);
  assert(fetchCalls.length === callsBeforeClear + 1, 'clearCache() force un nouvel appel réseau au prochain pull()');

  console.log('\n' + passed + ' tests réussis, ' + failed + ' échoués.');
  if (failed > 0) process.exit(1);
}

run();
