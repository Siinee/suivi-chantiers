from flask import Flask, jsonify, request, render_template, send_file
import openpyxl
from openpyxl import Workbook
import os, uuid

app = Flask(__name__)
EXCEL_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chantiers.xlsx')

# ── Catégories de suivi (tâches) ──────────────────────────────────────────────
# Seule catégorie par défaut = Préparatoire (basée sur le fichier Excel client)
DEFAULT_CATEGORIES = ['Préparatoire']

DEFAULT_TASKS_PREPARATOIRE = [
    'Relevé de gaine', 'Demande Plan (Fournisseur)', 'Plan ascenseur (BE)',
    'Commande Fournisseur', 'Demande Mise en FAB', 'Demande PGC',
    'PPSPS Manei', 'Planning Prév fournisseur', 'Planning Prév BE/Client',
    'Devis ST', 'Demande Agrément ST', 'Commande ST',
    'PPSPS ST', 'Demande Date VIC', 'Commande Base de vie', 'Commande Container'
]

# ── Phases planning (catégories de planning, pas de suivi) ────────────────────
PLANNING_PHASES = [
    'Désamiantage', 'Montage', 'Maçonnerie', 'CE/Levée de réserve',
    'Démontage', 'Pose de SAS', 'Mise à disposition', 'Contrôle & Essai'
]

CHANTIER_HEADERS  = ['id', 'nom', 'adresse', 'client', 'logoUrl', 'dateDebut', 'dateFin', 'commentaires']
CATEGORIE_HEADERS = ['id', 'chantierId', 'nom', 'ordre', 'isCustom']
TACHE_HEADERS     = ['id', 'categorieId', 'nom', 'etabli', 'envoye', 'valide']
PLANNING_HEADERS  = ['id', 'chantierId', 'phase', 'dateDebut', 'dateFin']


def ensure_data_dir():
    os.makedirs(os.path.dirname(EXCEL_PATH), exist_ok=True)


def create_empty_workbook():
    wb = Workbook()
    ws = wb.active; ws.title = 'Chantiers'
    ws.append(CHANTIER_HEADERS)
    wb.create_sheet('Categories').append(CATEGORIE_HEADERS)
    wb.create_sheet('Taches').append(TACHE_HEADERS)
    wb.create_sheet('Planning').append(PLANNING_HEADERS)
    return wb


def load_wb():
    ensure_data_dir()
    if not os.path.exists(EXCEL_PATH):
        wb = create_empty_workbook(); wb.save(EXCEL_PATH)
    wb = openpyxl.load_workbook(EXCEL_PATH)
    # Créer les feuilles manquantes (rétro-compatibilité)
    for name, headers in [('Chantiers', CHANTIER_HEADERS), ('Categories', CATEGORIE_HEADERS),
                           ('Taches', TACHE_HEADERS), ('Planning', PLANNING_HEADERS)]:
        if name not in wb.sheetnames:
            wb.create_sheet(name).append(headers)
    return wb


def save_wb(wb): ensure_data_dir(); wb.save(EXCEL_PATH)


def sheet_to_records(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows: return []
    headers = [str(h) for h in rows[0]]
    return [{headers[i]: (row[i] if i < len(row) else None)
             for i in range(len(headers))}
            for row in rows[1:] if not all(v is None for v in row)]


def records_to_sheet(ws, records, headers):
    ws.delete_rows(1, ws.max_row + 1)
    ws.append(headers)
    for r in records:
        ws.append([r.get(h) for h in headers])


def int_val(v):
    try: return int(v or 0)
    except: return 0


def task_score(t):
    return int_val(t.get('etabli')) + int_val(t.get('envoye')) + int_val(t.get('valide'))


def compute_progress(categories, taches, chantier_id):
    cats = [c for c in categories if str(c.get('chantierId')) == str(chantier_id)]
    total_max = total_score = 0
    for cat in cats:
        t_list = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        total_max   += len(t_list) * 6
        total_score += sum(task_score(t) for t in t_list)
    return round((total_score / total_max * 100) if total_max > 0 else 0)


# ── Chantiers ─────────────────────────────────────────────────────────────────

@app.route('/')
def index(): return render_template('index.html')


@app.route('/api/chantiers')
def get_chantiers():
    wb = load_wb()
    chantiers  = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])
    for c in chantiers:
        c['progress'] = compute_progress(categories, taches, c['id'])
    return jsonify(chantiers)


