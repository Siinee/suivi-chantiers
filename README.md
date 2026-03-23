# Suivi Chantiers

Application web de suivi de chantiers avec Excel comme base de données légère.

## Fonctionnalités

- **Gestion des chantiers** : créer, modifier, supprimer, consulter
- **Suivi d'avancement** : catégories + tâches à cocher, pourcentage par catégorie et global
- **Planning multi-chantiers** : vue Gantt + tableau récapitulatif
- **Impression / PDF** : export depuis le planning via le navigateur
- **Logo client** : affiché sur les impressions si URL fournie
- **Excel** : import/export du fichier `chantiers.xlsx` (feuilles : Chantiers, Categories, Taches)

## Installation

```bash
pip install -r requirements.txt
python app.py
```

Ouvrir **http://localhost:5000** dans le navigateur.

## Structure Excel

| Feuille    | Colonnes |
|------------|----------|
| Chantiers  | id, nom, adresse, client, logoUrl, dateDebut, dateFin, commentaires |
| Categories | id, chantierId, nom, ordre, isCustom |
| Taches     | id, categorieId, nom, done |

## Catégories par défaut

Montage · Maçonnerie · CE/Levée de réserve · Démontage · Pose de SAS · Mise à disposition · Contrôle & Essai · Désamiantage

Les catégories personnalisées peuvent être ajoutées depuis la fiche chantier.

## Structure du projet

```
suivi-chantiers/
├── app.py              # Backend Flask
├── requirements.txt
├── data/               # Fichier Excel (généré automatiquement)
├── templates/
│   └── index.html      # SPA principale
└── static/
    ├── app.js          # Logique frontend (Vanilla JS)
    └── styles.css      # Styles CSS
```
