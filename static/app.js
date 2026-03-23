/* ═══════════════════════════════════════════════════════════════════════════
   Suivi Chantiers – SPA Vanilla JS
   ─ Suivi    : 3 étapes par tâche (Établi / Envoyé / Validé), 0‑1‑2
   ─ Planning : grille calendrier interactif, pose de phases par semaine/mois
   ═══════════════════════════════════════════════════════════════════════════ */

// ── État ──────────────────────────────────────────────────────────────────────
const state = { view: 'dashboard', currentChantierId: null };

const planningState = {
  mode:        'week',  // 'week' | 'month'
  windowStart: null,    // Date (lundi de la 1ère semaine visible)
  windowCount: 16,      // nb de semaines ou de mois affichés
};

// ── Constantes suivi ──────────────────────────────────────────────────────────
const STEPS = [
  { key: 'etabli', label: 'Établi'  },
  { key: 'envoye', label: 'Envoyé'  },
  { key: 'valide', label: 'Validé'  },
];
const STATUS = [
  { val: 0, label: 'À commencer', bg: '#e2e8f0', color: '#64748b' },
  { val: 1, label: 'En cours',    bg: '#fef9c3', color: '#a16207' },
  { val: 2, label: 'Terminé',     bg: '#dcfce7', color: '#15803d' },
];

// ── Phases planning (couleurs) ────────────────────────────────────────────────
const PLANNING_PHASES = [
  { nom: 'Désamiantage',         bg: '#fed7aa', color: '#9a3412', border: '#f97316' },
  { nom: 'Montage',              bg: '#bfdbfe', color: '#1e3a8a', border: '#3b82f6' },
  { nom: 'Maçonnerie',           bg: '#e7e5e4', color: '#44403c', border: '#a8a29e' },
  { nom: 'CE/Levée de réserve',  bg: '#bbf7d0', color: '#14532d', border: '#22c55e' },
  { nom: 'Démontage',            bg: '#fecaca', color: '#7f1d1d', border: '#ef4444' },
  { nom: 'Pose de SAS',          bg: '#e9d5ff', color: '#4c1d95', border: '#a855f7' },
  { nom: 'Mise à disposition',   bg: '#cffafe', color: '#164e63', border: '#06b6d4' },
  { nom: 'Contrôle & Essai',     bg: '#fef08a', color: '#713f12', border: '#eab308' },
];

function phaseInfo(nom) {
  return PLANNING_PHASES.find(p => p.nom === nom) ||
         { bg: '#e2e8f0', color: '#475569', border: '#94a3b8' };
}

// ── Utilitaires ───────────────────────────────────────────────────────────────
function intVal(v)  { return parseInt(v, 10) || 0; }
function taskScore(t) {
  return intVal(t.etabli) + intVal(t.envoye) + intVal(t.valide);
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d); if (isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function parseDate(s) {
  if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d;
}
// toISO en heure LOCALE (pas UTC) pour éviter le décalage de jour
function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Parse YYYY-MM-DD en date LOCALE (jamais UTC)
function localDate(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d, 0, 0, 0, 0);
}
function localDateEnd(iso) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y, m-1, d, 23, 59, 59, 999);
}
function progressColor(pct) {
  return pct >= 70 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444';
}
function statusInfo(dateDebut, dateFin, progress) {
  const today = new Date(); today.setHours(0,0,0,0);
  const s = parseDate(dateDebut), e = parseDate(dateFin);
  if (progress >= 100)       return { label: 'Terminé',   cls: 'badge-termine' };
  if (e && today > e)        return { label: 'En retard', cls: 'badge-en-retard' };
  if (s && today < s)        return { label: 'À venir',   cls: 'badge-a-venir' };
  return                            { label: 'En cours',  cls: 'badge-en-cours' };
}
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  get:  url      => fetch(url).then(r => r.json()),
  post: (url, d) => fetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  put:  (url, d) => fetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  del:  url      => fetch(url, { method:'DELETE' }).then(r => r.json()),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const id = 'toast-' + Date.now();
  const col = { success:'#22c55e', danger:'#ef4444', info:'#3b82f6', warning:'#f59e0b' }[type] || '#3b82f6';
  document.getElementById('toast-container').insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center border-0 show"
         style="background:${col};color:#fff;min-width:260px">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${msg}</div>
        <button class="btn-close btn-close-white me-2 m-auto"
                onclick="document.getElementById('${id}').remove()"></button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 3500);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(titleHtml, bodyHtml, footerHtml, size = 'modal-lg') {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal fade" id="main-modal" tabindex="-1">
      <div class="modal-dialog ${size} modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${titleHtml}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-footer">${footerHtml}</div>
        </div>
      </div>
    </div>`;
  const el = document.getElementById('main-modal');
  const m = new bootstrap.Modal(el); m.show();
  el.addEventListener('hidden.bs.modal', () => el.remove());
  return m;
}
function closeModal() {
  const el = document.getElementById('main-modal');
  if (el) bootstrap.Modal.getInstance(el)?.hide();
}

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(view, param) {
  state.view = view; state.currentChantierId = param || null;
  if (view === 'dashboard')    loadDashboard();
  else if (view === 'chantier') loadChantierDetail(param);
  else if (view === 'planning') loadPlanning();
}

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  document.getElementById('app-root').innerHTML =
    `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  renderDashboard(await API.get('/api/chantiers'));
}

