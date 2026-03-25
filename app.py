"""
Suivi Chantiers — Backend Flask
Base de données : SQLite (data/chantiers.db)
API identique à la version Excel, frontend inchangé.
"""
from flask import Flask, jsonify, request, render_template, send_file
import sqlite3, os, uuid, io
import openpyxl
from openpyxl import Workbook

app = Flask(__name__)
DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chantiers.db')

# Phases de planning (référence partagée)
PLANNING_PHASES = [
    'Désamiantage', 'Montage', 'Maçonnerie', 'CE/Levée de réserve',
    'Démontage', 'Pose de SAS', 'Mise à disposition', 'Contrôle & Essai'
]

DEFAULT_TASKS_PREPARATOIRE = [
    'Relevé de gaine', 'Demande Plan (Fournisseur)', 'Plan ascenseur (BE)',
    'Commande Fournisseur', 'Demande Mise en FAB', 'Demande PGC',
    'PPSPS Manei', 'Planning Prév fournisseur', 'Planning Prév BE/Client',
    'Devis ST', 'Demande Agrément ST', 'Commande ST',
    'PPSPS ST', 'Demande Date VIC', 'Commande Base de vie', 'Commande Container'
]

# ── Base de données ───────────────────────────────────────────────────────────

def get_db():
    """Connexion SQLite avec retour de dict."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Création des tables si elles n'existent pas."""
    with get_db() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS chantiers (
                id           TEXT PRIMARY KEY,
                nom          TEXT NOT NULL,
                adresse      TEXT,
                client       TEXT,
                logo_url     TEXT,
                logo_blob    BLOB,
                logo_mime    TEXT,
                date_debut   TEXT,
                date_fin     TEXT,
                commentaires TEXT
            );

            CREATE TABLE IF NOT EXISTS categories (
                id          TEXT PRIMARY KEY,
                chantier_id TEXT NOT NULL,
                nom         TEXT NOT NULL,
                ordre       INTEGER DEFAULT 0,
                is_custom   INTEGER DEFAULT 0,
                FOREIGN KEY (chantier_id) REFERENCES chantiers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS taches (
                id           TEXT PRIMARY KEY,
                categorie_id TEXT NOT NULL,
                nom          TEXT NOT NULL,
                etabli       INTEGER DEFAULT 0,
                envoye       INTEGER DEFAULT 0,
                valide       INTEGER DEFAULT 0,
                FOREIGN KEY (categorie_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS planning (
                id          TEXT PRIMARY KEY,
                chantier_id TEXT NOT NULL,
                phase       TEXT NOT NULL,
                date_debut  TEXT NOT NULL,
                date_fin    TEXT NOT NULL,
                FOREIGN KEY (chantier_id) REFERENCES chantiers(id) ON DELETE CASCADE
            );
        ''')


def migrate_db():
    """Ajoute les colonnes logo si la BDD existait avant cette version."""
    with get_db() as db:
        for col, typ in [('logo_blob', 'BLOB'), ('logo_mime', 'TEXT')]:
            try:
                db.execute(f'ALTER TABLE chantiers ADD COLUMN {col} {typ}')
            except Exception:
                pass  # Colonne déjà présente


def row_to_dict(row):
    return dict(row) if row else None


def rows_to_list(rows):
    return [dict(r) for r in rows]


# ── Calcul avancement ─────────────────────────────────────────────────────────

def task_score(t):
    return (t['etabli'] or 0) + (t['envoye'] or 0) + (t['valide'] or 0)


def compute_progress_db(db, chantier_id):
    rows = db.execute('''
        SELECT t.etabli, t.envoye, t.valide
        FROM taches t
        JOIN categories c ON t.categorie_id = c.id
        WHERE c.chantier_id = ?
    ''', (chantier_id,)).fetchall()
    if not rows:
        return 0
    total_score = sum((r['etabli'] or 0) + (r['envoye'] or 0) + (r['valide'] or 0) for r in rows)
    total_max   = len(rows) * 6
    return round(total_score / total_max * 100)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ── Chantiers ─────────────────────────────────────────────────────────────────

@app.route('/api/chantiers')
def get_chantiers():
    with get_db() as db:
        chantiers = rows_to_list(db.execute('SELECT * FROM chantiers ORDER BY nom').fetchall())
        result = []
        for c in chantiers:
            c['progress'] = compute_progress_db(db, c['id'])
            result.append(_camel(c))
        return jsonify(result)


@app.route('/api/chantiers/<cid>')
def get_chantier(cid):
    with get_db() as db:
        c = row_to_dict(db.execute('SELECT * FROM chantiers WHERE id=?', (cid,)).fetchone())
        if not c:
            return jsonify({'error': 'Not found'}), 404

        cats = rows_to_list(db.execute(
            'SELECT * FROM categories WHERE chantier_id=? ORDER BY ordre', (cid,)).fetchall())

        for cat in cats:
            tasks = rows_to_list(db.execute(
                'SELECT * FROM taches WHERE categorie_id=?', (cat['id'],)).fetchall())
            score   = sum(task_score(t) for t in tasks)
            max_s   = len(tasks) * 6
            cat['tasks']      = [_camel(t) for t in tasks]
            cat['totalCount'] = len(tasks)
            cat['score']      = score
            cat['maxScore']   = max_s
            cat['progress']   = round(score / max_s * 100) if max_s else 0
            cat['isCustom']   = bool(cat.get('is_custom'))

        c['categories'] = [_camel_cat(cat) for cat in cats]
        c['progress']   = compute_progress_db(db, cid)
        return jsonify(_camel(c))


@app.route('/api/chantiers', methods=['POST'])
def create_chantier():
    data = request.json
    cid  = str(uuid.uuid4())
    with get_db() as db:
        db.execute('''INSERT INTO chantiers
            (id, nom, adresse, client, logo_url, date_debut, date_fin, commentaires)
            VALUES (?,?,?,?,?,?,?,?)''',
            (cid, data.get('nom',''), data.get('adresse',''), data.get('client',''),
             data.get('logoUrl',''), data.get('dateDebut',''),
             data.get('dateFin',''), data.get('commentaires','')))

        # Catégorie Préparatoire par défaut
        cat_id = str(uuid.uuid4())
        db.execute('''INSERT INTO categories (id, chantier_id, nom, ordre, is_custom)
                      VALUES (?,?,?,?,?)''', (cat_id, cid, 'Préparatoire', 0, 0))
        for t_nom in DEFAULT_TASKS_PREPARATOIRE:
            db.execute('''INSERT INTO taches (id, categorie_id, nom, etabli, envoye, valide)
                          VALUES (?,?,?,0,0,0)''', (str(uuid.uuid4()), cat_id, t_nom))

    return jsonify({'id': cid, **{k: data.get(k,'') for k in
                    ['nom','adresse','client','logoUrl','dateDebut','dateFin','commentaires']},
                    'progress': 0}), 201


@app.route('/api/chantiers/<cid>', methods=['PUT'])
def update_chantier(cid):
    d = request.json
    with get_db() as db:
        db.execute('''UPDATE chantiers SET nom=?, adresse=?, client=?, logo_url=?,
                      date_debut=?, date_fin=?, commentaires=? WHERE id=?''',
                   (d.get('nom'), d.get('adresse'), d.get('client'), d.get('logoUrl'),
                    d.get('dateDebut'), d.get('dateFin'), d.get('commentaires'), cid))
    return jsonify({'success': True})


@app.route('/api/chantiers/<cid>', methods=['DELETE'])
def delete_chantier(cid):
    with get_db() as db:
        db.execute('DELETE FROM chantiers WHERE id=?', (cid,))
    return jsonify({'success': True})


# ── Catégories ────────────────────────────────────────────────────────────────

@app.route('/api/categories', methods=['POST'])
def create_categorie():
    d = request.json
    cat_id = str(uuid.uuid4())
    with get_db() as db:
        ordre = db.execute('SELECT COUNT(*) FROM categories WHERE chantier_id=?',
                           (d['chantierId'],)).fetchone()[0]
        db.execute('INSERT INTO categories (id, chantier_id, nom, ordre, is_custom) VALUES (?,?,?,?,1)',
                   (cat_id, d['chantierId'], d['nom'], ordre))
    return jsonify({'id': cat_id, 'chantierId': d['chantierId'], 'nom': d['nom'],
                    'ordre': ordre, 'isCustom': True,
                    'tasks': [], 'progress': 0, 'totalCount': 0,
                    'score': 0, 'maxScore': 0}), 201


@app.route('/api/categories/<cat_id>', methods=['DELETE'])
def delete_categorie(cat_id):
    with get_db() as db:
        db.execute('DELETE FROM categories WHERE id=?', (cat_id,))
    return jsonify({'success': True})


# ── Tâches ────────────────────────────────────────────────────────────────────

@app.route('/api/taches', methods=['POST'])
def create_tache():
    d = request.json
    tid = str(uuid.uuid4())
    with get_db() as db:
        db.execute('INSERT INTO taches (id, categorie_id, nom, etabli, envoye, valide) VALUES (?,?,?,0,0,0)',
                   (tid, d['categorieId'], d['nom']))
    return jsonify({'id': tid, 'categorieId': d['categorieId'],
                    'nom': d['nom'], 'etabli': 0, 'envoye': 0, 'valide': 0}), 201


@app.route('/api/taches/<tid>', methods=['PUT'])
def update_tache(tid):
    d = request.json
    with get_db() as db:
        fields, vals = [], []
        for key in ['nom', 'etabli', 'envoye', 'valide']:
            if key in d:
                fields.append(f'{key}=?'); vals.append(d[key])
        if fields:
            db.execute(f'UPDATE taches SET {", ".join(fields)} WHERE id=?', (*vals, tid))
    return jsonify({'success': True})


@app.route('/api/taches/<tid>', methods=['DELETE'])
def delete_tache(tid):
    with get_db() as db:
        db.execute('DELETE FROM taches WHERE id=?', (tid,))
    return jsonify({'success': True})


# ── Planning ──────────────────────────────────────────────────────────────────

@app.route('/api/planning/items')
def get_planning_items():
    with get_db() as db:
        rows = db.execute('SELECT * FROM planning').fetchall()
    return jsonify([{
        'id':         r['id'],
        'chantierId': r['chantier_id'],
        'phase':      r['phase'],
        'dateDebut':  r['date_debut'],
        'dateFin':    r['date_fin'],
    } for r in rows])


@app.route('/api/planning/items', methods=['POST'])
def create_planning_item():
    d = request.json
    pid = str(uuid.uuid4())
    with get_db() as db:
        db.execute('INSERT INTO planning (id, chantier_id, phase, date_debut, date_fin) VALUES (?,?,?,?,?)',
                   (pid, d['chantierId'], d['phase'], d['dateDebut'], d['dateFin']))
    return jsonify({'id': pid, 'chantierId': d['chantierId'], 'phase': d['phase'],
                    'dateDebut': d['dateDebut'], 'dateFin': d['dateFin']}), 201


@app.route('/api/planning/items/<pid>', methods=['PUT'])
def update_planning_item(pid):
    d = request.json
    with get_db() as db:
        fields, vals = [], []
        mapping = {'phase': 'phase', 'dateDebut': 'date_debut', 'dateFin': 'date_fin'}
        for k, col in mapping.items():
            if k in d:
                fields.append(f'{col}=?'); vals.append(d[k])
        if fields:
            db.execute(f'UPDATE planning SET {", ".join(fields)} WHERE id=?', (*vals, pid))
    return jsonify({'success': True})


@app.route('/api/planning/items/<pid>', methods=['DELETE'])
def delete_planning_item(pid):
    with get_db() as db:
        db.execute('DELETE FROM planning WHERE id=?', (pid,))
    return jsonify({'success': True})


# ── Logo client (stocké en BLOB dans SQLite) ─────────────────────────────────

@app.route('/api/logos/<cid>')
def get_logo(cid):
    """Sert le logo stocké en BLOB."""
    with get_db() as db:
        row = db.execute('SELECT logo_blob, logo_mime FROM chantiers WHERE id=?', (cid,)).fetchone()
    if not row or not row['logo_blob']:
        return '', 404
    return send_file(io.BytesIO(bytes(row['logo_blob'])),
                     mimetype=row['logo_mime'] or 'image/png')


@app.route('/api/logos/<cid>', methods=['POST'])
def upload_logo(cid):
    """Reçoit un fichier image et le stocke en BLOB."""
    if 'logo' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['logo']
    mime = f.mimetype or 'image/png'
    data = f.read()
    if len(data) > 5 * 1024 * 1024:  # limite 5 Mo
        return jsonify({'error': 'Fichier trop volumineux (max 5 Mo)'}), 413
    with get_db() as db:
        db.execute('UPDATE chantiers SET logo_blob=?, logo_mime=?, logo_url=NULL WHERE id=?',
                   (data, mime, cid))
    return jsonify({'url': f'/api/logos/{cid}'}), 200


@app.route('/api/logos/<cid>', methods=['DELETE'])
def delete_logo(cid):
    """Supprime le logo stocké."""
    with get_db() as db:
        db.execute('UPDATE chantiers SET logo_blob=NULL, logo_mime=NULL WHERE id=?', (cid,))
    return jsonify({'success': True})


# ── Export Excel (depuis la BDD) ──────────────────────────────────────────────

@app.route('/api/export')
def export_excel():
    wb = Workbook()

    with get_db() as db:
        # Feuille Chantiers
        ws = wb.active; ws.title = 'Chantiers'
        ws.append(['id','nom','adresse','client','logoUrl','dateDebut','dateFin','commentaires'])
        for r in db.execute('SELECT * FROM chantiers').fetchall():
            ws.append([r['id'],r['nom'],r['adresse'],r['client'],r['logo_url'],
                       r['date_debut'],r['date_fin'],r['commentaires']])

        # Feuille Categories
        ws2 = wb.create_sheet('Categories')
        ws2.append(['id','chantierId','nom','ordre','isCustom'])
        for r in db.execute('SELECT * FROM categories').fetchall():
            ws2.append([r['id'],r['chantier_id'],r['nom'],r['ordre'],r['is_custom']])

        # Feuille Taches
        ws3 = wb.create_sheet('Taches')
        ws3.append(['id','categorieId','nom','etabli','envoye','valide'])
        for r in db.execute('SELECT * FROM taches').fetchall():
            ws3.append([r['id'],r['categorie_id'],r['nom'],r['etabli'],r['envoye'],r['valide']])

        # Feuille Planning
        ws4 = wb.create_sheet('Planning')
        ws4.append(['id','chantierId','phase','dateDebut','dateFin'])
        for r in db.execute('SELECT * FROM planning').fetchall():
            ws4.append([r['id'],r['chantier_id'],r['phase'],r['date_debut'],r['date_fin']])

    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return send_file(buf, as_attachment=True, download_name='chantiers.xlsx',
                     mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


# ── Import Excel (vers la BDD) ────────────────────────────────────────────────

@app.route('/api/import', methods=['POST'])
def import_excel():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    try:
        wb = openpyxl.load_workbook(request.files['file'])
        with get_db() as db:
            # Vider les tables (ordre important pour les FK)
            db.executescript('''
                DELETE FROM planning; DELETE FROM taches;
                DELETE FROM categories; DELETE FROM chantiers;
            ''')

            def sheet_rows(name, headers):
                if name not in wb.sheetnames: return
                ws = wb[name]
                rows = list(ws.iter_rows(values_only=True))
                if not rows: return
                h = [str(x) for x in rows[0]]
                for row in rows[1:]:
                    if all(v is None for v in row): continue
                    yield {h[i]: (row[i] if i < len(row) else None) for i in range(len(h))}

            for r in sheet_rows('Chantiers', []):
                db.execute('''INSERT OR IGNORE INTO chantiers
                    (id,nom,adresse,client,logo_url,date_debut,date_fin,commentaires)
                    VALUES (?,?,?,?,?,?,?,?)''',
                    (r.get('id'), r.get('nom'), r.get('adresse'), r.get('client'),
                     r.get('logoUrl'), r.get('dateDebut'), r.get('dateFin'), r.get('commentaires')))

            for r in sheet_rows('Categories', []):
                db.execute('''INSERT OR IGNORE INTO categories
                    (id,chantier_id,nom,ordre,is_custom) VALUES (?,?,?,?,?)''',
                    (r.get('id'), r.get('chantierId'), r.get('nom'),
                     r.get('ordre',0), r.get('isCustom',0)))

            for r in sheet_rows('Taches', []):
                db.execute('''INSERT OR IGNORE INTO taches
                    (id,categorie_id,nom,etabli,envoye,valide) VALUES (?,?,?,?,?,?)''',
                    (r.get('id'), r.get('categorieId'), r.get('nom'),
                     r.get('etabli',0), r.get('envoye',0), r.get('valide',0)))

            for r in sheet_rows('Planning', []):
                db.execute('''INSERT OR IGNORE INTO planning
                    (id,chantier_id,phase,date_debut,date_fin) VALUES (?,?,?,?,?)''',
                    (r.get('id'), r.get('chantierId'), r.get('phase'),
                     r.get('dateDebut'), r.get('dateFin')))

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Helpers camelCase ─────────────────────────────────────────────────────────

def _camel(r):
    """Convertit les clés snake_case SQLite en camelCase pour le frontend.
    Si un logo BLOB est stocké, expose l'URL de l'API à la place des données brutes."""
    MAP = {'logo_url': 'logoUrl', 'date_debut': 'dateDebut', 'date_fin': 'dateFin'}
    out = {}
    for k, v in r.items():
        if k in ('logo_blob', 'logo_mime'):
            continue  # jamais exposé directement
        out[MAP.get(k, k)] = v
    # Si un blob existe, l'URL du logo pointe vers notre route de service
    if r.get('logo_blob'):
        out['logoUrl'] = f'/api/logos/{r["id"]}'
    return out


def _camel_cat(r):
    out = {}
    for k, v in r.items():
        if k == 'chantier_id':   out['chantierId'] = v
        elif k == 'is_custom':   out['isCustom']   = bool(v)
        else:                    out[k] = v
    return out


# ── Init & lancement ──────────────────────────────────────────────────────────

init_db()
migrate_db()

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000)
