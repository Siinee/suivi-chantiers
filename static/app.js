/* ═══════════════════════════════════════════════════════════════════════════
   Suivi Chantiers – SPA Vanilla JS
   Modèle de suivi : 3 étapes par tâche (Établi / Envoyé / Validé)
   Valeurs : 0 = À commencer | 1 = En cours | 2 = Terminé
   Avancement = somme des valeurs / (nb_tâches × 6) × 100
   ═══════════════════════════════════════════════════════════════════════════ */

// ── État global ──────────────────────────────────────────────────────────────
const state = { view: 'dashboard', currentChantierId: null };

// ── Constantes étapes ────────────────────────────────────────────────────────
const STEPS = [
  { key: 'etabli', label: 'Établi' },
  { key: 'envoye', label: 'Envoyé' },
  { key: 'valide', label: 'Validé' },
];

const STATUS = [
  { val: 0, label: 'À commencer', bg: '#e2e8f0', color: '#64748b' },
  { val: 1, label: 'En cours',    bg: '#fef9c3', color: '#a16207' },
  { val: 2, label: 'Terminé',     bg: '#dcfce7', color: '#15803d' },
];

// ── Utilitaires ───────────────────────────────────────────────────────────────
function intVal(v) { return parseInt(v, 10) || 0; }

