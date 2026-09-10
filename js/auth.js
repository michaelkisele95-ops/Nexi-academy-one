/**
 * js/auth.js
 * -------------------------------------------------------
 * Portail de connexion unique (Admin / Superviseur / Élève).
 * Doit être chargé APRÈS js/config.js et js/sync.js.
 *
 * Le rôle et l'identifiant de la personne connectée sont conservés
 * dans sessionStorage UNIQUEMENT pour la session en cours (onglet
 * ouvert) : ce n'est jamais la source de vérité, seulement un
 * raccourci pour ne pas re-taper le mot de passe en changeant de page
 * de l'app. À chaque connexion, tout est revérifié contre le Google
 * Sheet, depuis n'importe quel appareil.
 */

(function () {
  'use strict';

  const ADMIN_IDENTIFIANT = 'ADEM'; // identifiant réservé à l'admin global (à personnaliser)

  function showPanel() {
    const landing = document.getElementById('landing-panel');
    const loginPanel = document.getElementById('login-panel');
    if (landing) landing.classList.add('hidden');
    if (loginPanel) loginPanel.classList.remove('hidden');
  }

  function setError(message) {
    const el = document.getElementById('login-error');
    if (el) {
      el.textContent = message || '';
      el.classList.toggle('hidden', !message);
    }
  }

  function setLoading(isLoading) {
    const btn = document.getElementById('btn-login');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Connexion...' : 'SE CONNECTER';
  }

  function handleLogin(event) {
    event.preventDefault();
    setError('');

    const identifiant = (document.getElementById('input-identifiant').value || '').trim();
    const motDePasse = (document.getElementById('input-password').value || '').trim();

    if (!identifiant || !motDePasse) {
      setError('Merci de renseigner l\'identifiant et le mot de passe.');
      return;
    }

    setLoading(true);

    // On force une lecture réseau (pas de cache) pour être sûr d'avoir
    // les tout derniers comptes créés/modifiés par l'admin.
    window.NexiSync.pull(true)
      .then(function (data) {
        const utilisateurs = data.Utilisateurs || [];
        const user = utilisateurs.find(function (u) {
          return String(u.identifiant) === identifiant && String(u.motDePasse) === motDePasse;
        });

        if (!user) {
          setError('Identifiant ou mot de passe incorrect.');
          setLoading(false);
          return;
        }

        if (String(user.statut).toLowerCase() === 'bloque' || String(user.statut).toLowerCase() === 'inactif') {
          setError('Ce compte est bloqué. Contacte ton établissement ou l\'administrateur.');
          setLoading(false);
          return;
        }

        // Session locale (juste pour cet onglet/appareil, pas une source de vérité).
        sessionStorage.setItem('nexi_identifiant', user.identifiant);
        sessionStorage.setItem('nexi_role', user.role);

        redirectByRole(user.role);
      })
      .catch(function (err) {
        setError('Impossible de se connecter : ' + err.message);
        setLoading(false);
      });
  }

  function redirectByRole(role) {
    switch (String(role).toLowerCase()) {
      case 'admin':
        window.location.href = 'admin.html';
        break;
      case 'superviseur':
        window.location.href = 'superviseur.html';
        break;
      case 'eleve':
      default:
        window.location.href = 'eleve.html';
        break;
    }
  }

  /**
   * À appeler en haut de admin.html / superviseur.html / eleve.html
   * pour vérifier qu'une session valide existe, sinon renvoyer au login.
   * @param {string[]} allowedRoles
   */
  function requireRole(allowedRoles) {
    const role = sessionStorage.getItem('nexi_role');
    const identifiant = sessionStorage.getItem('nexi_identifiant');
    if (!role || !identifiant || allowedRoles.indexOf(role) === -1) {
      window.location.href = 'index.html';
      return null;
    }
    return { role: role, identifiant: identifiant };
  }

  function logout() {
    window.NexiSync.clearCache();
    sessionStorage.removeItem('nexi_identifiant');
    sessionStorage.removeItem('nexi_role');
    window.location.href = 'index.html';
  }

  document.addEventListener('DOMContentLoaded', function () {
    const revealBtn = document.getElementById('btn-reveal-login');
    if (revealBtn) revealBtn.addEventListener('click', showPanel);

    const form = document.getElementById('login-form');
    if (form) form.addEventListener('submit', handleLogin);

    const logoutBtns = document.querySelectorAll('[data-action="logout"]');
    logoutBtns.forEach(function (btn) {
      btn.addEventListener('click', logout);
    });
  });

  window.NexiAuth = {
    requireRole: requireRole,
    logout: logout,
    ADMIN_IDENTIFIANT: ADMIN_IDENTIFIANT
  };
})();
