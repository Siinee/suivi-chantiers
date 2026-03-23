from flask import Flask, jsonify, request, render_template, send_file
import openpyxl
from openpyxl import Workbook
import os
import uuid

app = Flask(__name__)

EXCEL_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chantiers.xlsx')

DEFAULT_CATEGORIES = [
    'Montage', 'Maçonnerie', 'CE/Levée de réserve', 'Démontage',
    'Pose de SAS', 'Mise à disposition', 'Contrôle & Essai', 'Désamiantage'
]

CHANTIER_HEADERS = ['id', 'nom', 'adresse', 'client', 'logoUrl', 'dateDebut', 'dateFin', 'commentaires']
CATEGORIE_HEADERS = ['id', 'chantierId', 'nom', 'ordre', 'isCustom']
TACHE_HEADERS = ['id', 'categorieId', 'nom', 'done']


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


def is_done(val):
    return val in (True, 1, '1', 'True', 'true', 'TRUE')


def compute_progress(categories, taches, chantier_id):
    cats = [c for c in categories if str(c.get('chantierId')) == str(chantier_id)]
    total, done = 0, 0
    for cat in cats:
        t_list = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        total += len(t_list)
        done += sum(1 for t in t_list if is_done(t.get('done')))
    return round((done / total * 100) if total > 0 else 0)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Chantiers ─────────────────────────────────────────────────────────────────

@app.route('/api/chantiers', methods=['GET'])
def get_chantiers():
    wb = load_wb()
    chantiers = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches = sheet_to_records(wb['Taches'])
    for c in chantiers:
        c['progress'] = compute_progress(categories, taches, c['id'])
    return jsonify(chantiers)


@app.route('/api/chantiers/<chantier_id>', methods=['GET'])
def get_chantier(chantier_id):
    wb = load_wb()
    chantiers = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches = sheet_to_records(wb['Taches'])

    chantier = next((c for c in chantiers if str(c['id']) == chantier_id), None)
    if not chantier:
        return jsonify({'error': 'Not found'}), 404

    cats = sorted(
        [c for c in categories if str(c.get('chantierId')) == chantier_id],
        key=lambda x: x.get('ordre') or 0
    )
    for cat in cats:
        tasks = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
        done = sum(1 for t in tasks if is_done(t.get('done')))
        cat['tasks'] = tasks
        cat['doneCount'] = done
        cat['totalCount'] = len(tasks)
        cat['progress'] = round((done / len(tasks) * 100) if tasks else 0)

    chantier['categories'] = cats
    chantier['progress'] = compute_progress(categories, taches, chantier_id)
    return jsonify(chantier)


@app.route('/api/chantiers', methods=['POST'])
def create_chantier():
    data = request.json
    wb = load_wb()
    chantier_id = str(uuid.uuid4())
    new_c = {
        'id': chantier_id,
        'nom': data.get('nom', ''),
        'adresse': data.get('adresse', ''),
        'client': data.get('client', ''),
        'logoUrl': data.get('logoUrl', ''),
        'dateDebut': data.get('dateDebut', ''),
        'dateFin': data.get('dateFin', ''),
        'commentaires': data.get('commentaires', ''),
    }
    chantiers = sheet_to_records(wb['Chantiers'])
    chantiers.append(new_c)
    records_to_sheet(wb['Chantiers'], chantiers, CHANTIER_HEADERS)

    categories = sheet_to_records(wb['Categories'])
    for i, name in enumerate(DEFAULT_CATEGORIES):
        categories.append({
            'id': str(uuid.uuid4()), 'chantierId': chantier_id,
            'nom': name, 'ordre': i, 'isCustom': False
        })
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
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
    cat_ids = {str(c['id']) for c in categories if str(c.get('chantierId')) == chantier_id}
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
    new_cat = {
        'id': str(uuid.uuid4()),
        'chantierId': data['chantierId'],
        'nom': data['nom'],
        'ordre': len(categories),
        'isCustom': True
    }
    categories.append(new_cat)
    records_to_sheet(wb['Categories'], categories, CATEGORIE_HEADERS)
    save_wb(wb)
    new_cat.update({'tasks': [], 'progress': 0, 'doneCount': 0, 'totalCount': 0})
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
    new_t = {'id': str(uuid.uuid4()), 'categorieId': data['categorieId'], 'nom': data['nom'], 'done': False}
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
            if 'done' in data:
                t['done'] = data['done']
            if 'nom' in data:
                t['nom'] = data['nom']
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
    chantiers = sheet_to_records(wb['Chantiers'])
    categories = sheet_to_records(wb['Categories'])
    taches = sheet_to_records(wb['Taches'])

    result = []
    for ch in chantiers:
        cats = sorted(
            [c for c in categories if str(c.get('chantierId')) == str(ch['id'])],
            key=lambda x: x.get('ordre') or 0
        )
        cats_info = []
        total_all, done_all = 0, 0
        for cat in cats:
            t_list = [t for t in taches if str(t.get('categorieId')) == str(cat['id'])]
            done = sum(1 for t in t_list if is_done(t.get('done')))
            total_all += len(t_list)
            done_all += done
            cats_info.append({
                'nom': cat['nom'],
                'progress': round((done / len(t_list) * 100) if t_list else 0),
                'done': done, 'total': len(t_list)
            })
        result.append({
            **ch,
            'progress': round((done_all / total_all * 100) if total_all > 0 else 0),
            'categories': cats_info
        })
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
