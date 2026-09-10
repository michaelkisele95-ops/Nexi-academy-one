/**
 * js/eleve.js
 * -------------------------------------------------------
 * Doit être chargé APRÈS js/config.js, js/sync.js et js/auth.js.
 */

(function () {
  'use strict';

  const session = window.NexiAuth.requireRole(['eleve']);
  if (!session) return;

  let db = null;
  let moi = null;

  // état du défi en cours
  let currentDefi = null;
  let currentQuestions = [];
  let currentQuestionIndex = 0;
  let currentScore = 0;
  let currentAnswers = [];
  let questionTimer = null;
  let questionTimeLeft = 0;

  // état de l'affinité en cours
  let currentAffinite = null;
  let currentAffQuestions = [];
  let currentAffIndex = 0;
  let currentAffAnswers = [];

  const BOT_MESSAGES_WELCOME = [
    'Salut ! Prêt à relever un défi aujourd\'hui ?',
    'Bonjour ! N\'oublie pas de faire tes affinités du jour.',
    'Content de te revoir ! Qu\'est-ce qu\'on fait ?'
  ];
  const BOT_MESSAGES_ENCOURAGE = [
    'Pas grave, on apprend de ses erreurs, continue !',
    'Presque ! La prochaine question est pour toi.',
    'Courage, tu peux le faire !'
  ];

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
    setupNav();
    setupBot();
    setupProfilForm();
    loadAll(true);
    window.NexiSync.startAutoSync(function (data) {
      db = data;
      moi = (db.Utilisateurs || []).find(function (u) { return u.identifiant === session.identifiant; });
    });
  }

  function loadAll(forceNetwork) {
    window.NexiSync.pull(forceNetwork)
      .then(function (data) {
        db = data;
        moi = (db.Utilisateurs || []).find(function (u) { return u.identifiant === session.identifiant; });
        document.getElementById('eleve-welcome').textContent =
          'Bienvenue ' + (moi ? (moi.nomCompte || moi.identifiant) : session.identifiant);
        prefillProfil();
      })
      .catch(function (err) {
        toast('Erreur de synchronisation : ' + err.message);
      });
  }

  /* ---------------- Navigation entre écrans ---------------- */

  function showView(viewName) {
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.add('hidden'); });
    const el = document.getElementById('view-' + viewName);
    if (el) el.classList.remove('hidden');

    if (viewName === 'defis') renderListeDefis();
    if (viewName === 'affinites') renderListeAffinites();
    if (viewName === 'progression') renderProgression();
    if (viewName === 'classement') renderClassement();
  }

  function setupNav() {
    document.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { showView(btn.dataset.view); });
    });
  }

  /* ---------------- Nexi Bot ---------------- */

  function setupBot() {
    document.getElementById('nexi-bot').addEventListener('click', function () {
      const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const jour = jours[new Date().getDay()];
      const message = BOT_MESSAGES_WELCOME[Math.floor(Math.random() * BOT_MESSAGES_WELCOME.length)];
      document.getElementById('nexi-bot-bubble').textContent =
        'Bonjour ! Nous sommes ' + jour + '. ' + message;
    });
  }

  function botSay(message) {
    document.getElementById('nexi-bot-bubble').textContent = message;
  }

  /* ---------------- Liste des défis ---------------- */

  function renderListeDefis() {
    const container = document.getElementById('liste-defis');
    container.innerHTML = '';

    const defisPublies = (db.Defis || []).filter(function (d) {
      return d.visible === 'Visible' && d.publie === 'Publié';
    });

    const dejaFaits = new Set(
      (db.Resultats || [])
        .filter(function (r) { return r.identifiant === session.identifiant; })
        .map(function (r) { return r.defiId; })
    );

    if (defisPublies.length === 0) {
      container.innerHTML = '<p>Aucun défi disponible pour le moment. Reviens plus tard !</p>';
      return;
    }

    defisPublies.forEach(function (defi) {
      const dejaFait = dejaFaits.has(defi.defiId);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.background = '#f7faff';
      card.innerHTML =
        '<h4 style="margin:0 0 6px;">' + escapeHtml(defi.titre) + '</h4>' +
        '<p style="font-size:0.85rem;color:var(--nexi-muted);margin:0 0 10px;">' + escapeHtml(defi.description) + '</p>';

      const btn = document.createElement('button');
      btn.className = dejaFait ? 'btn-secondary' : 'btn-primary';
      btn.style.width = 'auto';
      btn.textContent = dejaFait ? 'Déjà complété' : 'Commencer';
      btn.disabled = dejaFait;
      if (!dejaFait) {
        btn.addEventListener('click', function () { lancerDefi(defi); });
      }
      card.appendChild(btn);
      container.appendChild(card);
    });
  }

  /* ---------------- Flux de jeu : DEFI ---------------- */

  function lancerDefi(defi) {
    currentDefi = defi;
    currentQuestions = (db.Questions || [])
      .filter(function (q) { return q.defiId === defi.defiId; })
      .sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
    currentQuestionIndex = 0;
    currentScore = 0;
    currentAnswers = [];

    showView('defi-jeu');
    document.getElementById('defi-jeu-titre').textContent = defi.titre;
    afficherQuestionDefi();
  }

  function afficherQuestionDefi() {
    clearInterval(questionTimer);
    document.getElementById('defi-jeu-feedback').textContent = '';

    if (currentQuestionIndex >= currentQuestions.length) {
      terminerDefi();
      return;
    }

    const q = currentQuestions[currentQuestionIndex];
    document.getElementById('defi-jeu-question').innerHTML =
      '<p style="font-weight:700;margin-top:14px;">Question ' + (currentQuestionIndex + 1) + ' / ' + currentQuestions.length + '</p>' +
      '<p>' + escapeHtml(q.question) + '</p>';

    const optionsContainer = document.getElementById('defi-jeu-options');
    optionsContainer.innerHTML = '';
    ['A', 'B', 'C', 'D'].forEach(function (lettre) {
      const texte = q['option' + lettre];
      if (!texte) return;
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.marginBottom = '8px';
      btn.style.textAlign = 'left';
      btn.textContent = lettre + '. ' + texte;
      btn.addEventListener('click', function () { repondreDefi(lettre); });
      optionsContainer.appendChild(btn);
    });

    questionTimeLeft = parseInt(q.temps, 10) || 30;
    updateTimerDisplay();
    questionTimer = setInterval(function () {
      questionTimeLeft -= 1;
      updateTimerDisplay();
      if (questionTimeLeft <= 0) {
        clearInterval(questionTimer);
        repondreDefi(null); // temps écoulé = pas de réponse
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    document.getElementById('defi-jeu-timer').textContent = questionTimeLeft + 's';
  }

  function repondreDefi(lettreChoisie) {
    clearInterval(questionTimer);
    const q = currentQuestions[currentQuestionIndex];
    const bonnesReponses = String(q.bonnesReponses || '').split(';').map(function (s) { return s.trim().toUpperCase(); });
    const estCorrecte = lettreChoisie !== null && bonnesReponses.indexOf(lettreChoisie.toUpperCase()) !== -1;

    currentAnswers.push({ question: q.question, reponse: lettreChoisie, correcte: estCorrecte });

    if (estCorrecte) {
      currentScore += 1;
      document.getElementById('defi-jeu-feedback').style.color = 'var(--nexi-green)';
      document.getElementById('defi-jeu-feedback').textContent = 'Bonne réponse !';
    } else {
      document.getElementById('defi-jeu-feedback').style.color = 'var(--nexi-red)';
      document.getElementById('defi-jeu-feedback').textContent = 'Mauvaise réponse.';
      botSay(BOT_MESSAGES_ENCOURAGE[Math.floor(Math.random() * BOT_MESSAGES_ENCOURAGE.length)]);
    }

    currentQuestionIndex += 1;
    setTimeout(afficherQuestionDefi, 1200);
  }

  function terminerDefi() {
    const scoreSur20 = currentQuestions.length
      ? Math.round((currentScore / currentQuestions.length) * 20 * 10) / 10
      : 0;

    db.Resultats = db.Resultats || [];
    db.Resultats.push({
      identifiant: session.identifiant,
      defiId: currentDefi.defiId,
      score: scoreSur20,
      tempsTotal: '',
      date: new Date().toISOString().slice(0, 10),
      detailReponses: JSON.stringify(currentAnswers)
    });

    window.NexiSync.doPushNow(db)
      .then(function () {
        showView('defi-resultat');
        document.getElementById('resultat-titre').textContent = currentDefi.titre + ' - Terminé !';
        document.getElementById('resultat-score').textContent =
          'Score : ' + currentScore + ' / ' + currentQuestions.length + ' (' + scoreSur20 + '/20)';
        if (scoreSur20 >= 12) lancerConfettis();
      })
      .catch(function (err) {
        toast('Résultat non sauvegardé : ' + err.message);
      });
  }

  function lancerConfettis() {
    const layer = document.getElementById('confetti-layer');
    const couleurs = ['#0b3d91', '#29c5d6', '#ffc93c', '#2fbf71', '#e5484d'];
    for (let i = 0; i < 60; i++) {
      const conf = document.createElement('div');
      const couleur = couleurs[Math.floor(Math.random() * couleurs.length)];
      conf.style.position = 'absolute';
      conf.style.width = '8px';
      conf.style.height = '8px';
      conf.style.background = couleur;
      conf.style.left = Math.random() * 100 + 'vw';
      conf.style.top = '-10px';
      conf.style.opacity = '0.9';
      conf.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      conf.style.transition = 'transform 1.8s ease-in, top 1.8s ease-in';
      layer.appendChild(conf);
      setTimeout(function () {
        conf.style.top = '100vh';
        conf.style.transform = 'rotate(' + (Math.random() * 720) + 'deg)';
      }, 20);
      setTimeout(function () { conf.remove(); }, 2200);
    }
  }

  /* ---------------- Liste des affinités ---------------- */

  function renderListeAffinites() {
    const container = document.getElementById('liste-affinites');
    container.innerHTML = '';

    const affPubliees = (db.Affinites || []).filter(function (a) {
      return a.visible === 'Visible' && a.publie === 'Publié';
    });

    if (affPubliees.length === 0) {
      container.innerHTML = '<p>Aucun questionnaire d\'affinités disponible pour le moment.</p>';
      return;
    }

    affPubliees.forEach(function (aff) {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.background = '#f7faff';
      card.innerHTML =
        '<h4 style="margin:0 0 6px;">' + escapeHtml(aff.titre) + '</h4>' +
        '<p style="font-size:0.85rem;color:var(--nexi-muted);margin:0 0 10px;">' + escapeHtml(aff.description) + '</p>';
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.style.width = 'auto';
      btn.textContent = 'Répondre';
      btn.addEventListener('click', function () { lancerAffinite(aff); });
      card.appendChild(btn);
      container.appendChild(card);
    });
  }

  function lancerAffinite(aff) {
    currentAffinite = aff;
    currentAffQuestions = (db.QuestionsAffinites || [])
      .filter(function (q) { return q.affiniteId === aff.affiniteId; })
      .sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
    currentAffIndex = 0;
    currentAffAnswers = [];

    showView('affinite-jeu');
    document.getElementById('aff-jeu-titre').textContent = aff.titre;
    afficherQuestionAffinite();
  }

  function afficherQuestionAffinite() {
    if (currentAffIndex >= currentAffQuestions.length) {
      terminerAffinite();
      return;
    }
    const q = currentAffQuestions[currentAffIndex];
    document.getElementById('aff-jeu-question').innerHTML =
      '<p style="font-weight:700;margin-top:14px;">Question ' + (currentAffIndex + 1) + ' / ' + currentAffQuestions.length + '</p>' +
      '<p>' + escapeHtml(q.question) + '</p>';

    const optionsContainer = document.getElementById('aff-jeu-options');
    optionsContainer.innerHTML = '';
    ['A', 'B', 'C', 'D'].forEach(function (lettre) {
      const texte = q['option' + lettre];
      if (!texte) return;
      const btn = document.createElement('button');
      btn.className = 'btn-secondary';
      btn.style.display = 'block';
      btn.style.width = '100%';
      btn.style.marginBottom = '8px';
      btn.style.textAlign = 'left';
      btn.textContent = lettre + '. ' + texte;
      btn.addEventListener('click', function () {
        currentAffAnswers.push({ question: q.question, reponse: lettre, axe: q.axe });
        currentAffIndex += 1;
        afficherQuestionAffinite();
      });
      optionsContainer.appendChild(btn);
    });
  }

  function terminerAffinite() {
    // Calcul de profil simplifié : l'axe le plus souvent choisi devient le profil dominant.
    const compteurAxes = {};
    currentAffAnswers.forEach(function (a) {
      if (!a.axe) return;
      compteurAxes[a.axe] = (compteurAxes[a.axe] || 0) + 1;
    });
    let profilDominant = 'Profil équilibré';
    let max = 0;
    Object.keys(compteurAxes).forEach(function (axe) {
      if (compteurAxes[axe] > max) { max = compteurAxes[axe]; profilDominant = axe; }
    });

    db.ReponsesAffinites = db.ReponsesAffinites || [];
    db.ReponsesAffinites.push({
      identifiant: session.identifiant,
      affiniteId: currentAffinite.affiniteId,
      date: new Date().toISOString().slice(0, 10),
      detailReponses: JSON.stringify(currentAffAnswers),
      profilCalcule: profilDominant
    });

    window.NexiSync.doPushNow(db)
      .then(function () {
        toast('Merci ! Ton profil du jour : ' + profilDominant);
        showView('accueil');
      })
      .catch(function (err) {
        toast('Réponses non sauvegardées : ' + err.message);
      });
  }

  /* ---------------- Profil ---------------- */

  function prefillProfil() {
    if (!moi) return;
    document.getElementById('profil-nom').value = moi.nomCompte || '';
    document.getElementById('profil-avatar').value = moi.avatar || '';
    document.getElementById('profil-theme').value = moi.theme || 'bleu';
  }

  function setupProfilForm() {
    document.getElementById('btn-save-profil').addEventListener('click', function () {
      if (!moi) return;
      moi.nomCompte = document.getElementById('profil-nom').value.trim() || moi.nomCompte;
      moi.avatar = document.getElementById('profil-avatar').value.trim();
      moi.theme = document.getElementById('profil-theme').value;

      window.NexiSync.doPushNow(db)
        .then(function () { toast('Profil mis à jour.'); })
        .catch(function (err) { toast('Échec de la sauvegarde : ' + err.message); });
    });
  }

  /* ---------------- Progression ---------------- */

  function renderProgression() {
    const container = document.getElementById('progression-contenu');
    const mesResultats = (db.Resultats || []).filter(function (r) { return r.identifiant === session.identifiant; });
    const mesAffinites = (db.ReponsesAffinites || []).filter(function (r) { return r.identifiant === session.identifiant; });

    if (mesResultats.length === 0 && mesAffinites.length === 0) {
      container.innerHTML = '<p>Tu n\'as pas encore de progression. Lance-toi dans un défi !</p>';
      return;
    }

    let html = '<p><strong>Défis complétés :</strong> ' + mesResultats.length + '</p>';
    html += '<p><strong>Questionnaires d\'affinités faits :</strong> ' + mesAffinites.length + '</p>';
    if (mesResultats.length > 0) {
      html += '<table class="data-table"><thead><tr><th>Défi</th><th>Score</th><th>Date</th></tr></thead><tbody>';
      mesResultats.forEach(function (r) {
        const defi = (db.Defis || []).find(function (d) { return d.defiId === r.defiId; });
        html += '<tr><td>' + escapeHtml(defi ? defi.titre : r.defiId) + '</td><td>' + escapeHtml(r.score) + '/20</td><td>' + escapeHtml(r.date) + '</td></tr>';
      });
      html += '</tbody></table>';
    }
    container.innerHTML = html;
  }

  /* ---------------- Classement ---------------- */

  function renderClassement() {
    const tbody = document.querySelector('#table-classement tbody');
    tbody.innerHTML = '';

    const eleves = (db.Utilisateurs || []).filter(function (u) { return u.role === 'eleve'; });
    const classement = eleves.map(function (e) {
      const resultats = (db.Resultats || []).filter(function (r) { return r.identifiant === e.identifiant; });
      const moyenne = resultats.length
        ? resultats.reduce(function (s, r) { return s + (parseFloat(r.score) || 0); }, 0) / resultats.length
        : 0;
      return { identifiant: e.identifiant, moyenne: Math.round(moyenne * 10) / 10 };
    }).sort(function (a, b) { return b.moyenne - a.moyenne; });

    classement.forEach(function (c, index) {
      const tr = document.createElement('tr');
      const estMoi = c.identifiant === session.identifiant;
      tr.style.fontWeight = estMoi ? '800' : 'normal';
      tr.style.color = estMoi ? 'var(--nexi-blue)' : 'inherit';
      tr.innerHTML = '<td>' + (index + 1) + '</td><td>' + escapeHtml(c.identifiant) + (estMoi ? ' (toi)' : '') + '</td><td>' + c.moyenne + '</td>';
      tbody.appendChild(tr);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
