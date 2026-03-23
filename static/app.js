/* ═══════════════════════════════════════════════════════════════════════════
   Suivi Chantiers – SPA Vanilla JS
   ═══════════════════════════════════════════════════════════════════════════ */

// ── État global ──────────────────────────────────────────────────────────────
const state = { view: 'dashboard', currentChantierId: null };

// ── Utilitaires date ─────────────────────────────────────────────────────────
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
  const start = parseDate(dateDebut);
  const end   = parseDate(dateFin);
  if (progress >= 100) return { label: 'Terminé', cls: 'badge-termine' };
  if (end && today > end) return { label: 'En retard', cls: 'badge-en-retard' };
  if (start && today < start) return { label: 'À venir',  cls: 'badge-a-venir' };
  return { label: 'En cours', cls: 'badge-en-cours' };
}

function progressColor(pct) {
  if (pct >= 70) return '#22c55e';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, data) => fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }).then(r => r.json()),
  put:  (url, data) => fetch(url, { method:'PUT',  headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) }).then(r => r.json()),
  del:  (url)       => fetch(url, { method:'DELETE' }).then(r => r.json()),
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const id = 'toast-' + Date.now();
  const colors = { success:'#22c55e', danger:'#ef4444', info:'#3b82f6', warning:'#f59e0b' };
  const html = `
    <div id="${id}" class="toast align-items-center border-0 show" role="alert"
         style="background:${colors[type]||colors.info};color:#fff;min-width:260px">
      <div class="d-flex">
        <div class="toast-body fw-semibold">${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                onclick="document.getElementById('${id}').remove()"></button>
      </div>
    </div>`;
  const container = document.getElementById('toast-container');
  container.insertAdjacentHTML('beforeend', html);
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
  el.addEventListener('hidden.bs.modal', () => { el.remove(); });
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
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  const chantiers = await API.get('/api/chantiers');
  renderDashboard(chantiers);
}

function renderDashboard(chantiers) {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
      <div>
        <h4 class="mb-0 fw-bold text-dark"><i class="bi bi-building me-2 text-primary"></i>Tableau de bord</h4>
        <small class="text-muted">${chantiers.length} chantier${chantiers.length !== 1 ? 's' : ''} au total</small>
      </div>
      <button class="btn btn-primary" onclick="showChantierForm()">
        <i class="bi bi-plus-lg me-1"></i>Nouveau chantier
      </button>
    </div>
    <div class="row g-3" id="chantiers-grid">
      ${chantiers.length === 0 ? `
        <div class="col-12 text-center py-5 text-muted">
          <i class="bi bi-building-slash" style="font-size:3rem;opacity:.3"></i>
          <p class="mt-3">Aucun chantier. Créez-en un ou importez un fichier Excel.</p>
        </div>` : chantiers.map(renderChantierCard).join('')}
    </div>`;
}

function renderChantierCard(c) {
  const pct = c.progress || 0;
  const color = progressColor(pct);
  const s = statusInfo(c.dateDebut, c.dateFin, pct);
  return `
    <div class="col-xl-4 col-lg-6 col-md-6">
      <div class="card chantier-card h-100" onclick="navigate('chantier','${c.id}')">
        <div class="card-header d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-bold fs-6">${esc(c.nom)}</div>
            <small class="opacity-75">${esc(c.client || '—')}</small>
          </div>
          <span class="badge rounded-pill ${s.cls}" style="font-size:.75rem">${s.label}</span>
        </div>
        <div class="card-body">
          <p class="text-muted small mb-2">
            <i class="bi bi-geo-alt me-1"></i>${esc(c.adresse || '—')}
          </p>
          <p class="text-muted small mb-3">
            <i class="bi bi-calendar3 me-1"></i>${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin)}
          </p>
          <div class="d-flex justify-content-between align-items-center mb-1">
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
  let chantier = null;
  if (id) {
    chantier = await API.get(`/api/chantiers/${id}`);
  }
  const v = chantier || {};
  const title = id ? `<i class="bi bi-pencil me-2"></i>Modifier le chantier` : `<i class="bi bi-plus-lg me-2"></i>Nouveau chantier`;
  const body = `
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
          <input type="text" class="form-control" id="f-logo" placeholder="https://..." value="${esc(v.logoUrl||'')}">
          <div class="form-text">URL d'une image (PNG/JPG). Sera affiché sur les impressions.</div>
        </div>
        <div class="col-12">
          <label class="form-label">Commentaires</label>
          <textarea class="form-control" id="f-comments" rows="3">${esc(v.commentaires||'')}</textarea>
        </div>
      </div>
    </form>`;
  const footer = `
    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
    <button type="button" class="btn btn-primary" onclick="saveChantier('${id||''}')">
      <i class="bi bi-check-lg me-1"></i>${id ? 'Enregistrer' : 'Créer le chantier'}
    </button>`;
  openModal(title, body, footer);
}

