/**
 * js/admin.js
 * -------------------------------------------------------
 * Doit être chargé APRÈS js/config.js, js/sync.js et js/auth.js.
 * Toute la donnée transite par window.NexiSync (pull / doPushNow) :
 * ce fichier ne parle jamais directement à Google ni à Vercel.
 */

(function () {
  'use strict';

  const session = window.NexiAuth.requireRole(['admin']);
  if (!session) return; // requireRole redirige déjà vers index.html si invalide

  let db = null; // dernier jeu de données complet reçu du Sheet
  let questionCounter = 0;
  let affQuestionCounter = 0;

  function toast(message) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------------- Chargement initial ---------------- */

  function init() {
    document.getElementById('admin-welcome').textContent = 'Connecté en tant que ' + session.identifiant;
    setupTabs();
    setupChildForm();
    setupDefiForm();
    setupCsvImport();
    setupAffinitesForm();
    setupEtablissementForm();
    document.getElementById('btn-force-sync').addEventListener('click', function () {
      loadAll(true);
    });
    loadAll(true);
  }

  function loadAll(forceNetwork) {
    window.NexiSync.pull(forceNetwork)
      .then(function (data) {
        db = normalizeDb(data);
        renderChildren();
        renderDefis();
        renderAffinites();
        renderEtablissements();
        renderSuggestions();
      })
      .catch(function (err) {
        toast('Erreur de synchronisation : ' + err.message);
      });
  }

  // S'assure que toutes les clés existent même si le Sheet est encore vide.
  function normalizeDb(data) {
    const d = data || {};
    return {
      Utilisateurs: d.Utilisateurs || [],
      Ecoles: d.Ecoles || [],
      Defis: d.Defis || [],
      Questions: d.Questions || [],
      Resultats: d.Resultats || [],
      Affinites: d.Affinites || [],
      QuestionsAffinites: d.QuestionsAffinites || [],
      ReponsesAffinites: d.ReponsesAffinites || [],
      Suggestions: d.Suggestions || []
    };
  }

  function saveAll(successMessage) {
    return window.NexiSync.doPushNow(db)
      .then(function () {
        toast(successMessage || 'Enregistré avec succès.');
      })
      .catch(function (err) {
        toast('Échec de la sauvegarde : ' + err.message);
        throw err;
      });
  }

  /* ---------------- Onglets ---------------- */

  function setupTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(function (panel) {
          panel.classList.add('hidden');
        });
        document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
      });
    });
  }

  /* ---------------- Section ENFANTS ---------------- */

  function setupChildForm() {
    document.getElementById('btn-add-child').addEventListener('click', function () {
      const nom = document.getElementById('ch-nom').value.trim();
      const identifiant = document.getElementById('ch-identifiant').value.trim();
      const motDePasse = document.getElementById('ch-password').value.trim();

      if (!nom || !identifiant || !motDePasse) {
        toast('Merci de remplir les 3 champs.');
        return;
      }

      const identifiantExiste = db.Utilisateurs.some(function (u) {
        return String(u.identifiant) === identifiant;
      });
      if (identifiantExiste) {
        toast('Cet identifiant est déjà utilisé par une autre personne.');
        return;
      }

      db.Utilisateurs.push({
        identifiant: identifiant,
        motDePasse: motDePasse,
        nomCompte: nom,
        role: 'eleve',
        ecole: '',
        classe: '',
        statut: 'actif',
        avatar: '',
        theme: '',
        dateInscription: new Date().toISOString().slice(0, 10)
      });

      saveAll('Enfant "' + nom + '" créé.').then(function () {
        document.getElementById('ch-nom').value = '';
        document.getElementById('ch-identifiant').value = '';
        document.getElementById('ch-password').value = '';
        renderChildren();
      });
    });
  }

  function renderChildren() {
    const tbody = document.querySelector('#table-children tbody');
    tbody.innerHTML = '';
    const enfants = db.Utilisateurs.filter(function (u) { return u.role === 'eleve'; });

    enfants.forEach(function (enfant) {
      const tr = document.createElement('tr');
      const statutBadge = enfant.statut === 'bloque'
        ? '<span class="badge badge-red">Bloqué</span>'
        : '<span class="badge badge-green">Actif</span>';

      tr.innerHTML =
        '<td>' + escapeHtml(enfant.identifiant) + '</td>' +
        '<td>' + escapeHtml(enfant.nomCompte) + '</td>' +
        '<td>' + statutBadge + '</td>' +
        '<td></td>';

      const actionsTd = tr.querySelector('td:last-child');

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'btn-secondary';
      toggleBtn.textContent = enfant.statut === 'bloque' ? 'Débloquer' : 'Bloquer';
      toggleBtn.style.marginRight = '6px';
      toggleBtn.addEventListener('click', function () {
        enfant.statut = enfant.statut === 'bloque' ? 'actif' : 'bloque';
        saveAll('Statut mis à jour.').then(renderChildren);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Supprimer';
      deleteBtn.addEventListener('click', function () {
        if (!confirm('Supprimer définitivement ' + enfant.nomCompte + ' ?')) return;
        db.Utilisateurs = db.Utilisateurs.filter(function (u) { return u.identifiant !== enfant.identifiant; });
        saveAll('Enfant supprimé.').then(renderChildren);
      });

      actionsTd.appendChild(toggleBtn);
      actionsTd.appendChild(deleteBtn);
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Section DEFIS ---------------- */

  function setupDefiForm() {
    document.getElementById('btn-add-question').addEventListener('click', function () {
      addQuestionRow('defi-questions', questionCounter++);
    });
    addQuestionRow('defi-questions', questionCounter++); // une question de départ

    document.getElementById('btn-save-defi').addEventListener('click', function () {
      const titre = document.getElementById('defi-titre').value.trim();
      const description = document.getElementById('defi-description').value.trim();

      if (!titre) {
        toast('Merci de donner un titre au défi.');
        return;
      }

      const defiId = uid('defi');
      const questions = collectQuestions('defi-questions');

      if (questions.length === 0) {
        toast('Ajoute au moins une question.');
        return;
      }

      db.Defis.push({
        defiId: defiId,
        titre: titre,
        description: description,
        visible: 'Invisible',
        publie: 'Non publié',
        dateDeclenchement: ''
      });

      questions.forEach(function (q, index) {
        db.Questions.push(Object.assign({ defiId: defiId, ordre: index + 1 }, q));
      });

      saveAll('Défi "' + titre + '" créé.').then(function () {
        document.getElementById('defi-titre').value = '';
        document.getElementById('defi-description').value = '';
        document.getElementById('defi-questions').innerHTML = '';
        questionCounter = 0;
        addQuestionRow('defi-questions', questionCounter++);
        renderDefis();
      });
    });
  }

  function addQuestionRow(containerId, index) {
    const container = document.getElementById(containerId);
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.background = '#f7faff';
    wrap.dataset.qindex = index;
    wrap.innerHTML =
      '<div class="form-row"><label>Question ' + (index + 1) + '</label><input class="q-intitule"></div>' +
      '<div class="form-row"><label>Option A</label><input class="q-optA"></div>' +
      '<div class="form-row"><label>Option B</label><input class="q-optB"></div>' +
      '<div class="form-row"><label>Option C</label><input class="q-optC"></div>' +
      '<div class="form-row"><label>Option D</label><input class="q-optD"></div>' +
      '<div class="form-row"><label>Bonne(s) réponse(s) (ex: A ou A;C)</label><input class="q-bonnes"></div>' +
      '<div class="form-row"><label>Temps (secondes)</label><input class="q-temps" type="number" value="30"></div>';
    container.appendChild(wrap);
  }

  function collectQuestions(containerId) {
    const container = document.getElementById(containerId);
    const rows = container.querySelectorAll(':scope > div');
    const out = [];
    rows.forEach(function (row) {
      const question = row.querySelector('.q-intitule').value.trim();
      if (!question) return;
      out.push({
        question: question,
        optionA: row.querySelector('.q-optA').value.trim(),
        optionB: row.querySelector('.q-optB').value.trim(),
        optionC: row.querySelector('.q-optC').value.trim(),
        optionD: row.querySelector('.q-optD').value.trim(),
        bonnesReponses: row.querySelector('.q-bonnes').value.trim(),
        temps: parseInt(row.querySelector('.q-temps').value, 10) || 30
      });
    });
    return out;
  }

  function renderDefis() {
    const tbody = document.querySelector('#table-defis tbody');
    tbody.innerHTML = '';
    db.Defis.forEach(function (defi) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(defi.titre) + '</td>' +
        '<td>' + (defi.visible === 'Visible' ? '<span class="badge badge-green">Visible</span>' : '<span class="badge badge-red">Invisible</span>') + '</td>' +
        '<td>' + (defi.publie === 'Publié' ? '<span class="badge badge-green">Publié</span>' : '<span class="badge badge-yellow">Non publié</span>') + '</td>' +
        '<td></td>';

      const actionsTd = tr.querySelector('td:last-child');

      const toggleVisible = document.createElement('button');
      toggleVisible.className = 'btn-secondary';
      toggleVisible.style.marginRight = '6px';
      toggleVisible.textContent = defi.visible === 'Visible' ? 'Rendre invisible' : 'Rendre visible';
      toggleVisible.addEventListener('click', function () {
        defi.visible = defi.visible === 'Visible' ? 'Invisible' : 'Visible';
        saveAll('Visibilité mise à jour.').then(renderDefis);
      });

      const togglePublie = document.createElement('button');
      togglePublie.className = 'btn-primary';
      togglePublie.style.width = 'auto';
      togglePublie.style.marginTop = '0';
      togglePublie.textContent = defi.publie === 'Publié' ? 'Dépublier' : 'Publier';
      togglePublie.addEventListener('click', function () {
        defi.publie = defi.publie === 'Publié' ? 'Non publié' : 'Publié';
        saveAll('Publication mise à jour.').then(renderDefis);
      });

      actionsTd.appendChild(toggleVisible);
      actionsTd.appendChild(togglePublie);
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Import CSV ---------------- */

  function setupCsvImport() {
    document.getElementById('btn-import-csv').addEventListener('click', function () {
      const titre = document.getElementById('import-defi-titre').value.trim();
      const fileInput = document.getElementById('import-csv-file');

      if (!titre) {
        toast('Donne un titre au défi importé.');
        return;
      }
      if (!fileInput.files || fileInput.files.length === 0) {
        toast('Choisis un fichier CSV.');
        return;
      }

      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const rows = parseCsv(e.target.result);
          if (rows.length === 0) {
            toast('Le fichier CSV est vide ou mal formaté.');
            return;
          }

          const defiId = uid('defi');
          db.Defis.push({
            defiId: defiId,
            titre: titre,
            description: 'Importé depuis un fichier CSV.',
            visible: 'Invisible',
            publie: 'Non publié',
            dateDeclenchement: ''
          });

          rows.forEach(function (row, index) {
            db.Questions.push({
              defiId: defiId,
              ordre: index + 1,
              question: row[0] || '',
              optionA: row[1] || '',
              optionB: row[2] || '',
              optionC: row[3] || '',
              optionD: row[4] || '',
              bonnesReponses: row[5] || '',
              temps: parseInt(row[6], 10) || 30
            });
          });

          saveAll(rows.length + ' questions importées dans "' + titre + '".').then(function () {
            document.getElementById('import-defi-titre').value = '';
            fileInput.value = '';
            renderDefis();
          });
        } catch (err) {
          toast('Erreur de lecture du CSV : ' + err.message);
        }
      };
      reader.onerror = function () {
        toast('Impossible de lire le fichier.');
      };
      reader.readAsText(fileInput.files[0], 'UTF-8');
    });
  }

  /**
   * Parseur CSV simple : gère les virgules et les champs entre guillemets.
   * Ignore la première ligne (en-têtes).
   */
  function parseCsv(text) {
    const lines = text.split(/\r\n|\n|\r/).filter(function (l) { return l.trim() !== ''; });
    if (lines.length <= 1) return [];
    return lines.slice(1).map(parseCsvLine);
  }

  function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /* ---------------- Section AFFINITÉS ---------------- */

  function setupAffinitesForm() {
    document.getElementById('btn-add-aff-question').addEventListener('click', function () {
      addAffQuestionRow('aff-questions', affQuestionCounter++);
    });
    addAffQuestionRow('aff-questions', affQuestionCounter++);

    document.getElementById('btn-save-aff').addEventListener('click', function () {
      const titre = document.getElementById('aff-titre').value.trim();
      const description = document.getElementById('aff-description').value.trim();

      if (!titre) {
        toast('Merci de donner un titre au questionnaire.');
        return;
      }

      const affiniteId = uid('aff');
      const questions = collectAffQuestions('aff-questions');

      if (questions.length === 0) {
        toast('Ajoute au moins une question.');
        return;
      }

      db.Affinites.push({
        affiniteId: affiniteId,
        titre: titre,
        description: description,
        visible: 'Invisible',
        publie: 'Non publié'
      });

      questions.forEach(function (q, index) {
        db.QuestionsAffinites.push(Object.assign({ affiniteId: affiniteId, ordre: index + 1 }, q));
      });

      saveAll('Questionnaire d\'affinités "' + titre + '" créé.').then(function () {
        document.getElementById('aff-titre').value = '';
        document.getElementById('aff-description').value = '';
        document.getElementById('aff-questions').innerHTML = '';
        affQuestionCounter = 0;
        addAffQuestionRow('aff-questions', affQuestionCounter++);
        renderAffinites();
      });
    });
  }

  function addAffQuestionRow(containerId, index) {
    const container = document.getElementById(containerId);
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.style.background = '#f7faff';
    wrap.innerHTML =
      '<div class="form-row"><label>Question ' + (index + 1) + '</label><input class="aq-intitule"></div>' +
      '<div class="form-row"><label>Option A</label><input class="aq-optA"></div>' +
      '<div class="form-row"><label>Option B</label><input class="aq-optB"></div>' +
      '<div class="form-row"><label>Option C</label><input class="aq-optC"></div>' +
      '<div class="form-row"><label>Option D</label><input class="aq-optD"></div>' +
      '<div class="form-row"><label>Axe mesuré (ex: Créatif/Analytique)</label><input class="aq-axe"></div>';
    container.appendChild(wrap);
  }

  function collectAffQuestions(containerId) {
    const container = document.getElementById(containerId);
    const rows = container.querySelectorAll(':scope > div');
    const out = [];
    rows.forEach(function (row) {
      const question = row.querySelector('.aq-intitule').value.trim();
      if (!question) return;
      out.push({
        question: question,
        optionA: row.querySelector('.aq-optA').value.trim(),
        optionB: row.querySelector('.aq-optB').value.trim(),
        optionC: row.querySelector('.aq-optC').value.trim(),
        optionD: row.querySelector('.aq-optD').value.trim(),
        axe: row.querySelector('.aq-axe').value.trim()
      });
    });
    return out;
  }

  function renderAffinites() {
    const tbody = document.querySelector('#table-affinites tbody');
    tbody.innerHTML = '';
    db.Affinites.forEach(function (aff) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(aff.titre) + '</td>' +
        '<td>' + (aff.visible === 'Visible' ? '<span class="badge badge-green">Visible</span>' : '<span class="badge badge-red">Invisible</span>') + '</td>' +
        '<td>' + (aff.publie === 'Publié' ? '<span class="badge badge-green">Publié</span>' : '<span class="badge badge-yellow">Non publié</span>') + '</td>' +
        '<td></td>';

      const actionsTd = tr.querySelector('td:last-child');
      const toggleVisible = document.createElement('button');
      toggleVisible.className = 'btn-secondary';
      toggleVisible.style.marginRight = '6px';
      toggleVisible.textContent = aff.visible === 'Visible' ? 'Rendre invisible' : 'Rendre visible';
      toggleVisible.addEventListener('click', function () {
        aff.visible = aff.visible === 'Visible' ? 'Invisible' : 'Visible';
        saveAll('Mis à jour.').then(renderAffinites);
      });

      const togglePublie = document.createElement('button');
      togglePublie.className = 'btn-primary';
      togglePublie.style.width = 'auto';
      togglePublie.style.marginTop = '0';
      togglePublie.textContent = aff.publie === 'Publié' ? 'Dépublier' : 'Publier';
      togglePublie.addEventListener('click', function () {
        aff.publie = aff.publie === 'Publié' ? 'Non publié' : 'Publié';
        saveAll('Mis à jour.').then(renderAffinites);
      });

      actionsTd.appendChild(toggleVisible);
      actionsTd.appendChild(togglePublie);
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Section ÉTABLISSEMENTS / SUPERVISEURS ---------------- */

  function setupEtablissementForm() {
    document.getElementById('btn-add-etab').addEventListener('click', function () {
      const nomEtab = document.getElementById('etab-nom').value.trim();
      const nomSuperviseur = document.getElementById('etab-superviseur-nom').value.trim();
      const identifiant = document.getElementById('etab-identifiant').value.trim();
      const motDePasse = document.getElementById('etab-password').value.trim();
      const maxEleves = parseInt(document.getElementById('etab-max').value, 10) || 50;

      if (!nomEtab || !nomSuperviseur || !identifiant || !motDePasse) {
        toast('Merci de remplir tous les champs.');
        return;
      }

      const identifiantExiste = db.Utilisateurs.some(function (u) {
        return String(u.identifiant) === identifiant;
      });
      if (identifiantExiste) {
        toast('Cet identifiant est déjà utilisé.');
        return;
      }

      db.Ecoles.push({
        nomEtablissement: nomEtab,
        identifiantSuperviseur: identifiant,
        motDePasseSuperviseur: motDePasse,
        maxEleves: maxEleves
      });

      db.Utilisateurs.push({
        identifiant: identifiant,
        motDePasse: motDePasse,
        nomCompte: nomSuperviseur,
        role: 'superviseur',
        ecole: nomEtab,
        classe: '',
        statut: 'actif',
        avatar: '',
        theme: '',
        dateInscription: new Date().toISOString().slice(0, 10)
      });

      saveAll('Superviseur créé pour ' + nomEtab + '.').then(function () {
        document.getElementById('etab-nom').value = '';
        document.getElementById('etab-superviseur-nom').value = '';
        document.getElementById('etab-identifiant').value = '';
        document.getElementById('etab-password').value = '';
        renderEtablissements();
      });
    });
  }

  function renderEtablissements() {
    const tbody = document.querySelector('#table-etablissements tbody');
    tbody.innerHTML = '';
    db.Ecoles.forEach(function (ecole) {
      const nbEleves = db.Utilisateurs.filter(function (u) {
        return u.role === 'eleve' && u.ecole === ecole.nomEtablissement;
      }).length;
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(ecole.nomEtablissement) + '</td>' +
        '<td>' + escapeHtml(ecole.identifiantSuperviseur) + '</td>' +
        '<td>' + nbEleves + ' / ' + ecole.maxEleves + '</td>';
      tbody.appendChild(tr);
    });
  }

  function renderSuggestions() {
    const tbody = document.querySelector('#table-suggestions tbody');
    tbody.innerHTML = '';
    const enAttente = db.Suggestions.filter(function (s) { return s.statut === 'EnAttente'; });

    enAttente.forEach(function (sugg, i) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(sugg.ecole) + '</td>' +
        '<td>' + escapeHtml(sugg.nomSuggere) + '</td>' +
        '<td>' + escapeHtml(sugg.classeSuggere) + '</td>' +
        '<td>' + escapeHtml(sugg.identifiantSouhaite) + '</td>' +
        '<td></td>';

      const actionsTd = tr.querySelector('td:last-child');

      const validerBtn = document.createElement('button');
      validerBtn.className = 'btn-primary';
      validerBtn.style.width = 'auto';
      validerBtn.style.marginTop = '0';
      validerBtn.style.marginRight = '6px';
      validerBtn.textContent = 'Valider';
      validerBtn.addEventListener('click', function () {
        const motDePasse = prompt('Mot de passe à attribuer à ' + sugg.nomSuggere + ' :');
        if (!motDePasse) return;

        const identifiantExiste = db.Utilisateurs.some(function (u) {
          return String(u.identifiant) === sugg.identifiantSouhaite;
        });
        if (identifiantExiste) {
          toast('Cet identifiant est déjà pris, modifie la suggestion.');
          return;
        }

        db.Utilisateurs.push({
          identifiant: sugg.identifiantSouhaite,
          motDePasse: motDePasse,
          nomCompte: sugg.nomSuggere,
          role: 'eleve',
          ecole: sugg.ecole,
          classe: sugg.classeSuggere,
          statut: 'actif',
          avatar: '',
          theme: '',
          dateInscription: new Date().toISOString().slice(0, 10)
        });
        sugg.statut = 'Valide';

        saveAll('Élève validé et créé.').then(function () {
          renderChildren();
          renderSuggestions();
          renderEtablissements();
        });
      });

      const refuserBtn = document.createElement('button');
      refuserBtn.className = 'btn-danger';
      refuserBtn.textContent = 'Refuser';
      refuserBtn.addEventListener('click', function () {
        sugg.statut = 'Refuse';
        saveAll('Suggestion refusée.').then(renderSuggestions);
      });

      actionsTd.appendChild(validerBtn);
      actionsTd.appendChild(refuserBtn);
      tbody.appendChild(tr);
    });
  }

  /* ---------------- Utilitaires ---------------- */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
