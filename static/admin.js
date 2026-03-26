/* ═══════════════════════════════════════════════════════════
   Admin Panel JS
   ═══════════════════════════════════════════════════════════ */

const API = {
  get:  url      => fetch(url).then(r => r.json()),
  post: (url, d) => fetch(url, { method:'POST',   headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  put:  (url, d) => fetch(url, { method:'PUT',    headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) }).then(r => r.json()),
  del:  url      => fetch(url, { method:'DELETE' }).then(r => r.json()),
};

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toast(msg, type='success') {
  const id  = 'toast-' + Date.now();
  const col = { success:'#22c55e', danger:'#ef4444', warning:'#f59e0b', info:'#3b82f6' }[type];
  document.getElementById('toast-container').insertAdjacentHTML('beforeend',
    `<div id="${id}" class="toast show align-items-center border-0" style="background:${col};color:#fff;min-width:260px">
       <div class="d-flex">
         <div class="toast-body fw-semibold">${msg}</div>
         <button class="btn-close btn-close-white me-2 m-auto" onclick="document.getElementById('${id}').remove()"></button>
       </div>
     </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 3500);
}

function openModal(title, body, footer, size='modal-lg') {
  document.getElementById('modal-container').innerHTML = `
    <div class="modal fade" id="adm-modal" tabindex="-1">
      <div class="modal-dialog ${size} modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header" style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff">
            <h5 class="modal-title">${title}</h5>
            <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer">${footer}</div>
        </div>
      </div>
    </div>`;
  const el = document.getElementById('adm-modal');
  const m  = new bootstrap.Modal(el); m.show();
  el.addEventListener('hidden.bs.modal', () => el.remove());
}

function closeModal() {
  const el = document.getElementById('adm-modal');
  if (el) bootstrap.Modal.getInstance(el)?.hide();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function showSection(name) {
  ['users','defaults'].forEach(s => {
    document.getElementById(`section-${s}`).style.display = s === name ? '' : 'none';
  });
  document.querySelectorAll('.admin-sidebar .nav-link').forEach((a, i) => {
    a.classList.toggle('active', ['users','defaults'][i] === name);
  });
  if (name === 'users')    loadUsers();
  if (name === 'defaults') loadDefaults();
}

async function logout() {
  await fetch('/api/auth/logout', { method:'POST' });
  window.location.href = '/login';
}

// ════════════════════════════════════════════════════════
//  UTILISATEURS
// ════════════════════════════════════════════════════════
let _users = [];

async function loadUsers() {
  _users = await API.get('/api/admin/users');
  renderUsers();
}

function roleBadge(role) {
  const cfg = {
    admin:        { cls:'role-badge-admin',        icon:'shield-fill',  label:'Admin' },
    gestionnaire: { cls:'role-badge-gestionnaire', icon:'person-fill',  label:'Gestionnaire' },
    readonly:     { cls:'role-badge-readonly',     icon:'eye-fill',     label:'Lecture seule' },
  }[role] || { cls:'role-badge-readonly', icon:'question', label: role };
  return `<span class="badge ${cfg.cls} px-2 py-1">
            <i class="bi bi-${cfg.icon} me-1"></i>${cfg.label}
          </span>`;
}

function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (!_users.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Aucun utilisateur.</td></tr>';
    return;
  }
  tbody.innerHTML = _users.map(u => `
    <tr>
      <td class="ps-4">
        <div class="fw-semibold">${esc(u.username)}</div>
        ${u.created_by_name ? `<small class="text-muted">Créé par ${esc(u.created_by_name)}</small>` : '<small class="text-muted">Compte initial</small>'}
      </td>
      <td><small class="text-muted">${esc(u.email || '—')}</small></td>
      <td>${roleBadge(u.role)}</td>
      <td>
        <span class="status-dot ${u.is_active ? 'active' : 'inactive'} me-1"></span>
        <small>${u.is_active ? 'Actif' : 'Désactivé'}</small>
      </td>
      <td><small class="text-muted">${esc(u.created_at)}</small></td>
      <td class="pe-4">
        <div class="d-flex gap-1">
          <button class="btn btn-sm btn-outline-secondary" onclick="showUserModal('${u.id}')" title="Modifier">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-${u.is_active ? 'warning' : 'success'}"
                  onclick="toggleUser('${u.id}',${!u.is_active})" title="${u.is_active ? 'Désactiver' : 'Activer'}">
            <i class="bi bi-${u.is_active ? 'pause-circle' : 'play-circle'}"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteUser('${u.id}','${esc(u.username)}')" title="Supprimer">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function showUserModal(id) {
  const u    = id ? _users.find(x => x.id === id) : null;
  const title = u ? `<i class="bi bi-pencil me-2"></i>Modifier ${esc(u.username)}`
                  : `<i class="bi bi-person-plus me-2"></i>Nouvel utilisateur`;
  openModal(title, `
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label fw-semibold">Nom d'utilisateur ${u ? '' : '<span class="text-danger">*</span>'}</label>
        <input type="text" class="form-control" id="u-username"
               value="${esc(u?.username || '')}" ${u ? 'readonly' : 'required'}>
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">Email</label>
        <input type="email" class="form-control" id="u-email" value="${esc(u?.email || '')}">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">Mot de passe ${u ? '<small class="text-muted">(laisser vide = inchangé)</small>' : '<span class="text-danger">*</span>'}</label>
        <input type="password" class="form-control" id="u-password" ${u ? '' : 'required'} placeholder="${u ? '••••••••' : 'Mot de passe'}">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">Rôle</label>
        <select class="form-select" id="u-role">
          <option value="gestionnaire" ${u?.role === 'gestionnaire' ? 'selected' : ''}>Gestionnaire</option>
          <option value="readonly"     ${u?.role === 'readonly'     ? 'selected' : ''}>Lecture seule</option>
          <option value="admin"        ${u?.role === 'admin'        ? 'selected' : ''}>Administrateur</option>
        </select>
      </div>
      <div class="col-12 p-3 rounded" style="background:#f8fafc;font-size:.82rem">
        <strong>Rôles :</strong>
        <span class="badge role-badge-admin ms-2">Admin</span> accès total + administration ·
        <span class="badge role-badge-gestionnaire ms-1">Gestionnaire</span> CRUD chantiers ·
        <span class="badge role-badge-readonly ms-1">Lecture seule</span> consultation uniquement
      </div>
    </div>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="saveUser('${id || ''}')">
       <i class="bi bi-check-lg me-1"></i>${u ? 'Enregistrer' : 'Créer'}
     </button>`, 'modal-md');
}

async function saveUser(id) {
  const username = document.getElementById('u-username').value.trim();
  const password = document.getElementById('u-password').value;
  const email    = document.getElementById('u-email').value.trim();
  const role     = document.getElementById('u-role').value;

  if (!id && (!username || !password)) { toast('Nom et mot de passe requis.', 'warning'); return; }

  const data = { email, role };
  if (!id)           data.username = username;
  if (password)      data.password = password;

  const res = id ? await API.put(`/api/admin/users/${id}`, data)
                 : await API.post('/api/admin/users', data);
  if (res.error) { toast(res.error, 'danger'); return; }

  toast(id ? 'Utilisateur mis à jour.' : 'Utilisateur créé.');
  closeModal(); loadUsers();
}

async function toggleUser(id, active) {
  const res = await API.put(`/api/admin/users/${id}`, { is_active: active });
  if (res.error) { toast(res.error, 'danger'); return; }
  toast(active ? 'Compte activé.' : 'Compte désactivé.', active ? 'success' : 'warning');
  loadUsers();
}

function confirmDeleteUser(id, username) {
  openModal('<i class="bi bi-exclamation-triangle me-2"></i>Confirmer la suppression',
    `<p>Supprimer l'utilisateur <strong>${esc(username)}</strong> définitivement ?</p>`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-danger" onclick="deleteUser('${id}')">
       <i class="bi bi-trash me-1"></i>Supprimer
     </button>`, 'modal-sm');
}

async function deleteUser(id) {
  const res = await API.del(`/api/admin/users/${id}`);
  if (res.error) { toast(res.error, 'danger'); return; }
  toast('Utilisateur supprimé.', 'danger'); closeModal(); loadUsers();
}

// ════════════════════════════════════════════════════════
//  CONFIGURATION PAR DÉFAUT
// ════════════════════════════════════════════════════════
let _defaults = { categories: [], tasks: [] };

async function loadDefaults() {
  _defaults = await API.get('/api/admin/defaults');
  renderDefaults();
}

function renderDefaults() {
  const container = document.getElementById('defaults-container');
  container.innerHTML = _defaults.categories.map(cat => {
    const tasks = _defaults.tasks.filter(t => t.category_nom === cat.nom);
    return `
      <div class="col-lg-6 col-xl-4">
        <div class="section-card h-100">
          <div class="p-3 border-bottom d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2">
              <span class="fw-semibold">${esc(cat.nom)}</span>
              <span class="badge ${cat.is_active ? 'bg-success' : 'bg-secondary'} rounded-pill" style="font-size:.65rem">
                ${cat.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-${cat.is_active ? 'warning' : 'success'}"
                      onclick="toggleDefaultCat('${cat.id}',${!cat.is_active})"
                      title="${cat.is_active ? 'Désactiver' : 'Activer'}">
                <i class="bi bi-${cat.is_active ? 'pause' : 'play'}"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger"
                      onclick="deleteDefaultCat('${cat.id}','${esc(cat.nom)}')" title="Supprimer">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="p-3">
            <div id="dtasks-${cat.id}">
              ${tasks.length === 0
                ? '<p class="text-muted small mb-2">Aucune tâche par défaut.</p>'
                : tasks.map(t => `
                    <div class="def-task-item ${t.is_active ? '' : 'inactive'}" id="dti-${t.id}">
                      <span class="flex-grow-1 small">${esc(t.nom)}</span>
                      <button class="btn btn-sm py-0 px-1 ${t.is_active ? 'text-warning' : 'text-success'}"
                              onclick="toggleDefaultTask('${t.id}',${!t.is_active})"
                              title="${t.is_active ? 'Désactiver' : 'Activer'}">
                        <i class="bi bi-${t.is_active ? 'eye-slash' : 'eye'}" style="font-size:.75rem"></i>
                      </button>
                      <button class="btn btn-sm py-0 px-1 text-danger"
                              onclick="deleteDefaultTask('${t.id}')" title="Supprimer">
                        <i class="bi bi-x-lg" style="font-size:.75rem"></i>
                      </button>
                    </div>`).join('')}
            </div>
            <div class="d-flex gap-2 mt-2">
              <input type="text" class="form-control form-control-sm" id="new-dtask-${cat.id}"
                     placeholder="Nouvelle tâche…"
                     onkeydown="if(event.key==='Enter') addDefaultTask('${cat.id}','${esc(cat.nom)}')">
              <button class="btn btn-sm btn-primary"
                      onclick="addDefaultTask('${cat.id}','${esc(cat.nom)}')">
                <i class="bi bi-plus-lg"></i>
              </button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function showAddCatModal() {
  openModal('<i class="bi bi-plus-circle me-2"></i>Nouvelle catégorie par défaut',
    `<label class="form-label fw-semibold">Nom de la catégorie</label>
     <input type="text" class="form-control" id="new-dcat-nom" placeholder="Ex: Étanchéité…">`,
    `<button class="btn btn-outline-secondary" data-bs-dismiss="modal">Annuler</button>
     <button class="btn btn-primary" onclick="addDefaultCat()">
       <i class="bi bi-plus-lg me-1"></i>Ajouter
     </button>`, 'modal-sm');
  setTimeout(() => document.getElementById('new-dcat-nom')?.focus(), 300);
}

async function addDefaultCat() {
  const nom = document.getElementById('new-dcat-nom').value.trim();
  if (!nom) { toast('Entrez un nom.', 'warning'); return; }
  const res = await API.post('/api/admin/defaults/categories', { nom });
  if (res.error) { toast(res.error, 'danger'); return; }
  toast('Catégorie ajoutée.'); closeModal(); loadDefaults();
}

async function toggleDefaultCat(id, active) {
  await API.put(`/api/admin/defaults/categories/${id}`, { is_active: active });
  toast(active ? 'Catégorie activée.' : 'Catégorie désactivée.', active ? 'success' : 'warning');
  loadDefaults();
}

async function deleteDefaultCat(id, nom) {
  if (!confirm(`Supprimer la catégorie "${nom}" et toutes ses tâches par défaut ?`)) return;
  await API.del(`/api/admin/defaults/categories/${id}`);
  toast('Catégorie supprimée.', 'danger'); loadDefaults();
}

async function addDefaultTask(catId, catNom) {
  const input = document.getElementById(`new-dtask-${catId}`);
  const nom   = input.value.trim();
  if (!nom) return;
  const res = await API.post('/api/admin/defaults/tasks', { category_nom: catNom, nom });
  if (res.error) { toast(res.error, 'danger'); return; }
  input.value = '';
  toast('Tâche ajoutée.'); loadDefaults();
}

async function toggleDefaultTask(id, active) {
  await API.put(`/api/admin/defaults/tasks/${id}`, { is_active: active });
  loadDefaults();
}

async function deleteDefaultTask(id) {
  await API.del(`/api/admin/defaults/tasks/${id}`);
  toast('Tâche supprimée.', 'danger'); loadDefaults();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => loadUsers());