function renderDashboard(chantiers) {
  document.getElementById('app-root').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
      <div>
        <h4 class="mb-0 fw-bold text-dark"><i class="bi bi-building me-2 text-primary"></i>Tableau de bord</h4>
        <small class="text-muted">${chantiers.length} chantier${chantiers.length !== 1 ? 's' : ''}</small>
      </div>
      <button class="btn btn-primary" onclick="showChantierForm()">
        <i class="bi bi-plus-lg me-1"></i>Nouveau chantier
      </button>
    </div>
    <div class="row g-3">
      ${chantiers.length === 0
        ? `<div class="col-12 text-center py-5 text-muted">
             <i class="bi bi-building-slash" style="font-size:3rem;opacity:.3"></i>
             <p class="mt-3">Aucun chantier. Créez-en un ou importez un fichier Excel.</p>
           </div>`
        : chantiers.map(renderChantierCard).join('')}
    </div>`;
}

function renderChantierCard(c) {
  const pct = c.progress || 0, color = progressColor(pct), s = statusInfo(c.dateDebut, c.dateFin, pct);
  return `
    <div class="col-xl-4 col-lg-6">
      <div class="card chantier-card h-100" onclick="navigate('chantier','${c.id}')">
        <div class="card-header d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-bold">${esc(c.nom)}</div>
            <small class="opacity-75">${esc(c.client || '—')}</small>
          </div>
          <span class="badge rounded-pill ${s.cls}">${s.label}</span>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-2"><i class="bi bi-geo-alt me-1"></i>${esc(c.adresse || '—')}</p>
          <p class="text-muted small mb-3"><i class="bi bi-calendar3 me-1"></i>${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin)}</p>
          <div class="d-flex justify-content-between mb-1">
            <small class="fw-semibold text-secondary">Avancement global</small>
            <small class="fw-bold" style="color:${color}">${pct}%</small>
          </div>
          <div class="progress" style="height:8px">
            <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
        <div class="card-footer bg-transparent border-0 d-flex justify-content-end gap-2 no-print">
          <button class="btn btn-sm btn-outline-secondary"
            onclick="event.stopPropagation();showChantierForm('${c.id}')">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger"
            onclick="event.stopPropagation();confirmDeleteChantier('${c.id}','${esc(c.nom)}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>`;
}

// ── Formulaire chantier ───────────────────────────────────────────────────────
async function showChantierForm(id) {
  const v = id ? await API.get(`/api/chantiers/${id}`) : {};
  openModal(
    id ? `<i class="bi bi-pencil me-2"></i>Modifier le chantier`
       : `<i class="bi bi-plus-lg me-2"></i>Nouveau chantier`,
    `<form id="chantier-form">
       <div class="row g-3">
         <div class="col-md-6">
           <label class="form-label">Nom <span class="text-danger">*</span></label>
           <input type="text" class="form-control" id="f-nom" value="${esc(v.nom||'')}" required>
         </div>
         <div class="col-md-6">
           <label class="form-label">Client <span class="text-danger">*</span></label>
           <input type="text" class="form-control" id="f-client" value="${esc(v.client||'')}" required>
         </div>
         <div class="col-12">
           <label class="form-label">Adresse</label>
           <input type="text" class="form-control" id="f-adresse" value="${esc(v.adresse||'')}">
         </div>
         <div class="col-md-6">
           <label class="form-label">Date de début</label>
           <input type="date" class="form-control" id="f-debut" value="${v.dateDebut||''}">
         </div>
         <div class="col-md-6">
           <label class="form-label">Date de fin</label>
           <input type="date" class="form-control" id="f-fin" value="${v.dateFin||''}">
         </div>
         <div class="col-12">
           <label class="form-label">URL du logo client</label>
           <input type="text" class="form-control" id="f-logo" placeholder="https://…" value="${esc(v.logoUrl||'')}">
         </div>
         <div class="col-12">
           <label class="form-label">Commentaires</label>
           <textarea class="form-control" id="f-comments" rows="3">${esc(v.commentaires||'')}</textarea>
         </div>
       </div>
     </form>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="saveChantier('${id||''}')">
       <i class="bi bi-check-lg me-1"></i>${id ? 'Enregistrer' : 'Créer le chantier'}
     </button>`);
}