async function saveChantier(id) {
  const nom = document.getElementById('f-nom').value.trim();
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
  if (id) {
    await API.put(`/api/chantiers/${id}`, data);
    toast('Chantier mis à jour.', 'success');
  } else {
    await API.post('/api/chantiers', data);
    toast('Chantier créé avec succès.', 'success');
  }
  closeModal();
  if (state.view === 'chantier' && id) loadChantierDetail(id);
  else loadDashboard();
}

async function confirmDeleteChantier(id, nom) {
  const body = `<p>Supprimer définitivement <strong>${esc(nom)}</strong> et toutes ses tâches ?</p>`;
  const footer = `
    <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
    <button class="btn btn-danger" onclick="deleteChantier('${id}')">
      <i class="bi bi-trash me-1"></i>Supprimer
    </button>`;
  openModal('<i class="bi bi-exclamation-triangle me-2"></i>Confirmer la suppression', body, footer);
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
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  const c = await API.get(`/api/chantiers/${id}`);
  renderChantierDetail(c);
}

function renderChantierDetail(c) {
  const root = document.getElementById('app-root');
  const pct = c.progress || 0;
  const color = progressColor(pct);
  const s = statusInfo(c.dateDebut, c.dateFin, pct);

  root.innerHTML = `
    <!-- Fil d'Ariane -->
    <nav aria-label="breadcrumb" class="no-print mb-3">
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="#" onclick="navigate('dashboard')" class="text-primary text-decoration-none">Tableau de bord</a></li>
        <li class="breadcrumb-item active">${esc(c.nom)}</li>
      </ol>
    </nav>

    <!-- En-tête chantier -->
    <div class="card border-0 shadow-sm mb-4" style="border-radius:12px;overflow:hidden">
      <div class="card-body p-0">
        <div class="p-4 d-flex flex-wrap gap-4 align-items-start" style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-3 mb-2">
              ${c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="logo" style="height:40px;object-fit:contain;background:#fff;border-radius:6px;padding:4px">` : ''}
              <h4 class="mb-0 fw-bold">${esc(c.nom)}</h4>
              <span class="badge rounded-pill ${s.cls}" style="font-size:.8rem">${s.label}</span>
            </div>
            <div class="d-flex flex-wrap gap-3 opacity-90 small">
              <span><i class="bi bi-person-fill me-1"></i>${esc(c.client||'—')}</span>
              <span><i class="bi bi-geo-alt-fill me-1"></i>${esc(c.adresse||'—')}</span>
              <span><i class="bi bi-calendar3 me-1"></i>${fmtDate(c.dateDebut)} → ${fmtDate(c.dateFin)}</span>
            </div>
            ${c.commentaires ? `<p class="mt-2 mb-0 opacity-75 small">${esc(c.commentaires)}</p>` : ''}
          </div>
          <!-- Anneau de progression -->
          <div class="text-center no-print">
            ${progressRing(pct, color)}
            <div class="small mt-1 opacity-90">Avancement global</div>
          </div>
          <div class="no-print d-flex flex-column gap-2">
            <button class="btn btn-light btn-sm" onclick="showChantierForm('${c.id}')">
              <i class="bi bi-pencil me-1"></i>Modifier
            </button>
            <button class="btn btn-outline-light btn-sm" onclick="confirmDeleteChantier('${c.id}','${esc(c.nom)}')">
              <i class="bi bi-trash me-1"></i>Supprimer
            </button>
          </div>
        </div>
        <!-- Barre de progression globale -->
        <div class="px-4 pb-3 pt-2" style="background:#fff">
          <div class="d-flex justify-content-between mb-1">
            <small class="fw-semibold text-secondary">Avancement global</small>
            <small class="fw-bold" style="color:${color}">${pct}%</small>
          </div>
          <div class="progress" style="height:10px">
            <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Catégories -->
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0 fw-bold"><i class="bi bi-list-check me-2 text-primary"></i>Catégories & Tâches</h5>
      <button class="btn btn-sm btn-outline-primary no-print" onclick="showAddCategoryModal('${c.id}')">
        <i class="bi bi-plus-lg me-1"></i>Ajouter une catégorie
      </button>
    </div>

    <div class="row g-3" id="categories-grid">
      ${(c.categories||[]).map(cat => renderCategoryCard(cat, c.id)).join('')}
    </div>`;
}

function progressRing(pct, color) {
  const r = 30, cx = 36, cy = 36;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - pct/100);
  return `
    <div class="progress-ring">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff33" stroke-width="6"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="6"
                stroke-dasharray="${circ}" stroke-dashoffset="${fill}"
                stroke-linecap="round" style="transition:stroke-dashoffset .4s ease"/>
      </svg>
      <div class="pct-text" style="color:#fff">${pct}%</div>
    </div>`;
}

function renderCategoryCard(cat, chantierId) {
  const pct = cat.progress || 0;
  const color = progressColor(pct);
  return `
    <div class="col-xl-6" id="cat-${cat.id}">
      <div class="category-card h-100">
        <div class="category-header">
          <div class="fw-semibold">${esc(cat.nom)}</div>
          <div class="d-flex align-items-center gap-3 no-print">
            <span class="small fw-bold" style="color:${color}">${pct}% (${cat.doneCount}/${cat.totalCount})</span>
            <button class="btn btn-sm btn-outline-danger py-0 px-1"
                    onclick="confirmDeleteCategory('${cat.id}','${esc(cat.nom)}','${chantierId}')"
                    title="Supprimer la catégorie">
              <i class="bi bi-trash" style="font-size:.75rem"></i>
            </button>
          </div>
          <div class="print-only small text-muted">${pct}% (${cat.doneCount}/${cat.totalCount})</div>
        </div>
        <div class="px-3 pt-2 pb-1">
          <div class="progress mb-2" style="height:5px">
            <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>
        <div class="px-3 pb-2" id="tasks-${cat.id}">
          ${(cat.tasks||[]).map(t => renderTaskItem(t, chantierId)).join('')}
          ${cat.tasks && cat.tasks.length === 0 ? `<p class="text-muted small mb-2">Aucune tâche.</p>` : ''}
        </div>
        <div class="px-3 pb-3 no-print">
          <div class="d-flex gap-2">
            <input type="text" class="form-control form-control-sm" id="new-task-${cat.id}"
                   placeholder="Nouvelle tâche…" onkeydown="if(event.key==='Enter') addTask('${cat.id}','${chantierId}')">
            <button class="btn btn-sm btn-primary btn-add-task"
                    onclick="addTask('${cat.id}','${chantierId}')">
              <i class="bi bi-plus-lg"></i>
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function renderTaskItem(t, chantierId) {
  const done = t.done === true || t.done === 1 || t.done === '1' || t.done === 'True' || t.done === 'true';
  return `
    <div class="task-item" id="task-${t.id}">
      <input type="checkbox" id="cb-${t.id}" ${done ? 'checked' : ''}
             onchange="toggleTask('${t.id}', this.checked, '${chantierId}')">
      <label for="cb-${t.id}" class="${done ? 'done-label' : ''}">${esc(t.nom)}</label>
      <button class="task-delete-btn no-print" onclick="deleteTask('${t.id}','${chantierId}')">
        <i class="bi bi-x-lg" style="font-size:.8rem"></i>
      </button>
    </div>`;
}