function taskScore(t) {
  return intVal(t.etabli) + intVal(t.envoye) + intVal(t.valide);
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function statusInfo(dateDebut, dateFin, progress) {
  const today = new Date(); today.setHours(0,0,0,0);
  const start = parseDate(dateDebut), end = parseDate(dateFin);
  if (progress >= 100) return { label: 'Terminé',   cls: 'badge-termine' };
  if (end   && today > end)   return { label: 'En retard', cls: 'badge-en-retard' };
  if (start && today < start) return { label: 'À venir',   cls: 'badge-a-venir' };
  return { label: 'En cours', cls: 'badge-en-cours' };
}

function progressColor(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  get:  url       => fetch(url).then(r => r.json()),
  post: (url, d)  => fetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  put:  (url, d)  => fetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  del:  url       => fetch(url, { method:'DELETE' }).then(r => r.json()),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const id = 'toast-' + Date.now();
  const colors = { success:'#22c55e', danger:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
  document.getElementById('toast-container').insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center border-0 show" role="alert"
         style="background:${colors[type]||colors.info};color:#fff;min-width:260px">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${msg}</div>
        <button class="btn-close btn-close-white me-2 m-auto"
                onclick="document.getElementById('${id}').remove()"></button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 3500);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(titleHtml, bodyHtml, footerHtml) {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal fade" id="main-modal" tabindex="-1">
      <div class="modal-dialog modal-lg modal-dialog-centered">
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
  const modal = new bootstrap.Modal(el);
  modal.show();
  el.addEventListener('hidden.bs.modal', () => el.remove());
  return modal;
}

function closeModal() {
  const el = document.getElementById('main-modal');
  if (el) bootstrap.Modal.getInstance(el)?.hide();
}

// ── Router ────────────────────────────────────────────────────────────────────
function navigate(view, param) {
  state.view = view;
  state.currentChantierId = param || null;
  if (view === 'dashboard') loadDashboard();
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
  const root = document.getElementById('app-root');
  root.innerHTML = `
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
  const pct = c.progress || 0;
  const color = progressColor(pct);
  const s = statusInfo(c.dateDebut, c.dateFin, pct);
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

// ═══════════════════════════════════════════════════════════════════════════
//  FORMULAIRE CHANTIER
// ═══════════════════════════════════════════════════════════════════════════
async function showChantierForm(id) {
  const v = id ? await API.get(`/api/chantiers/${id}`) : {};
  const title = id ? `<i class="bi bi-pencil me-2"></i>Modifier le chantier`
                   : `<i class="bi bi-plus-lg me-2"></i>Nouveau chantier`;
  openModal(title, `
    <form id="chantier-form">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Nom du chantier <span class="text-danger">*</span></label>
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
          <div class="form-text">Lien vers une image (PNG/JPG) — affiché sur les impressions.</div>
        </div>
        <div class="col-12">
          <label class="form-label">Commentaires</label>
          <textarea class="form-control" id="f-comments" rows="3">${esc(v.commentaires||'')}</textarea>
        </div>
      </div>
    </form>`, `
    <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
    <button class="btn btn-primary" onclick="saveChantier('${id||''}')">
      <i class="bi bi-check-lg me-1"></i>${id ? 'Enregistrer' : 'Créer le chantier'}
    </button>`);
}

async function saveChantier(id) {
  const nom    = document.getElementById('f-nom').value.trim();
  const client = document.getElementById('f-client').value.trim();
  if (!nom || !client) { toast('Nom et client sont obligatoires.', 'warning'); return; }
  const data = {
    nom, client,
    adresse:      document.getElementById('f-adresse').value.trim(),
    dateDebut:    document.getElementById('f-debut').value,
    dateFin:      document.getElementById('f-fin').value,
    logoUrl:      document.getElementById('f-logo').value.trim(),
    commentaires: document.getElementById('f-comments').value.trim(),
  };
  if (id) { await API.put(`/api/chantiers/${id}`, data); toast('Chantier mis à jour.'); }
  else    { await API.post('/api/chantiers', data);       toast('Chantier créé.'); }
  closeModal();
  if (state.view === 'chantier' && id) loadChantierDetail(id); else loadDashboard();
}

async function confirmDeleteChantier(id, nom) {
  openModal(
    '<i class="bi bi-exclamation-triangle me-2"></i>Confirmer la suppression',
    `<p>Supprimer <strong>${esc(nom)}</strong> et toutes ses tâches ?</p>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-danger" onclick="deleteChantier('${id}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>`);
}

async function deleteChantier(id) {
  await API.del(`/api/chantiers/${id}`);
  toast('Chantier supprimé.', 'danger');
  closeModal();
  loadDashboard();
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
  const pct   = c.progress || 0;
  const color = progressColor(pct);
  const s     = statusInfo(c.dateDebut, c.dateFin, pct);

  document.getElementById('app-root').innerHTML = `
    <nav aria-label="breadcrumb" class="no-print mb-3">
      <ol class="breadcrumb">
        <li class="breadcrumb-item">
          <a href="#" onclick="navigate('dashboard')" class="text-primary text-decoration-none">Tableau de bord</a>
        </li>
        <li class="breadcrumb-item active">${esc(c.nom)}</li>
      </ol>
    </nav>

    <!-- En-tête -->
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
        <!-- Anneau progression -->
        <div class="text-center no-print">${progressRing(pct, '#fff')}</div>
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
          <small class="fw-semibold text-secondary">Avancement global</small>
          <small class="fw-bold" style="color:${color}" id="global-pct-text">${pct}%</small>
        </div>
        <div class="progress" style="height:10px">
          <div class="progress-bar" id="global-bar" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    </div>

    <!-- Légende statuts -->
    <div class="d-flex gap-3 mb-3 no-print flex-wrap">
      <small class="text-muted fw-semibold">Légende :</small>
      ${STATUS.map(st => `
        <span style="background:${st.bg};color:${st.color};padding:2px 10px;border-radius:20px;font-size:.78rem;font-weight:600">
          ${st.label}
        </span>`).join('')}
      <small class="text-muted ms-2">Cliquer sur un statut pour le faire avancer.</small>
    </div>

    <!-- Catégories -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0 fw-bold"><i class="bi bi-list-check me-2 text-primary"></i>Catégories & Tâches</h5>
      <button class="btn btn-sm btn-outline-primary no-print"
              onclick="showAddCategoryModal('${c.id}')">
        <i class="bi bi-plus-lg me-1"></i>Ajouter une catégorie
      </button>
    </div>

    <div class="row g-3" id="categories-grid">
      ${(c.categories||[]).map(cat => renderCategoryCard(cat, c.id)).join('')}
    </div>`;
}

function progressRing(pct, textColor = '#1e40af') {
  const r = 30, circ = 2 * Math.PI * r;
  const fill = circ * (1 - pct / 100);
  const col  = progressColor(pct);
  return `
    <div class="progress-ring">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="#ffffff33" stroke-width="6"/>
        <circle cx="36" cy="36" r="${r}" fill="none" stroke="${col}" stroke-width="6"
                stroke-dasharray="${circ}" stroke-dashoffset="${fill}"
                stroke-linecap="round" style="transition:stroke-dashoffset .4s"/>
      </svg>
      <div class="pct-text" style="color:${textColor}">${pct}%</div>
    </div>`;
}

// ── Catégorie ─────────────────────────────────────────────────────────────────
function renderCategoryCard(cat, chantierId) {
  const pct   = cat.progress || 0;
  const color = progressColor(pct);
  return `
    <div class="col-12" id="cat-${cat.id}">
      <div class="category-card">
        <div class="category-header">
          <div class="fw-semibold">${esc(cat.nom)}</div>
          <div class="d-flex align-items-center gap-3">
            <span class="small fw-bold no-print" style="color:${color}">
              ${pct}%
            </span>
            <span class="small text-muted">
              (${cat.score||0} / ${cat.maxScore||0} pts)
            </span>
            <button class="btn btn-sm btn-outline-danger py-0 px-1 no-print"
                    onclick="confirmDeleteCategory('${cat.id}','${esc(cat.nom)}','${chantierId}')"
                    title="Supprimer la catégorie">
              <i class="bi bi-trash" style="font-size:.75rem"></i>
            </button>
          </div>
        </div>
        <div class="px-3 pt-2 pb-1">
          <div class="progress mb-1" style="height:5px">
            <div class="progress-bar cat-bar-${cat.id}"
                 style="width:${pct}%;background:${color}"></div>
          </div>
        </div>

        <!-- En-tête colonnes -->
        <div class="task-columns-header px-3 d-flex align-items-center gap-2 no-print">
          <div class="flex-grow-1"></div>
          ${STEPS.map(s => `
            <div class="step-col-header text-center small fw-semibold text-secondary">${s.label}</div>
          `).join('')}
          <div style="width:28px"></div>
        </div>

        <div class="px-3 pb-2" id="tasks-${cat.id}">
          ${(cat.tasks||[]).map(t => renderTaskRow(t, chantierId)).join('')}
          ${(!cat.tasks || cat.tasks.length === 0)
            ? `<p class="text-muted small mb-2 pt-1">Aucune tâche. Ajoutez-en ci-dessous.</p>` : ''}
        </div>

        <div class="px-3 pb-3 no-print">
          <div class="d-flex gap-2">
            <input type="text" class="form-control form-control-sm" id="new-task-${cat.id}"
                   placeholder="Nouvelle tâche…"
                   onkeydown="if(event.key==='Enter') addTask('${cat.id}','${chantierId}')">
            <button class="btn btn-sm btn-primary"
                    onclick="addTask('${cat.id}','${chantierId}')">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Ligne de tâche avec 3 étapes ──────────────────────────────────────────────
function renderTaskRow(t, chantierId) {
  const score = taskScore(t);
  const pct   = Math.round(score / 6 * 100);
  return `
    <div class="task-item" id="task-${t.id}">
      <div class="flex-grow-1 task-name">${esc(t.nom)}</div>
      ${STEPS.map(step => {
        const val = intVal(t[step.key]);
        const st  = STATUS[val] || STATUS[0];
        return `
          <button class="step-btn no-print"
                  style="background:${st.bg};color:${st.color}"
                  title="${step.label} : ${st.label}"
                  onclick="cycleStep('${t.id}','${step.key}',${val},'${chantierId}')">
            ${st.label}
          </button>`;
      }).join('')}
      <!-- Labels pour l'impression -->
      <div class="print-steps d-none">
        ${STEPS.map(step => {
          const val = intVal(t[step.key]);
          const st  = STATUS[val] || STATUS[0];
          return `<span class="print-step">${step.label}: ${st.label}</span>`;
        }).join(' | ')}
      </div>
      <button class="task-delete-btn no-print" onclick="deleteTask('${t.id}','${chantierId}')">
        <i class="bi bi-x-lg" style="font-size:.8rem"></i>
      </button>
    </div>`;
}

async function cycleStep(tacheId, stepKey, currentVal, chantierId) {
  const newVal = (currentVal + 1) % 3; // 0→1→2→0
  await API.put(`/api/taches/${tacheId}`, { [stepKey]: newVal });
  // Mise à jour optimiste du bouton
  const taskEl = document.getElementById(`task-${tacheId}`);
  if (taskEl) {
    const stepIdx = STEPS.findIndex(s => s.key === stepKey);
    const btn = taskEl.querySelectorAll('.step-btn')[stepIdx];
    if (btn) {
      const st = STATUS[newVal];
      btn.style.background = st.bg;
      btn.style.color      = st.color;
      btn.title            = `${STEPS[stepIdx].label} : ${st.label}`;
      btn.textContent      = st.label;
      btn.setAttribute('onclick',
        `cycleStep('${tacheId}','${stepKey}',${newVal},'${chantierId}')`);
    }
  }
  refreshChantierProgress(chantierId);
}

async function addTask(catId, chantierId) {
  const input = document.getElementById(`new-task-${catId}`);
  const nom   = input.value.trim();
  if (!nom) return;
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
  openModal(
    '<i class="bi bi-exclamation-triangle me-2"></i>Confirmer',
    `<p>Supprimer <strong>${esc(catNom)}</strong> et toutes ses tâches ?</p>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-danger" onclick="deleteCategory('${catId}','${chantierId}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>`);
}

async function deleteCategory(catId, chantierId) {
  await API.del(`/api/categories/${catId}`);
  document.getElementById(`cat-${catId}`)?.remove();
  toast('Catégorie supprimée.', 'danger');
  closeModal();
  refreshChantierProgress(chantierId);
}

function showAddCategoryModal(chantierId) {
  openModal(
    '<i class="bi bi-plus-circle me-2"></i>Nouvelle catégorie',
    `<label class="form-label">Nom de la catégorie</label>
     <input type="text" class="form-control" id="new-cat-name" placeholder="Ex: Étanchéité…">`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="addCategory('${chantierId}')">
       <i class="bi bi-plus-lg me-1"></i>Ajouter
     </button>`);
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
  const globalPct   = c.progress || 0;
  const globalColor = progressColor(globalPct);

  // Barre & texte globaux
  const bar = document.getElementById('global-bar');
  const txt = document.getElementById('global-pct-text');
  if (bar) { bar.style.width = `${globalPct}%`; bar.style.background = globalColor; }
  if (txt) { txt.style.color = globalColor; txt.textContent = `${globalPct}%`; }

  // Anneau
  const ring = document.querySelector('.progress-ring');
  if (ring) ring.outerHTML = progressRing(globalPct, '#fff');

  // Barres par catégorie
  (c.categories || []).forEach(cat => {
    const bar = document.querySelector(`.cat-bar-${cat.id}`);
    const pct = cat.progress || 0;
    const col = progressColor(pct);
    if (bar) { bar.style.width = `${pct}%`; bar.style.background = col; }

    const header = document.querySelector(`#cat-${cat.id} .category-header .fw-bold.small`);
    if (header) { header.style.color = col; header.textContent = `${pct}%`; }
    const pts = document.querySelector(`#cat-${cat.id} .category-header .text-muted`);
    if (pts) pts.textContent = `(${cat.score||0} / ${cat.maxScore||0} pts)`;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLANNING
// ═══════════════════════════════════════════════════════════════════════════
async function loadPlanning() {
  document.getElementById('app-root').innerHTML =
    `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  renderPlanning(await API.get('/api/planning'));
}

function renderPlanning(data) {
  let minDate = null, maxDate = null;
  data.forEach(c => {
    const s = parseDate(c.dateDebut), e = parseDate(c.dateFin);
    if (s && (!minDate || s < minDate)) minDate = new Date(s);
    if (e && (!maxDate || e > maxDate)) maxDate = new Date(e);
  });
  const hasGantt = minDate && maxDate && maxDate > minDate;
  const totalMs  = hasGantt ? (maxDate - minDate) : 1;
  const today    = new Date(); today.setHours(0,0,0,0);

  document.getElementById('app-root').innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
      <div>
        <h4 class="mb-0 fw-bold"><i class="bi bi-calendar3 me-2 text-primary"></i>Planning multi-chantiers</h4>
        <small class="text-muted">${data.length} chantier${data.length !== 1 ? 's' : ''}</small>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="navigate('dashboard')">
          <i class="bi bi-arrow-left me-1"></i>Retour
        </button>
        <button class="btn btn-primary btn-sm" onclick="printPlanning()">
          <i class="bi bi-printer me-1"></i>Imprimer / PDF
        </button>
      </div>
    </div>

    ${hasGantt ? renderGantt(data, minDate, maxDate, totalMs, today) : ''}

    <div class="card border-0 shadow-sm mt-4" style="border-radius:12px;overflow:hidden">
      <div class="card-header bg-primary text-white fw-bold">
        <i class="bi bi-table me-2"></i>Récapitulatif détaillé
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table planning-table mb-0">
            <thead>
              <tr>
                <th>Client / Logo</th>
                <th>Chantier</th>
                <th>Adresse</th>
                <th>Période</th>
                <th>Avancement</th>
                <th>Catégories</th>
              </tr>
            </thead>
            <tbody>
              ${data.length === 0
                ? `<tr><td colspan="6" class="text-center text-muted py-4">Aucun chantier.</td></tr>`
                : data.map(renderPlanningRow).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  document.getElementById('print-date').textContent =
    `Édité le ${today.toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'})}`;
}

function renderGantt(data, minDate, maxDate, totalMs, today) {
  const months = [];
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    months.push({ label: cur.toLocaleDateString('fr-FR', {month:'short', year:'2-digit'}),
                  left: Math.max(0, (cur - minDate) / totalMs * 100) });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  const todayPct = Math.min(100, Math.max(0, (today - minDate) / totalMs * 100));

  return `
    <div class="gantt-container mb-4">
      <div class="gantt-header d-flex" style="min-height:32px;position:relative">
        <div class="gantt-label" style="background:#f8fafc;font-size:.75rem;font-weight:600;color:#64748b;display:flex;align-items:center">
          Chantier
        </div>
        <div style="flex:1;position:relative;overflow:hidden">
          ${months.map(m => `
            <span style="position:absolute;left:${m.left}%;font-size:.72rem;color:#64748b;
                         border-left:1px solid #e2e8f0;padding:8px 0 0 4px;top:0;bottom:0">
              ${m.label}
            </span>`).join('')}
        </div>
      </div>
      ${data.map(c => {
        const s = parseDate(c.dateDebut), e = parseDate(c.dateFin);
        let left = 0, width = 100;
        if (s && e) {
          left  = Math.max(0, (s - minDate) / totalMs * 100);
          width = Math.min(100 - left, (e - s) / totalMs * 100);
        }
        const pct = c.progress || 0;
        const col = progressColor(pct);
        return `
          <div class="gantt-row d-flex" onclick="navigate('chantier','${c.id}')" style="cursor:pointer">
            <div class="gantt-label">
              <div class="fw-semibold text-truncate" style="font-size:.82rem">${esc(c.nom)}</div>
              <div class="text-muted" style="font-size:.72rem">${esc(c.client||'')}</div>
            </div>
            <div class="gantt-track flex-grow-1" style="position:relative">
              <div class="gantt-today" style="left:${todayPct}%"></div>
              ${s && e
                ? `<div class="gantt-bar" style="left:${left}%;width:${width}%;background:linear-gradient(90deg,${col},${col}99)">${pct}%</div>`
                : `<span class="text-muted" style="font-size:.75rem;padding:10px 0 0 8px;display:block">Dates non définies</span>`}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderPlanningRow(c) {
  const pct = c.progress || 0, col = progressColor(pct);
  return `
    <tr>
      <td>
        ${c.logoUrl
          ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.client)}" style="height:28px;object-fit:contain;margin-right:6px">`
          : `<span class="fw-semibold">${esc(c.client||'—')}</span>`}
      </td>
      <td>
        <a href="#" onclick="navigate('chantier','${c.id}')"
           class="fw-semibold text-decoration-none text-primary">${esc(c.nom)}</a>
      </td>
      <td class="text-muted">${esc(c.adresse||'—')}</td>
      <td class="text-nowrap"><small>${fmtDate(c.dateDebut)}<br>${fmtDate(c.dateFin)}</small></td>
      <td style="min-width:100px">
        <div class="progress mb-1" style="height:6px">
          <div class="progress-bar" style="width:${pct}%;background:${col}"></div>
        </div>
        <small class="fw-bold" style="color:${col}">${pct}%</small>
      </td>
      <td>
        ${(c.categories||[]).map(cat => {
          const done = cat.progress >= 100;
          const nom  = cat.nom.length > 20 ? cat.nom.slice(0,18)+'…' : cat.nom;
          return `<span class="cat-pill ${done ? 'done' : ''}" title="${esc(cat.nom)}: ${cat.progress}%">
                    ${esc(nom)} ${cat.progress}%
                  </span>`;
        }).join('')}
      </td>
    </tr>`;
}

function printPlanning() {
  document.getElementById('print-header').style.display = 'block';
  window.print();
  setTimeout(() => { document.getElementById('print-header').style.display = 'none'; }, 1200);
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPORT EXCEL
// ═══════════════════════════════════════════════════════════════════════════
async function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res  = await fetch('/api/import', { method:'POST', body:fd });
  const data = await res.json();
  if (data.success) { toast('Fichier importé !'); navigate('dashboard'); }
  else              { toast('Erreur lors de l\'import.', 'danger'); }
  input.value = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadDashboard());
