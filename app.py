from flask import Flask, jsonify, request, render_template, send_file
import openpyxl
from openpyxl import Workbook
import os
import uuid

app = Flask(__name__)

EXCEL_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chantiers.xlsx')

# Catégories par défaut créées à chaque nouveau chantier
DEFAULT_CATEGORIES = [
    'Préparatoire', 'Montage', 'Maçonnerie', 'CE/Levée de réserve',
    'Démontage', 'Pose de SAS', 'Mise à disposition', 'Contrôle & Essai', 'Désamiantage'
]

# Tâches pré-chargées pour la phase Préparatoire (issues du fichier Excel client)
DEFAULT_TASKS_PREPARATOIRE = [
    'Relevé de gaine', 'Demande Plan (Fournisseur)', 'Plan ascenseur (BE)',
    'Commande Fournisseur', 'Demande Mise en FAB', 'Demande PGC',
    'PPSPS Manei', 'Planning Prév fournisseur', 'Planning Prév BE/Client',
    'Devis ST', 'Demande Agrément ST', 'Commande ST',
    'PPSPS ST', 'Demande Date VIC', 'Commande Base de vie', 'Commande Container'
]

CHANTIER_HEADERS  = ['id', 'nom', 'adresse', 'client', 'logoUrl', 'dateDebut', 'dateFin', 'commentaires']
CATEGORIE_HEADERS = ['id', 'chantierId', 'nom', 'ordre', 'isCustom']
# établi / envoyé / validé : 0 = À commencer | 1 = En cours | 2 = Terminé
TACHE_HEADERS     = ['id', 'categorieId', 'nom', 'etabli', 'envoye', 'valide']


def ensure_data_dir():
    os.makedirs(os.path.dirname(EXCEL_PATH), exist_ok=True)


def create_empty_workbook():
    wb = Workbook()
    ws = wb.active
    ws.title = 'Chantiers'
    ws.append(CHANTIER_HEADERS)
    wb.create_sheet('Categories').append(CATEGORIE_HEADERS)
    wb.create_sheet('Taches').append(TACHE_HEADERS)
    return wb


def load_wb():
    ensure_data_dir()
    if not os.path.exists(EXCEL_PATH):
        wb = create_empty_workbook()
        wb.save(EXCEL_PATH)
    return openpyxl.load_workbook(EXCEL_PATH)


def save_wb(wb):
    ensure_data_dir()
    wb.save(EXCEL_PATH)


def sheet_to_records(ws):
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h) for h in rows[0]]
    records = []
    for row in rows[1:]:
        if all(v is None for v in row):
            continue
        records.append({headers[i]: (row[i] if i < len(row) else None) for i in range(len(headers))})
    return records


def records_to_sheet(ws, records, headers):
    ws.delete_rows(1, ws.max_row + 1)
    ws.append(headers)
    for r in records:
        ws.append([r.get(h) for h in headers])


def int_val(v):
    """Convertit une valeur de statut en entier 0/1/2."""
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def task_score(t):
    """Somme des 3 étapes d'une tâche (max = 6)."""
    return int_val(t.get('etabli')) + int_val(t.get('envoye')) + int_val(t.get('valide'))


def compute_progress(categories, taches, chantier_id):
    cats = [c for c in categories if str(c.get('chantierId')) == str(chantier_id)]
    total_max, total_score = 0, 0
    for cat in cats:
        t_list = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        total_max   += len(t_list) * 6
        total_score += sum(task_score(t) for t in t_list)
    return round((total_score / total_max * 100) if total_max > 0 else 0)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Chantiers ─────────────────────────────────────────────────────────────────

@app.route('/api/chantiers', methods=['GET'])
def get_chantiers():
    wb = load_wb()
    chantiers  = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])
    for c in chantiers:
        c['progress'] = compute_progress(categories, taches, c['id'])
    return jsonify(chantiers)


@app.route('/api/chantiers/<chantier_id>', methods=['GET'])
def get_chantier(chantier_id):
    wb = load_wb()
    chantiers  = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])

    chantier = next((c for c in chantiers if str(c['id']) == chantier_id), None)
    if not chantier:
        return jsonify({'error': 'Not found'}), 404

    cats = sorted(
        [c for c in categories if str(c.get('chantierId')) == chantier_id],
        key=lambda x: x.get('ordre') or 0
    )
    for cat in cats:
        tasks = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        score = sum(task_score(t) for t in tasks)
        max_s = len(tasks) * 6
        cat['tasks']      = tasks
        cat['totalCount'] = len(tasks)
        cat['score']      = score
        cat['maxScore']   = max_s
        cat['progress']   = round((score / max_s * 100) if max_s > 0 else 0)

    chantier['categories'] = cats
    chantier['progress']   = compute_progress(categories, taches, chantier_id)
    return jsonify(chantier)