async function toggleTask(id, done, chantierId) {
  await API.put(`/api/taches/${id}`, { done });
  refreshChantierProgress(chantierId);
}

async function addTask(catId, chantierId) {
  const input = document.getElementById(`new-task-${catId}`);
  const nom = input.value.trim();
  if (!nom) return;
  input.value = '';
  const t = await API.post('/api/taches', { categorieId: catId, nom });
  const container = document.getElementById(`tasks-${catId}`);
  // remove "no tasks" placeholder if present
  const placeholder = container.querySelector('p.text-muted');
  if (placeholder) placeholder.remove();
  container.insertAdjacentHTML('beforeend', renderTaskItem(t, chantierId));
  refreshChantierProgress(chantierId);
}

async function deleteTask(id, chantierId) {
  await API.del(`/api/taches/${id}`);
  document.getElementById(`task-${id}`)?.remove();
  refreshChantierProgress(chantierId);
}

async function confirmDeleteCategory(catId, catNom, chantierId) {
  const body = `<p>Supprimer la catégorie <strong>${esc(catNom)}</strong> et toutes ses tâches ?</p>`;
  const footer = `
    <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
    <button class="btn btn-danger" onclick="deleteCategory('${catId}','${chantierId}')">
      <i class="bi bi-trash me-1"></i>Supprimer
    </button>`;
  openModal('<i class="bi bi-exclamation-triangle me-2"></i>Confirmer', body, footer);
}

