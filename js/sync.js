/**
 * js/sync.js
 * -------------------------------------------------------
 * Toute la logique de synchronisation avec le Google Sheet passe
 * PAR LA PASSERELLE VERCEL (window.NEXI_CONFIG.API_URL), jamais
 * directement vers Google, et sans jamais transporter de secret.
 *
 * Ce fichier doit être chargé APRÈS js/config.js et AVANT tout
 * script qui utilise window.NexiSync (admin.js, eleve.js,
 * superviseur.js, auth.js...), sinon tu obtiens l'erreur :
 *   Uncaught ReferenceError: NexiSync is not defined
 *
 * Le Google Sheet est la SEULE source de vérité : rien n'est jamais
 * conservé de façon permanente sur le téléphone. Un identifiant et un
 * mot de passe corrects suffisent pour retrouver ses données depuis
 * n'importe quel appareil.
 */

(function () {
  'use strict';

  // Cache mémoire (perdu à la fermeture de l'onglet/appli) : sert juste
  // à éviter de rappeler le serveur à chaque clic pendant une session.
  // Ce n'est jamais la source de vérité.
  let _cache = null;
  let _autoSyncTimer = null;

  function getApiUrl() {
    if (!window.NEXI_CONFIG || !window.NEXI_CONFIG.API_URL) {
      throw new Error('window.NEXI_CONFIG.API_URL manquant. Vérifie que js/config.js est chargé avant js/sync.js.');
    }
    return window.NEXI_CONFIG.API_URL;
  }

  /**
   * Récupère TOUTES les données à jour depuis le Google Sheet
   * (en passant par la passerelle Vercel).
   * @param {boolean} forceNetwork - si false, peut renvoyer le cache mémoire s'il existe.
   * @returns {Promise<Object>} l'objet complet { Utilisateurs: [...], Defis: [...], ... }
   */
  function pull(forceNetwork) {
    if (!forceNetwork && _cache) {
      return Promise.resolve(_cache);
    }

    return fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getAll' })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Erreur réseau (' + response.status + ') lors de la synchronisation.');
        }
        return response.json();
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.error || 'Erreur inconnue lors de la lecture des données.');
        }
        _cache = result.data;
        return _cache;
      });
  }

  /**
   * Envoie l'intégralité du jeu de données mis à jour vers le Google Sheet.
   * @param {Object} payload - objet complet à écrire (mêmes clés que celui reçu par pull()).
   * @returns {Promise<void>}
   */
  function doPushNow(payload) {
    if (!payload || typeof payload !== 'object') {
      return Promise.reject(new Error('doPushNow() attend un objet de données à sauvegarder.'));
    }

    return fetch(getApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'saveAll', payload: payload })
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Erreur réseau (' + response.status + ') lors de la sauvegarde.');
        }
        return response.json();
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.error || 'Erreur inconnue lors de la sauvegarde.');
        }
        // On met à jour le cache mémoire local avec ce qu'on vient d'envoyer,
        // pour un affichage instantané en attendant le prochain pull().
        _cache = payload;
        return true;
      });
  }

  /**
   * Démarre une synchronisation automatique en arrière-plan : toutes les
   * X millisecondes, on relit le Sheet et on appelle onUpdate(data) si
   * les données ont changé (par exemple parce qu'un autre téléphone a
   * publié un nouveau défi). C'est ce qui fait qu'une action sur le
   * téléphone 1 finit par s'afficher sur les téléphones 2, 3, etc.
   * @param {(data: Object) => void} onUpdate
   * @param {number} [intervalMs]
   */
  function startAutoSync(onUpdate, intervalMs) {
    stopAutoSync();
    const delay = intervalMs || (window.NEXI_CONFIG && window.NEXI_CONFIG.AUTO_SYNC_INTERVAL) || 20000;
    _autoSyncTimer = setInterval(function () {
      pull(true)
        .then(function (data) {
          if (typeof onUpdate === 'function') onUpdate(data);
        })
        .catch(function (err) {
          console.warn('Synchronisation automatique échouée :', err.message);
        });
    }, delay);
  }

  function stopAutoSync() {
    if (_autoSyncTimer) {
      clearInterval(_autoSyncTimer);
      _autoSyncTimer = null;
    }
  }

  /** Vide le cache mémoire (à appeler à la déconnexion). */
  function clearCache() {
    _cache = null;
    stopAutoSync();
  }

  // API publique du module, disponible globalement pour les autres scripts.
  window.NexiSync = {
    pull: pull,
    doPushNow: doPushNow,
    startAutoSync: startAutoSync,
    stopAutoSync: stopAutoSync,
    clearCache: clearCache
  };
})();