@app.route('/api/chantiers', methods=['POST'])
def create_chantier():
    data = request.json
    wb = load_wb()
    chantier_id = str(uuid.uuid4())
    new_c = {k: data.get(k, '') for k in CHANTIER_HEADERS}
    new_c['id'] = chantier_id

    chantiers = sheet_to_records(wb['Chantiers'])
    chantiers.append(new_c)
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)

    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])

    for i, name in enumerate(DEFAULT_CATEGORIES):
        cat_id = str(uuid.uuid4())
        categories.append({'id': cat_id, 'chantierId': chantier_id, 'nom': name, 'ordre': i, 'isCustom': False})
        # Pré-charger les tâches de la phase Préparatoire
        if name == 'Préparatoire':
            for t_nom in DEFAULT_TASKS_PREPARATOIRE:
                taches.append({'id': str(uuid.uuid4()), 'categorieId': cat_id,
                                'nom': t_nom, 'etabli': 0, 'envoye': 0, 'valide': 0})

    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
    records_to_sheet(wb['Taches'],     taches,     TACHE_HEADERS)
    save_wb(wb)
    new_c['progress'] = 0
    return jsonify(new_c), 201


@app.route('/api/chantiers/<chantier_id>', methods=['PUT'])
def update_chantier(chantier_id):
    data = request.json
    wb = load_wb()
    chantiers = sheet_to_records(wb['Chantiers'])
    for c in chantiers:
        if str(c['id']) == chantier_id:
            for key in ['nom', 'adresse', 'client', 'logoUrl', 'dateDebut', 'dateFin', 'commentaires']:
                if key in data:
                    c[key] = data[key]
            break
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)
    save_wb(wb)
    return jsonify({'success': True})


@app.route('/api/chantiers/<chantier_id>', methods=['DELETE'])
def delete_chantier(chantier_id):
    wb = load_wb()
    chantiers = [c for c in sheet_to_records(wb['Chantiers']) if str(c['id']) != chantier_id]
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)

    categories = sheet_to_records(wb['Categories'])
    cat_ids    = {str(c['id']) for c in categories if str(c.get('chantierId')) == chantier_id}
    categories = [c for c in categories if str(c.get('chantierId')) != chantier_id]
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)

    taches = [t for t in sheet_to_records(wb['Taches']) if str(t.get('categorieId')) not in cat_ids]
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb)
    return jsonify({'success': True})


# ── Catégories ────────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['POST'])
def create_categorie():
    data = request.json
    wb = load_wb()
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
    categories = [c for c in sheet_to_records(wb['Categories']) if str(c['id']) != cat_id]
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
    taches = [t for t in sheet_to_records(wb['Taches']) if str(t.get('categorieId')) != cat_id]
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb)
    return jsonify({'success': True})


# ── Tâches ────────────────────────────────────────────────────────────────────

@app.route('/api/taches', methods=['POST'])
def create_tache():
    data = request.json
    wb = load_wb()
    taches = sheet_to_records(wb['Taches'])
    new_t = {'id': str(uuid.uuid4()), 'categorieId': data['categorieId'],
              'nom': data['nom'], 'etabli': 0, 'envoye': 0, 'valide': 0}
    taches.append(new_t)
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb)
    return jsonify(new_t), 201


@app.route('/api/taches/<tache_id>', methods=['PUT'])
def update_tache(tache_id):
    data = request.json
    wb = load_wb()
    taches = sheet_to_records(wb['Taches'])
    for t in taches:
        if str(t['id']) == tache_id:
            for key in ['nom', 'etabli', 'envoye', 'valide']:
                if key in data:
                    t[key] = data[key]
            break
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb)
    return jsonify({'success': True})


@app.route('/api/taches/<tache_id>', methods=['DELETE'])
def delete_tache(tache_id):
    wb = load_wb()
    taches = [t for t in sheet_to_records(wb['Taches']) if str(t['id']) != tache_id]
    records_to_sheet(wb['Taches'], taches, TACHE_HEADERS)
    save_wb(wb)
    return jsonify({'success': True})


# ── Planning ──────────────────────────────────────────────────────────────────

@app.route('/api/planning', methods=['GET'])
def get_planning():
    wb = load_wb()
    chantiers  = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches     = sheet_to_records(wb['Taches'])

    result = []
    for ch in chantiers:
        cats = sorted(
            [c for c in categories if str(c.get('chantierId')) == str(ch['id'])],
            key=lambda x: x.get('ordre') or 0
        )
        cats_info, total_max, total_score = [], 0, 0
        for cat in cats:
            t_list = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
            score  = sum(task_score(t) for t in t_list)
            max_s  = len(t_list) * 6
            total_max   += max_s
            total_score += score
            cats_info.append({'nom': cat['nom'],
                               'progress': round((score / max_s * 100) if max_s > 0 else 0),
                               'score': score, 'maxScore': max_s})
        result.append({**ch,
                        'progress': round((total_score / total_max * 100) if total_max > 0 else 0),
                        'categories': cats_info})
    return jsonify(result)


# ── Excel import / export ─────────────────────────────────────────────────────

@app.route('/api/export')
def export_excel():
    if not os.path.exists(EXCEL_PATH):
        load_wb()
    return send_file(EXCEL_PATH, as_attachment=True, download_name='chantiers.xlsx')


@app.route('/api/import', methods=['POST'])
def import_excel():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    ensure_data_dir()
    request.files['file'].save(EXCEL_PATH)
    return jsonify({'success': True})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