async function deleteCategory(catId, chantierId) {
  await API.del(`/api/categories/${catId}`);
  document.getElementById(`cat-${catId}`)?.remove();
  toast('Catégorie supprimée.', 'danger');
  closeModal();
  refreshChantierProgress(chantierId);
}

function showAddCategoryModal(chantierId) {
  const body = `
    <label class="form-label">Nom de la catégorie</label>
    <input type="text" class="form-control" id="new-cat-name" placeholder="Ex: Étanchéité…">`;
  const footer = `
    <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
    <button class="btn btn-primary" onclick="addCategory('${chantierId}')">
      <i class="bi bi-plus-lg me-1"></i>Ajouter
    </button>`;
  openModal('<i class="bi bi-plus-circle me-2"></i>Nouvelle catégorie', body, footer);
  setTimeout(() => document.getElementById('new-cat-name')?.focus(), 300);
}

async function addCategory(chantierId) {
  const nom = document.getElementById('new-cat-name').value.trim();
  if (!nom) { toast('Entrez un nom.', 'warning'); return; }
  const cat = await API.post('/api/categories', { chantierId, nom });
  closeModal();
  const grid = document.getElementById('categories-grid');
  grid.insertAdjacentHTML('beforeend', renderCategoryCard(cat, chantierId));
  toast('Catégorie ajoutée.', 'success');
}

