/**
 * js/superviseur.js
 * -------------------------------------------------------
 * Doit être chargé APRÈS js/config.js, js/sync.js et js/auth.js.
 */

(function () {
  'use strict';

  const session = window.NexiAuth.requireRole(['superviseur']);
  if (!session) return;

  let db = null;
  let ecole = null;

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function init() {
    setupTabs();
    setupSuggestionForm();
    loadAll(true);
  }

  function loadAll(forceNetwork) {
    window.NexiSync.pull(forceNetwork)
      .then(function (data) {
        db = data;
        const moi = (db.Utilisateurs || []).find(function (u) { return u.identifiant === session.identifiant; });
        ecole = (db.Ecoles || []).find(function (e) { return e.identifiantSuperviseur === session.identifiant; });

        const nomEtab = ecole ? ecole.nomEtablissement : (moi ? moi.ecole : 'Établissement');
        document.getElementById('etab-header').textContent = 'Bienvenue ' + (moi ? moi.nomCompte : session.identifiant);

        const mesEleves = getMesEleves();
        document.getElementById('etab-subheader').textContent =
          nomEtab + ' — ' + mesEleves.length + ' élèves' + (ecole ? ' / ' + ecole.maxEleves : '');

        renderMesEleves(mesEleves);
        renderStatistiques(mesEleves);
      })
      .catch(function (err) {
        toast('Erreur de synchronisation : ' + err.message);
      });
  }

  function getMesEleves() {
    const nomEtab = ecole ? ecole.nomEtablissement : null;
    if (!nomEtab) return [];
    return (db.Utilisateurs || []).filter(function (u) {
      return u.role === 'eleve' && u.ecole === nomEtab;
    });
  }

  function scoreMoyen(identifiant) {
    const resultats = (db.Resultats || []).filter(function (r) { return r.identifiant === identifiant; });
    if (resultats.length === 0) return null;
    const total = resultats.reduce(function (sum, r) { return sum + (parseFloat(r.score) || 0); }, 0);
    return Math.round((total / resultats.length) * 10) / 10;
  }

  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.add('hidden'); });
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      });
    });
  }

  function renderMesEleves(eleves) {
    const tbody = document.querySelector('#table-mes-eleves tbody');
    tbody.innerHTML = '';
    eleves.forEach(function (eleve) {
      const moyenne = scoreMoyen(eleve.identifiant);
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.innerHTML =
        '<td>' + escapeHtml(eleve.nomCompte) + '</td>' +
        '<td>' + escapeHtml(eleve.identifiant) + '</td>' +
        '<td>' + escapeHtml(eleve.classe) + '</td>' +
        '<td>' + (eleve.statut === 'bloque' ? '<span class="badge badge-red">Bloqué</span>' : '<span class="badge badge-green">Actif</span>') + '</td>' +
        '<td>' + (moyenne === null ? '—' : moyenne) + '</td>';
      tr.addEventListener('click', function () { afficherFicheEleve(eleve); });
      tbody.appendChild(tr);
    });
  }

  function afficherFicheEleve(eleve) {
    const resultats = (db.Resultats || []).filter(function (r) { return r.identifiant === eleve.identifiant; });
    const reponsesAff = (db.ReponsesAffinites || []).filter(function (r) { return r.identifiant === eleve.identifiant; });

    const fiche = document.getElementById('fiche-eleve');
    fiche.classList.remove('hidden');
    document.getElementById('fiche-eleve-nom').textContent = eleve.nomCompte + ' (' + eleve.identifiant + ')';

    let html = '<p><strong>Classe :</strong> ' + escapeHtml(eleve.classe) + ' — <strong>Inscrit le :</strong> ' + escapeHtml(eleve.dateInscription) + '</p>';
    html += '<h4>Défis passés</h4>';
    if (resultats.length === 0) {
      html += '<p>Aucun défi passé pour le moment.</p>';
    } else {
      html += '<table class="data-table"><thead><tr><th>Défi</th><th>Score</th><th>Temps</th><th>Date</th></tr></thead><tbody>';
      resultats.forEach(function (r) {
        const defi = (db.Defis || []).find(function (d) { return d.defiId === r.defiId; });
        html += '<tr><td>' + escapeHtml(defi ? defi.titre : r.defiId) + '</td><td>' + escapeHtml(r.score) + '</td><td>' + escapeHtml(r.tempsTotal) + 's</td><td>' + escapeHtml(r.date) + '</td></tr>';
      });
      html += '</tbody></table>';
    }

    html += '<h4>Profils d\'affinités</h4>';
    if (reponsesAff.length === 0) {
      html += '<p>Aucun questionnaire d\'affinités complété.</p>';
    } else {
      reponsesAff.forEach(function (r) {
        html += '<p><strong>' + escapeHtml(r.date) + ' :</strong> ' + escapeHtml(r.profilCalcule || 'Profil en cours de calcul') + '</p>';
      });
    }

    document.getElementById('fiche-eleve-contenu').innerHTML = html;
    fiche.scrollIntoView({ behavior: 'smooth' });
  }

  function renderStatistiques(eleves) {
    const container = document.getElementById('stats-contenu');
    if (eleves.length === 0) {
      container.innerHTML = '<p>Aucun élève pour le moment.</p>';
      return;
    }
    const moyennes = eleves
      .map(function (e) { return scoreMoyen(e.identifiant); })
      .filter(function (m) { return m !== null; });
    const moyenneGenerale = moyennes.length
      ? Math.round((moyennes.reduce(function (a, b) { return a + b; }, 0) / moyennes.length) * 10) / 10
      : '—';

    const totalDefisFaits = (db.Resultats || []).filter(function (r) {
      return eleves.some(function (e) { return e.identifiant === r.identifiant; });
    }).length;

    container.innerHTML =
      '<p><strong>Moyenne générale de l\'établissement :</strong> ' + moyenneGenerale + '</p>' +
      '<p><strong>Nombre total de défis complétés :</strong> ' + totalDefisFaits + '</p>' +
      '<p><strong>Taux de participation :</strong> ' + moyennes.length + ' / ' + eleves.length + ' élèves ont au moins un résultat enregistré.</p>';
  }

  function setupSuggestionForm() {
    document.getElementById('btn-send-suggestion').addEventListener('click', function () {
      const nom = document.getElementById('sugg-nom').value.trim();
      const classe = document.getElementById('sugg-classe').value.trim();
      const identifiant = document.getElementById('sugg-identifiant').value.trim();

      if (!nom || !identifiant) {
        toast('Merci de renseigner au moins le nom et l\'identifiant souhaité.');
        return;
      }

      db.Suggestions = db.Suggestions || [];
      db.Suggestions.push({
        ecole: ecole ? ecole.nomEtablissement : '',
        nomSuggere: nom,
        classeSuggere: classe,
        identifiantSouhaite: identifiant,
        statut: 'EnAttente',
        date: new Date().toISOString().slice(0, 10)
      });

      window.NexiSync.doPushNow(db)
        .then(function () {
          toast('Suggestion envoyée à l\'administrateur.');
          document.getElementById('sugg-nom').value = '';
          document.getElementById('sugg-classe').value = '';
          document.getElementById('sugg-identifiant').value = '';
        })
        .catch(function (err) {
          toast('Échec de l\'envoi : ' + err.message);
        });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
