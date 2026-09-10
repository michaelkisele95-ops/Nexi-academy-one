/**
 * api/execute-script.js
 * -------------------------------------------------------
 * Passerelle Vercel Serverless (Node.js, format CommonJS).
 * C'est le SEUL endroit qui connaît APPS_SCRIPT_URL et APP_SECRET.
 * Le frontend (js/sync.js) n'appelle QUE cette fonction, jamais
 * Google directement, et n'a jamais accès aux valeurs secrètes.
 *
 * Variables d'environnement attendues sur Vercel (Project Settings
 * > Environment Variables) :
 *   APPS_SCRIPT_URL = https://script.google.com/macros/s/XXXX/exec
 *   APP_SECRET      = Michael-nexi-magic
 */

module.exports = async function handler(req, res) {
  // --- CORS : autorise le frontend à appeler cette fonction ---
  // En production, tu peux remplacer '*' par ton domaine exact
  // (ex: 'https://nexi-one.vercel.app') pour plus de sécurité.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Le navigateur envoie d'abord une requête OPTIONS (pre-flight CORS).
  // Il faut y répondre 200 sans rien faire d'autre.
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Méthode non autorisée, utilise POST.' });
    return;
  }

  try {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const APP_SECRET = process.env.APP_SECRET;

    if (!APPS_SCRIPT_URL || !APP_SECRET) {
      res.status(500).json({ ok: false, error: 'Configuration serveur incomplète (variables d\'environnement manquantes).' });
      return;
    }

    // req.body peut arriver déjà parsé (Vercel le fait par défaut pour
    // application/json) ou en chaîne selon la config ; on gère les deux.
    let clientBody = req.body;
    if (typeof clientBody === 'string') {
      clientBody = clientBody.length ? JSON.parse(clientBody) : {};
    }
    if (!clientBody || typeof clientBody !== 'object') {
      clientBody = {};
    }

    const { action, payload } = clientBody;

    if (!action) {
      res.status(400).json({ ok: false, error: 'Champ "action" manquant (ex: "getAll" ou "saveAll").' });
      return;
    }

    // On injecte le secret ICI, côté serveur uniquement. Le client
    // n'envoie jamais ce secret et ne le voit jamais.
    const upstreamBody = JSON.stringify({
      secret: APP_SECRET,
      action: action,
      payload: payload || null
    });

    const upstreamResponse = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: upstreamBody,
      redirect: 'follow' // Apps Script /exec renvoie souvent une redirection 302
    });

    const text = await upstreamResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      res.status(502).json({
        ok: false,
        error: 'Réponse invalide du script Google.',
        raw: text.slice(0, 500)
      });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Erreur passerelle : ' + err.message });
  }
};