async function refreshChantierProgress(chantierId) {
  // Refresh progress without full reload
  const c = await API.get(`/api/chantiers/${chantierId}`);
  // Update each category progress bar
  (c.categories || []).forEach(cat => {
    const card = document.getElementById(`cat-${cat.id}`);
    if (!card) return;
    const pct = cat.progress || 0;
    const color = progressColor(pct);
    const bar = card.querySelector('.progress-bar');
    if (bar) bar.style.cssText = `width:${pct}%;background:${color}`;
    const pctSpan = card.querySelector('.fw-bold.small');
    if (pctSpan) {
      pctSpan.style.color = color;
      pctSpan.textContent = `${pct}% (${cat.doneCount}/${cat.totalCount})`;
    }
  });
  // Update global progress bar
  const globalPct = c.progress || 0;
  const globalColor = progressColor(globalPct);
  const globalBar = document.querySelector('.card-body .progress-bar');
  if (globalBar) globalBar.style.cssText = `width:${globalPct}%;background:${globalColor}`;
  // Update global pct text
  const globalPctText = document.querySelector('.card-body .fw-bold[style*="color"]');
  if (globalPctText) { globalPctText.style.color = globalColor; globalPctText.textContent = `${globalPct}%`; }
  // Update ring
  const ringContainer = document.querySelector('.progress-ring');
  if (ringContainer) ringContainer.outerHTML = progressRing(globalPct, globalColor);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLANNING
// ═══════════════════════════════════════════════════════════════════════════
async function loadPlanning() {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="d-flex justify-content-center py-5"><div class="spinner-border text-primary"></div></div>`;
  const data = await API.get('/api/planning');
  renderPlanning(data);
}

function renderPlanning(data) {
  const root = document.getElementById('app-root');

  // Compute Gantt range
  let minDate = null, maxDate = null;
  data.forEach(c => {
    const s = parseDate(c.dateDebut), e = parseDate(c.dateFin);
    if (s && (!minDate || s < minDate)) minDate = new Date(s);
    if (e && (!maxDate || e > maxDate)) maxDate = new Date(e);
  });
  const hasGantt = minDate && maxDate && maxDate > minDate;
  const today = new Date(); today.setHours(0,0,0,0);
  const totalMs = hasGantt ? (maxDate - minDate) : 1;

  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-4 no-print">
      <div>
        <h4 class="mb-0 fw-bold text-dark"><i class="bi bi-calendar3 me-2 text-primary"></i>Planning multi-chantiers</h4>
        <small class="text-muted">${data.length} chantier${data.length !== 1 ? 's' : ''}</small>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-outline-secondary btn-sm" onclick="navigate('dashboard')">
          <i class="bi bi-arrow-left me-1"></i>Retour
        </button>
        <button class="btn btn-primary btn-sm" onclick="printPlanning()">
          <i class="bi bi-printer me-1"></i>Imprimer
        </button>
        <button class="btn btn-success btn-sm" onclick="exportPDF()">
          <i class="bi bi-file-earmark-pdf me-1"></i>PDF
        </button>
      </div>
    </div>

    ${hasGantt ? renderGantt(data, minDate, maxDate, totalMs, today) : ''}

    <!-- Tableau récapitulatif -->
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
              ${data.length === 0 ? `<tr><td colspan="6" class="text-center text-muted py-4">Aucun chantier.</td></tr>` :
                data.map(c => renderPlanningRow(c)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;

  // Prepare print header
  document.getElementById('print-date').textContent = `Édité le ${today.toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'})}`;
}

function renderGantt(data, minDate, maxDate, totalMs, today) {
  // Build month headers
  const months = [];
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    const left = Math.max(0, (cur - minDate) / totalMs * 100);
    months.push({ label: cur.toLocaleDateString('fr-FR', {month:'short', year:'2-digit'}), left });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  // Today marker
  const todayPct = Math.min(100, Math.max(0, (today - minDate) / totalMs * 100));

  return `
    <div class="gantt-container mb-4">
      <div class="gantt-header d-flex" style="position:relative;min-height:32px">
        <div class="gantt-label" style="background:#f8fafc;font-size:.75rem;font-weight:600;color:#64748b;display:flex;align-items:center">
          Chantier
        </div>
        <div style="flex:1;position:relative;overflow:hidden">
          ${months.map(m => `
            <span style="position:absolute;left:${m.left}%;font-size:.72rem;color:#64748b;padding-top:8px;
                          border-left:1px solid #e2e8f0;padding-left:4px;top:0;bottom:0">
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
        const color = progressColor(pct);
        return `
          <div class="gantt-row d-flex" onclick="navigate('chantier','${c.id}')" style="cursor:pointer">
            <div class="gantt-label">
              <div class="fw-semibold text-truncate" style="font-size:.82rem" title="${esc(c.nom)}">${esc(c.nom)}</div>
              <div class="text-muted" style="font-size:.72rem">${esc(c.client||'')}</div>
            </div>
            <div class="gantt-track flex-grow-1" style="position:relative">
              <div class="gantt-today" style="left:${todayPct}%"></div>
              ${s && e ? `
              <div class="gantt-bar" style="left:${left}%;width:${width}%;background:linear-gradient(90deg,${color},${color}99)">
                ${pct}%
              </div>` : '<span class="text-muted" style="font-size:.75rem;padding-top:10px;padding-left:8px;display:block">Dates non définies</span>'}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

function renderPlanningRow(c) {
  const pct = c.progress || 0;
  const color = progressColor(pct);
  const cats = (c.categories || []).slice(0, 8);
  return `
    <tr>
      <td>
        ${c.logoUrl
          ? `<img src="${esc(c.logoUrl)}" alt="${esc(c.client)}" style="height:28px;object-fit:contain;margin-right:6px">`
          : `<span class="fw-semibold">${esc(c.client||'—')}</span>`}
      </td>
      <td>
        <a href="#" onclick="navigate('chantier','${c.id}')" class="fw-semibold text-decoration-none text-primary">
          ${esc(c.nom)}
        </a>
      </td>
      <td class="text-muted">${esc(c.adresse||'—')}</td>
      <td class="text-nowrap">
        <small>${fmtDate(c.dateDebut)}<br>${fmtDate(c.dateFin)}</small>
      </td>
      <td style="min-width:100px">
        <div class="progress mb-1" style="height:6px">
          <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <small class="fw-bold" style="color:${color}">${pct}%</small>
      </td>
      <td>
        ${cats.map(cat => {
          const done = cat.progress >= 100;
          return `<span class="cat-pill ${done ? 'done' : ''}" title="${esc(cat.nom)}: ${cat.progress}%">
            ${esc(cat.nom.length > 18 ? cat.nom.slice(0,16)+'…' : cat.nom)} ${cat.progress}%
          </span>`;
        }).join('')}
      </td>
    </tr>`;
}

function printPlanning() {
  document.getElementById('print-header').style.display = 'block';
  window.print();
  setTimeout(() => { document.getElementById('print-header').style.display = 'none'; }, 1000);
}

function exportPDF() {
  document.getElementById('print-header').style.display = 'block';
  document.getElementById('print-date').textContent =
    `Édité le ${new Date().toLocaleDateString('fr-FR', {day:'2-digit', month:'long', year:'numeric'})}`;
  // Trigger browser's save as PDF
  window.print();
  setTimeout(() => { document.getElementById('print-header').style.display = 'none'; }, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
//  IMPORT EXCEL
// ═══════════════════════════════════════════════════════════════════════════
async function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/import', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.success) {
    toast('Fichier importé avec succès !', 'success');
    navigate('dashboard');
  } else {
    toast('Erreur lors de l\'import.', 'danger');
  }
  input.value = '';
}

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITAIRES
// ═══════════════════════════════════════════════════════════════════════════
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadDashboard());