async function saveChantier(id) {
  const nom = document.getElementById('f-nom').value.trim();
  const cli = document.getElementById('f-client').value.trim();
  if (!nom || !cli) { toast('Nom et client sont obligatoires.', 'warning'); return; }
  const data = { nom, client: cli,
    adresse:      document.getElementById('f-adresse').value.trim(),
    dateDebut:    document.getElementById('f-debut').value,
    dateFin:      document.getElementById('f-fin').value,
    logoUrl:      document.getElementById('f-logo').value.trim(),
    commentaires: document.getElementById('f-comments').value.trim() };
  if (id) { await API.put(`/api/chantiers/${id}`, data); toast('Chantier mis à jour.'); }
  else    { await API.post('/api/chantiers', data);       toast('Chantier créé.'); }
  closeModal();
  if (state.view === 'chantier' && id) loadChantierDetail(id); else loadDashboard();
}

async function confirmDeleteChantier(id, nom) {
  openModal('<i class="bi bi-exclamation-triangle me-2"></i>Confirmer la suppression',
    `<p>Supprimer <strong>${esc(nom)}</strong> et toutes ses tâches/phases planning ?</p>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-danger" onclick="deleteChantier('${id}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>`, 'modal-md');
}

async function deleteChantier(id) {
  await API.del(`/api/chantiers/${id}`);
  toast('Chantier supprimé.', 'danger'); closeModal(); loadDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÉTAIL CHANTIER
// ═══════════════════════════════════════════════════════════════════════════
async function loadChantierDetail(id) {
  document.getElementById('app-root').innerHTML =
    `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  renderChantierDetail(await API.get(`/api/chantiers/${id}`));
}

function renderChantierDetail(c) {
  const pct = c.progress || 0, color = progressColor(pct), s = statusInfo(c.dateDebut, c.dateFin, pct);
  document.getElementById('app-root').innerHTML = `
    <nav aria-label="breadcrumb" class="no-print mb-3">
      <ol class="breadcrumb">
        <li class="breadcrumb-item">
          <a href="#" onclick="navigate('dashboard')" class="text-primary text-decoration-none">Tableau de bord</a>
        </li>
        <li class="breadcrumb-item active">${esc(c.nom)}</li>
      </ol>
    </nav>

    <div class="card border-0 shadow-sm mb-4" style="border-radius:12px;overflow:hidden">
      <div class="p-4 d-flex flex-wrap gap-4 align-items-start"
           style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff">
        <div class="flex-grow-1">
          <div class="d-flex align-items-center gap-3 mb-2">
            ${c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="logo"
                style="height:40px;object-fit:contain;background:#fff;border-radius:6px;padding:4px">` : ''}
            <h4 class="mb-0 fw-bold">${esc(c.nom)}</h4>
            <span class="badge rounded-pill ${s.cls}">${s.label}</span>
          </div>
          <div class="d-flex flex-wrap gap-3 opacity-90 small">
            <span><i class="bi bi-person-fill me-1"></i>${esc(c.client||'—')}</span>
            <span><i class="bi bi-geo-alt-fill me-1"></i>${esc(c.adresse||'—')}</span>
            <span><i class="bi bi-calendar3 me-1"></i>${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin)}</span>
          </div>
          ${c.commentaires ? `<p class="mt-2 mb-0 opacity-75 small">${esc(c.commentaires)}</p>` : ''}
        </div>
        <div class="text-center no-print">${progressRing(pct)}</div>
        <div class="no-print d-flex flex-column gap-2">
          <button class="btn btn-light btn-sm" onclick="showChantierForm('${c.id}')">
            <i class="bi bi-pencil me-1"></i>Modifier
          </button>
          <button class="btn btn-outline-light btn-sm"
                  onclick="confirmDeleteChantier('${c.id}','${esc(c.nom)}')">
            <i class="bi bi-trash me-1"></i>Supprimer
          </button>
        </div>
      </div>
      <div class="px-4 pb-3 pt-2 bg-white">
        <div class="d-flex justify-content-between mb-1">
          <small class="fw-semibold text-secondary">Avancement global (Préparatoire)</small>
          <small class="fw-bold" style="color:${color}" id="global-pct-text">${pct}%</small>
        </div>
        <div class="progress" style="height:10px">
          <div class="progress-bar" id="global-bar" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    </div>

    <!-- Légende statuts -->
    <div class="d-flex gap-3 mb-3 no-print flex-wrap">
      <small class="text-muted fw-semibold align-self-center">Statut :</small>
      ${STATUS.map(st => `
        <span style="background:${st.bg};color:${st.color};padding:2px 10px;
                     border-radius:20px;font-size:.78rem;font-weight:600">
          ${st.label}
        </span>`).join('')}
      <small class="text-muted ms-2 align-self-center">Cliquer pour faire avancer.</small>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0 fw-bold"><i class="bi bi-list-check me-2 text-primary"></i>Tâches préparatoires</h5>
      <button class="btn btn-sm btn-outline-primary no-print"
              onclick="showAddCategoryModal('${c.id}')">
        <i class="bi bi-plus-lg me-1"></i>Ajouter une catégorie
      </button>
    </div>
    <div class="row g-3" id="categories-grid">
      ${(c.categories||[]).map(cat => renderCategoryCard(cat, c.id)).join('')}
    </div>`;
}

function progressRing(pct) {
  const r = 30, circ = 2 * Math.PI * r, fill = circ * (1 - pct / 100), col = progressColor(pct);
  return `
    <div class="progress-ring">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="#ffffff33" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${col}" stroke-width="6"
                stroke-dasharray="${circ}" stroke-dashoffset="${fill}"
                stroke-linecap="round" style="transition:stroke-dashoffset .4s"/>
      </svg>
      <div class="pct-text" style="color:#fff">${pct}%</div>
    </div>`;
}

// ── Catégorie ─────────────────────────────────────────────────────────────────
function renderCategoryCard(cat, chantierId) {
  const pct = cat.progress || 0, color = progressColor(pct);
  return `
    <div class="col-12" id="cat-${cat.id}">
      <div class="category-card">
        <div class="category-header">
          <div class="fw-semibold">${esc(cat.nom)}</div>
          <div class="d-flex align-items-center gap-3">
            <span class="small fw-bold" style="color:${color}">${pct}%</span>
            <span class="small text-muted">(${cat.score||0} / ${cat.maxScore||0} pts)</span>
            <button class="btn btn-sm btn-outline-danger py-0 px-1 no-print"
                    onclick="confirmDeleteCategory('${cat.id}','${esc(cat.nom)}','${chantierId}')">
              <i class="bi bi-trash" style="font-size:.75rem"></i>
            </button>
          </div>
        </div>
        <div class="px-3 pt-2 pb-1">
          <div class="progress mb-1" style="height:5px">
            <div class="progress-bar cat-bar-${cat.id}" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
        <div class="task-columns-header px-3 d-flex align-items-center gap-2 no-print">
          <div class="flex-grow-1"></div>
          ${STEPS.map(s => `<div class="step-col-header text-center">${s.label}</div>`).join('')}
          <div style="width:28px"></div>
        </div>
        <div class="px-3 pb-2" id="tasks-${cat.id}">
          ${(cat.tasks||[]).map(t => renderTaskRow(t, chantierId)).join('')}
          ${(!cat.tasks || cat.tasks.length === 0)
            ? `<p class="text-muted small mb-2 pt-1">Aucune tâche — ajoutez-en ci-dessous.</p>` : ''}
        </div>
        <div class="px-3 pb-3 no-print">
          <div class="d-flex gap-2">
            <input type="text" class="form-control form-control-sm" id="new-task-${cat.id}"
                   placeholder="Nouvelle tâche…"
                   onkeydown="if(event.key==='Enter') addTask('${cat.id}','${chantierId}')">
            <button class="btn btn-sm btn-primary" onclick="addTask('${cat.id}','${chantierId}')">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Ligne tâche (3 étapes) ────────────────────────────────────────────────────
function renderTaskRow(t, chantierId) {
  return `
    <div class="task-item" id="task-${t.id}">
      <div class="flex-grow-1 task-name">${esc(t.nom)}</div>
      ${STEPS.map(step => {
        const val = intVal(t[step.key]), st = STATUS[val] || STATUS[0];
        return `
          <button class="step-btn no-print"
                  style="background:${st.bg};color:${st.color}"
                  title="${step.label} : ${st.label}"
                  onclick="cycleStep('${t.id}','${step.key}',${val},'${chantierId}')">
            ${st.label}
          </button>`;
      }).join('')}
      <div class="print-steps d-none">
        ${STEPS.map(step => {
          const val = intVal(t[step.key]), st = STATUS[val] || STATUS[0];
          return `<span>${step.label}: ${st.label}</span>`;
        }).join(' | ')}
      </div>
      <button class="task-delete-btn no-print" onclick="deleteTask('${t.id}','${chantierId}')">
        <i class="bi bi-x-lg" style="font-size:.8rem"></i>
      </button>
    </div>`;
}

async function cycleStep(tacheId, stepKey, currentVal, chantierId) {
  const newVal = (currentVal + 1) % 3;
  await API.put(`/api/taches/${tacheId}`, { [stepKey]: newVal });
  const taskEl = document.getElementById(`task-${tacheId}`);
  if (taskEl) {
    const idx = STEPS.findIndex(s => s.key === stepKey);
    const btn = taskEl.querySelectorAll('.step-btn')[idx];
    if (btn) {
      const st = STATUS[newVal];
      btn.style.background = st.bg; btn.style.color = st.color;
      btn.title = `${STEPS[idx].label} : ${st.label}`;
      btn.textContent = st.label;
      btn.setAttribute('onclick', `cycleStep('${tacheId}','${stepKey}',${newVal},'${chantierId}')`);
    }
  }
  refreshChantierProgress(chantierId);
}

async function addTask(catId, chantierId) {
  const input = document.getElementById(`new-task-${catId}`);
  const nom = input.value.trim(); if (!nom) return;
  input.value = '';
  const t = await API.post('/api/taches', { categorieId: catId, nom });
  const container = document.getElementById(`tasks-${catId}`);
  container.querySelector('p.text-muted')?.remove();
  container.insertAdjacentHTML('beforeend', renderTaskRow(t, chantierId));
  refreshChantierProgress(chantierId);
}

async function deleteTask(id, chantierId) {
  await API.del(`/api/taches/${id}`);
  document.getElementById(`task-${id}`)?.remove();
  refreshChantierProgress(chantierId);
}

async function confirmDeleteCategory(catId, catNom, chantierId) {
  openModal('<i class="bi bi-exclamation-triangle me-2"></i>Confirmer',
    `<p>Supprimer <strong>${esc(catNom)}</strong> et toutes ses tâches ?</p>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-danger" onclick="deleteCategory('${catId}','${chantierId}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>`, 'modal-md');
}

async function deleteCategory(catId, chantierId) {
  await API.del(`/api/categories/${catId}`);
  document.getElementById(`cat-${catId}`)?.remove();
  toast('Catégorie supprimée.', 'danger'); closeModal();
  refreshChantierProgress(chantierId);
}

function showAddCategoryModal(chantierId) {
  openModal('<i class="bi bi-plus-circle me-2"></i>Nouvelle catégorie',
    `<label class="form-label">Nom</label>
     <input type="text" class="form-control" id="new-cat-name" placeholder="Ex : Électricité…">`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="addCategory('${chantierId}')">
       <i class="bi bi-plus-lg me-1"></i>Ajouter
     </button>`, 'modal-md');
  setTimeout(() => document.getElementById('new-cat-name')?.focus(), 300);
}

async function addCategory(chantierId) {
  const nom = document.getElementById('new-cat-name').value.trim();
  if (!nom) { toast('Entrez un nom.', 'warning'); return; }
  const cat = await API.post('/api/categories', { chantierId, nom });
  closeModal();
  document.getElementById('categories-grid')
          .insertAdjacentHTML('beforeend', renderCategoryCard(cat, chantierId));
  toast('Catégorie ajoutée.');
}

async function refreshChantierProgress(chantierId) {
  const c = await API.get(`/api/chantiers/${chantierId}`);
  const pct = c.progress || 0, col = progressColor(pct);
  document.getElementById('global-bar')?.setAttribute('style', `width:${pct}%;background:${col}`);
  const txt = document.getElementById('global-pct-text');
  if (txt) { txt.style.color = col; txt.textContent = `${pct}%`; }
  (c.categories || []).forEach(cat => {
    const bar = document.querySelector(`.cat-bar-${cat.id}`);
    const p = cat.progress || 0, c2 = progressColor(p);
    if (bar) { bar.style.width = `${p}%`; bar.style.background = c2; }
    const pts = document.querySelector(`#cat-${cat.id} .text-muted.small`);
    if (pts) pts.textContent = `(${cat.score||0} / ${cat.maxScore||0} pts)`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLANNING – calendrier interactif
// ═══════════════════════════════════════════════════════════════════════════

// ── Helpers semaines/mois ─────────────────────────────────────────────────────
function getMondayOfWeek(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function getISOWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y1  = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - y1) / 86400000) + 1) / 7);
}

function initPlanningState() {
  const today = new Date(); today.setHours(0,0,0,0);
  const monday = getMondayOfWeek(today);
  monday.setDate(monday.getDate() - 14); // 2 semaines en arrière
  planningState.windowStart = monday;
}

function generatePeriods() {
  const periods = [], start = new Date(planningState.windowStart);
  if (planningState.mode === 'week') {
    for (let i = 0; i < planningState.windowCount; i++) {
      const mon = new Date(start); mon.setDate(mon.getDate() + i * 7);
      const sun = new Date(mon);   sun.setDate(sun.getDate() + 6); sun.setHours(23,59,59,999);
      const wn  = getISOWeek(mon);
      const dd  = String(mon.getDate()).padStart(2,'0');
      const mm  = String(mon.getMonth()+1).padStart(2,'0');
      periods.push({ start: new Date(mon), end: new Date(sun),
                     label: `S${String(wn).padStart(2,'0')}<br><small>${dd}/${mm}</small>`,
                     key: toISO(mon) });
    }
  } else {
    const first = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < planningState.windowCount; i++) {
      const ms = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const me = new Date(first.getFullYear(), first.getMonth() + i + 1, 0);
      me.setHours(23,59,59,999);
      periods.push({ start: new Date(ms), end: new Date(me),
                     label: ms.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
                     key: toISO(ms) });
    }
  }
  return periods;
}