@app.route('/api/chantiers/<cid>')
def get_chantier(cid):
    wb = load_wb()
    chantiers  = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])
    c = next((x for x in chantiers if str(x['id']) == cid), None)
    if not c: return jsonify({'error': 'Not found'}), 404
    cats = sorted([x for x in categories if str(x.get('chantierId')) == cid],
                  key=lambda x: x.get('ordre') or 0)
    for cat in cats:
        t_list  = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        score   = sum(task_score(t) for t in t_list)
        max_s   = len(t_list) * 6
        cat.update({'tasks': t_list, 'totalCount': len(t_list),
                    'score': score, 'maxScore': max_s,
                    'progress': round((score / max_s * 100) if max_s > 0 else 0)})
    c['categories'] = cats
    c['progress']   = compute_progress(categories, taches, cid)
    return jsonify(c)


@app.route('/api/chantiers', methods=['POST'])
def create_chantier():
    data = request.json
    wb = load_wb()
    cid = str(uuid.uuid4())
    new_c = {k: data.get(k, '') for k in CHANTIER_HEADERS}
    new_c['id'] = cid
    chantiers = sheet_to_records(wb['Chantiers']); chantiers.append(new_c)
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])
    for i, name in enumerate(DEFAULT_CATEGORIES):
        cat_id = str(uuid.uuid4())
        categories.append({'id': cat_id, 'chantierId': cid, 'nom': name, 'ordre': i, 'isCustom': False})
        if name == 'Préparatoire':
            for t_nom in DEFAULT_TASKS_PREPARATOIRE:
                taches.append({'id': str(uuid.uuid4()), 'categorieId': cat_id,
                               'nom': t_nom, 'etabli': 0, 'envoye': 0, 'valide': 0})
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
    records_to_sheet(wb['Taches'],     taches,     TACHE_HEADERS)
    save_wb(wb); new_c['progress'] = 0
    return jsonify(new_c), 201


@app.route('/api/chantiers/<cid>', methods=['PUT'])
def update_chantier(cid):
    data = request.json; wb = load_wb()
    chantiers = sheet_to_records(wb['Chantiers'])
    for c in chantiers:
        if str(c['id']) == cid:
            for k in ['nom','adresse','client','logoUrl','dateDebut','dateFin','commentaires']:
                if k in data: c[k] = data[k]
            break
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)
    save_wb(wb); return jsonify({'success': True})


@app.route('/api/chantiers/<cid>', methods=['DELETE'])
def delete_chantier(cid):
    wb = load_wb()
    records_to_sheet(wb['Chantiers'],
                     [c for c in sheet_to_records(wb['Chantiers']) if str(c['id']) != cid],
                     CHANTIER_HEADERS)
    categories = sheet_to_records(wb['Categories'])
    cat_ids    = {str(c['id']) for c in categories if str(c.get('chantierId')) == cid}
    records_to_sheet(wb['Categories'],
                     [c for c in categories if str(c.get('chantierId')) != cid],
                     CATEGORIE_HEADERS)
    records_to_sheet(wb['Taches'],
                     [t for t in sheet_to_records(wb['Taches']) if str(t.get('categorieId')) not in cat_ids],
                     TACHE_HEADERS)
    records_to_sheet(wb['Planning'],
                     [p for p in sheet_to_records(wb['Planning']) if str(p.get('chantierId')) != cid],
                     PLANNING_HEADERS)
    save_wb(wb); return jsonify({'success': True})