// ── Chargement & rendu planning ───────────────────────────────────────────────
async function loadPlanning() {
  document.getElementById('app-root').innerHTML =
    `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  if (!planningState.windowStart) initPlanningState();
  const [chantiers, items] = await Promise.all([
    API.get('/api/chantiers'),
    API.get('/api/planning/items'),
  ]);
  renderPlanning(chantiers, items);
}

function renderPlanning(chantiers, items) {
  const periods = generatePeriods();
  const today   = new Date(); today.setHours(0,0,0,0);

  // Label de la fenêtre courante
  const first = periods[0], last = periods[periods.length - 1];
  const windowLabel = planningState.mode === 'week'
    ? `${fmtDate(first.start)} — ${fmtDate(last.end)}`
    : `${first.label.replace(/<[^>]+>/g,'')} — ${last.label.replace(/<[^>]+>/g,'')}`;

  document.getElementById('app-root').innerHTML = `
    <!-- Barre de contrôles -->
    <div class="d-flex flex-wrap justify-content-between align-items-center mb-3 no-print gap-2">
      <div>
        <h4 class="mb-0 fw-bold"><i class="bi bi-calendar3-week me-2 text-primary"></i>Planning</h4>
        <small class="text-muted">${windowLabel}</small>
      </div>
      <div class="d-flex gap-2 flex-wrap align-items-center">
        <div class="btn-group btn-group-sm">
          <button class="btn ${planningState.mode==='week'  ?'btn-primary':'btn-outline-primary'}"
                  onclick="setPlanningMode('week')">
            <i class="bi bi-calendar-week me-1"></i>Semaine
          </button>
          <button class="btn ${planningState.mode==='month' ?'btn-primary':'btn-outline-primary'}"
                  onclick="setPlanningMode('month')">
            <i class="bi bi-calendar-month me-1"></i>Mois
          </button>
        </div>
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" onclick="planningNav(-1)" title="Précédent">
            <i class="bi bi-chevron-left"></i>
          </button>
          <button class="btn btn-outline-secondary" onclick="planningNavToday()">
            Aujourd'hui
          </button>
          <button class="btn btn-outline-secondary" onclick="planningNav(1)" title="Suivant">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
        <button class="btn btn-outline-secondary btn-sm" onclick="navigate('dashboard')">
          <i class="bi bi-arrow-left me-1"></i>Retour
        </button>
        <button class="btn btn-primary btn-sm" onclick="window.print()">
          <i class="bi bi-printer me-1"></i>Imprimer / PDF
        </button>
      </div>
    </div>

    <!-- Légende phases -->
    <div class="d-flex gap-2 flex-wrap mb-3 no-print align-items-center">
      <small class="text-muted fw-semibold">Phases :</small>
      ${PLANNING_PHASES.map(p => `
        <span class="phase-legend-chip"
              draggable="true"
              ondragstart="dragPhase(event,'${esc(p.nom)}')"
              style="background:${p.bg};color:${p.color};border:1px solid ${p.border};cursor:grab">
          <i class="bi bi-grip-vertical me-1 opacity-50" style="font-size:.7rem"></i>${p.nom}
        </span>`).join('')}
      <small class="text-muted ms-2">
        <i class="bi bi-hand-index-thumb me-1"></i>Glisser une phase sur le planning, ou cliquer sur une cellule.
      </small>
    </div>

    <!-- Grille calendrier -->
    <div class="planning-cal-wrapper">
      <table class="planning-cal">
        <thead>
          <tr>
            <th class="cal-chantier-th">
              <i class="bi bi-building me-1"></i>Chantier
            </th>
            ${periods.map(p => {
              const isNow = today >= p.start && today <= p.end;
              return `<th class="cal-period-th${isNow?' cal-today-col':''}">${p.label}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${chantiers.length === 0
            ? `<tr><td colspan="${periods.length+1}" class="text-center text-muted py-5">
                 Aucun chantier. <a href="#" onclick="navigate('dashboard')">Créez-en un d'abord.</a>
               </td></tr>`
            : chantiers.map(c => renderChantierPlanningRow(c, items, periods, today)).join('')}
        </tbody>
      </table>
    </div>`;

  document.getElementById('print-date').textContent =
    `Édité le ${today.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}`;
}

function renderChantierPlanningRow(chantier, allItems, periods, today) {
  const myItems = allItems.filter(i => String(i.chantierId) === String(chantier.id));

  const cells = periods.map(period => {
    const isNow = today >= period.start && today <= period.end;

    // Items actifs sur cette période
    const active = myItems.filter(i => {
      const s = localDate(i.dateDebut);
      const e = localDateEnd(i.dateFin);
      return period.start <= e && period.end >= s;
    });

    // Attributs communs (drag-drop sur toutes les cellules)
    const cellAttrs = `data-cid="${chantier.id}" data-pkey="${period.key}" data-pend="${toISO(period.end)}"
                       ondragover="calDragOver(event)" ondragleave="calDragLeave(event)" ondrop="calDrop(event)"`;

    if (active.length === 0) {
      return `<td class="cal-cell cal-empty${isNow?' cal-today-col':''}" ${cellAttrs}
                  onclick="showAddPlanningModal('${chantier.id}','${period.key}')">
              </td>`;
    }

    // Construire les blocs — chaque item = 1 semaine exactement
    // Détecter les voisins de même phase pour coller visuellement les blocs adjacents
    const buildBlock = (item) => {
      const ph = phaseInfo(item.phase);

      // Vérifier si la semaine précédente/suivante contient la même phase (pour coller)
      const prevMon = new Date(period.start); prevMon.setDate(prevMon.getDate() - 7);
      const nextMon = new Date(period.start); nextMon.setDate(nextMon.getDate() + 7);
      const nextMonEnd = new Date(nextMon.getTime() + 7 * 86400000);
      const hasSameLeft  = myItems.some(i => i.phase === item.phase
                            && localDate(i.dateDebut) >= prevMon
                            && localDate(i.dateDebut) < period.start);
      const hasSameRight = myItems.some(i => i.phase === item.phase
                            && localDate(i.dateDebut) >= nextMon
                            && localDate(i.dateDebut) < nextMonEnd);

      let pos;
      if (hasSameLeft && hasSameRight)  pos = 'block-mid';
      else if (hasSameLeft)             pos = 'block-end';
      else if (hasSameRight)            pos = 'block-start';
      else                              pos = 'block-solo';

      return `
        <div class="phase-block ${pos}"
             style="background:${ph.bg};color:${ph.color};border-color:${ph.border}"
             title="${esc(item.phase)} : ${fmtDate(item.dateDebut)} → ${fmtDate(item.dateFin)}"
             onclick="event.stopPropagation();showEditPlanningModal('${item.id}','${esc(item.phase)}','${item.dateDebut}','${item.dateFin}')">
          ${!hasSameLeft ? `<span class="phase-label">${esc(item.phase)}</span>` : ''}
        </div>`;
    };

    const blocks = active.map(buildBlock).join('');

    return `<td class="cal-cell cal-has-phase${isNow?' cal-today-col':''}" ${cellAttrs}>${blocks}</td>`;
  }).join('');

  return `
    <tr class="cal-row">
      <td class="cal-chantier-td">
        <div class="fw-semibold text-truncate" title="${esc(chantier.nom)}">${esc(chantier.nom)}</div>
        <small class="text-muted d-block text-truncate">${esc(chantier.client||'')}</small>
      </td>
      ${cells}
    </tr>`;
}

// ── Modals planning items ─────────────────────────────────────────────────────
function showAddPlanningModal(chantierId, isoMonday) {
  // Calculer fin de semaine (vendredi = lundi + 4 jours ouvrés, mais on garde dimanche pour la couverture)
  const monday  = localDate(isoMonday);
  const sunday  = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  const isoSunday = toISO(sunday);

  openModal(
    `<i class="bi bi-plus-circle me-2"></i>Placer une phase sur le planning`,
    `<div class="row g-3">
       <div class="col-12">
         <label class="form-label fw-semibold mb-2">Choisir la phase</label>
         <div class="phase-selector">
           ${PLANNING_PHASES.map((p, i) => `
             <label class="phase-option" style="--pb:${p.bg};--pc:${p.color};--pbr:${p.border}">
               <input type="radio" name="add-phase" value="${esc(p.nom)}" ${i===0?'checked':''}>
               <span>${esc(p.nom)}</span>
             </label>`).join('')}
         </div>
       </div>
       <div class="col-md-6">
         <label class="form-label">Date de début</label>
         <input type="date" class="form-control" id="pi-debut" value="${isoMonday}">
       </div>
       <div class="col-md-6">
         <label class="form-label">Date de fin</label>
         <input type="date" class="form-control" id="pi-fin" value="${isoSunday}">
       </div>
     </div>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="savePlanningItem('${chantierId}')">
       <i class="bi bi-check-lg me-1"></i>Placer
     </button>`);
}

async function savePlanningItem(chantierId) {
  const phase     = document.querySelector('input[name="add-phase"]:checked')?.value;
  const dateDebut = document.getElementById('pi-debut').value;
  const dateFin   = document.getElementById('pi-fin').value;
  if (!phase || !dateDebut || !dateFin) { toast('Remplissez tous les champs.', 'warning'); return; }
  if (dateFin < dateDebut)              { toast('La date de fin doit être ≥ date de début.', 'warning'); return; }
  await API.post('/api/planning/items', { chantierId, phase, dateDebut, dateFin });
  toast(`Phase « ${phase} » placée.`);
  closeModal(); loadPlanning();
}

function showEditPlanningModal(id, phase, dateDebut, dateFin) {
  const ph = phaseInfo(phase);
  openModal(
    `<span style="background:${ph.bg};color:${ph.color};padding:2px 10px;border-radius:20px;font-size:.9rem">
       ${esc(phase)}
     </span>`,
    `<div class="row g-3">
       <div class="col-12">
         <label class="form-label fw-semibold mb-2">Changer la phase</label>
         <div class="phase-selector">
           ${PLANNING_PHASES.map(p => `
             <label class="phase-option" style="--pb:${p.bg};--pc:${p.color};--pbr:${p.border}">
               <input type="radio" name="edit-phase" value="${esc(p.nom)}"
                      ${p.nom === phase ? 'checked' : ''}>
               <span>${esc(p.nom)}</span>
             </label>`).join('')}
         </div>
       </div>
       <div class="col-md-6">
         <label class="form-label">Date de début</label>
         <input type="date" class="form-control" id="pie-debut" value="${dateDebut}">
       </div>
       <div class="col-md-6">
         <label class="form-label">Date de fin</label>
         <input type="date" class="form-control" id="pie-fin" value="${dateFin}">
       </div>
     </div>`,
    `<button class="btn btn-danger me-auto" onclick="deletePlanningItem('${id}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>
     <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="updatePlanningItem('${id}')">
       <i class="bi bi-check-lg me-1"></i>Enregistrer
     </button>`);
}

async function updatePlanningItem(id) {
  const phase     = document.querySelector('input[name="edit-phase"]:checked')?.value;
  const dateDebut = document.getElementById('pie-debut').value;
  const dateFin   = document.getElementById('pie-fin').value;
  if (dateFin < dateDebut) { toast('Date de fin ≥ date de début.', 'warning'); return; }
  await API.put(`/api/planning/items/${id}`, { phase, dateDebut, dateFin });
  toast('Phase mise à jour.'); closeModal(); loadPlanning();
}

async function deletePlanningItem(id) {
  await API.del(`/api/planning/items/${id}`);
  toast('Phase supprimée.', 'danger'); closeModal(); loadPlanning();
}

// ── Drag-and-drop phases ──────────────────────────────────────────────────────
let _draggedPhase = null;

function dragPhase(event, phaseName) {
  _draggedPhase = phaseName;
  event.dataTransfer.setData('text/plain', phaseName);
  event.dataTransfer.effectAllowed = 'copy';
}

function calDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  event.currentTarget.classList.add('cal-drag-over');
}

function calDragLeave(event) {
  // Ignorer si on entre dans un enfant (phase-block)
  if (!event.currentTarget.contains(event.relatedTarget))
    event.currentTarget.classList.remove('cal-drag-over');
}

async function calDrop(event) {
  event.preventDefault();
  const td = event.currentTarget;
  td.classList.remove('cal-drag-over');

  const phase = _draggedPhase || event.dataTransfer.getData('text/plain');
  _draggedPhase = null;
  if (!phase) return;

  const chantierId = td.dataset.cid;
  const dateDebut  = td.dataset.pkey;   // ISO lundi (ou 1er du mois)
  const dateFin    = td.dataset.pend;   // ISO dimanche (ou dernier du mois)
  if (!chantierId || !dateDebut) return;

  await API.post('/api/planning/items', { chantierId, phase, dateDebut, dateFin });
  toast(`« ${phase} » placé.`);
  loadPlanning();
}

// ── Navigation planning ───────────────────────────────────────────────────────
function setPlanningMode(mode) {
  planningState.mode = mode;
  planningState.windowCount = mode === 'week' ? 16 : 12;
  loadPlanning();
}

function planningNav(dir) {
  // Avancer/reculer d'une demi-fenêtre
  const days = planningState.mode === 'week'
    ? Math.floor(planningState.windowCount / 2) * 7
    : Math.floor(planningState.windowCount / 2) * 30;
  planningState.windowStart = new Date(planningState.windowStart);
  planningState.windowStart.setDate(planningState.windowStart.getDate() + dir * days);
  loadPlanning();
}

function planningNavToday() {
  initPlanningState(); loadPlanning();
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPORT EXCEL
// ═══════════════════════════════════════════════════════════════════════════
async function importExcel(input) {
  const file = input.files[0]; if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/import', { method:'POST', body:fd });
  const data = await res.json();
  if (data.success) { toast('Fichier importé !'); navigate('dashboard'); }
  else              { toast('Erreur lors de l\'import.', 'danger'); }
  input.value = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadDashboard());