# ── Catégories ────────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['POST'])
def create_categorie():
    data = request.json; wb = load_wb()
    categories = sheet_to_records(wb['Categories'])
    new_cat = {'id': str(uuid.uuid4()), 'chantierId': data['chantierId'],
               'nom': data['nom'], 'ordre': len(categories), 'isCustom': True}
    categories.append(new_cat)
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
    save_wb(wb)
    new_cat.update({'tasks': [], 'progress': 0, 'totalCount': 0, 'score': 0, 'maxScore': 0})
    return jsonify(new_cat), 201


@app.route('/api/categories/<cat_id>', methods=['DELETE'])
def delete_categorie(cat_id):
    wb = load_wb()
    records_to_sheet(wb['Categories'],
                     [c for c in sheet_to_records(wb['Categories']) if str(c['id']) != cat_id],
                     CATEGORIE_HEADERS)
    records_to_sheet(wb['Taches'],
                     [t for t in sheet_to_records(wb['Taches']) if str(t.get('categorieId')) != cat_id],
                     TACHE_HEADERS)
    save_wb(wb); return jsonify({'success': True})


# ── Tâches ────────────────────────────────────────────────────────────────────

@app.route('/api/taches', methods=['POST'])
def create_tache():
    data = request.json; wb = load_wb()
    taches = sheet_to_records(wb['Taches'])
    new_t  = {'id': str(uuid.uuid4()), 'categorieId': data['categorieId'],
              'nom': data['nom'], 'etabli': 0, 'envoye': 0, 'valide': 0}
    taches.append(new_t)
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb); return jsonify(new_t), 201


@app.route('/api/taches/<tid>', methods=['PUT'])
def update_tache(tid):
    data = request.json; wb = load_wb()
    taches = sheet_to_records(wb['Taches'])
    for t in taches:
        if str(t['id']) == tid:
            for k in ['nom','etabli','envoye','valide']:
                if k in data: t[k] = data[k]
            break
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb); return jsonify({'success': True})


@app.route('/api/taches/<tid>', methods=['DELETE'])
def delete_tache(tid):
    wb = load_wb()
    records_to_sheet(wb['Taches'],
                     [t for t in sheet_to_records(wb['Taches']) if str(t['id']) != tid],
                     TACHE_HEADERS)
    save_wb(wb); return jsonify({'success': True})


# ── Planning items ────────────────────────────────────────────────────────────

@app.route('/api/planning/items')
def get_planning_items():
    wb = load_wb()
    return jsonify(sheet_to_records(wb['Planning']))


@app.route('/api/planning/items', methods=['POST'])
def create_planning_item():
    data = request.json; wb = load_wb()
    items = sheet_to_records(wb['Planning'])
    new_item = {'id': str(uuid.uuid4()), 'chantierId': data['chantierId'],
                'phase': data['phase'], 'dateDebut': data['dateDebut'], 'dateFin': data['dateFin']}
    items.append(new_item)
    records_to_sheet(wb['Planning'], items, PLANNING_HEADERS)
    save_wb(wb); return jsonify(new_item), 201


@app.route('/api/planning/items/<pid>', methods=['PUT'])
def update_planning_item(pid):
    data = request.json; wb = load_wb()
    items = sheet_to_records(wb['Planning'])
    for item in items:
        if str(item['id']) == pid:
            for k in ['phase','dateDebut','dateFin']:
                if k in data: item[k] = data[k]
            break
    records_to_sheet(wb['Planning'], items, PLANNING_HEADERS)
    save_wb(wb); return jsonify({'success': True})


@app.route('/api/planning/items/<pid>', methods=['DELETE'])
def delete_planning_item(pid):
    wb = load_wb()
    records_to_sheet(wb['Planning'],
                     [i for i in sheet_to_records(wb['Planning']) if str(i['id']) != pid],
                     PLANNING_HEADERS)
    save_wb(wb); return jsonify({'success': True})


# ── Export / Import Excel ─────────────────────────────────────────────────────

@app.route('/api/export')
def export_excel():
    if not os.path.exists(EXCEL_PATH): load_wb()
    return send_file(EXCEL_PATH, as_attachment=True, download_name='chantiers.xlsx')


@app.route('/api/import', methods=['POST'])
def import_excel():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    ensure_data_dir(); request.files['file'].save(EXCEL_PATH)
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
