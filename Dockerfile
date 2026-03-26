FROM python:3.12-slim

WORKDIR /app

# Dépendances système (libpq pour psycopg2)
RUN apt-get update \
 && apt-get install -y --no-install-recommends libpq-dev gcc \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Dépendances Python en premier (cache Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code source
COPY . .

# Utilisateur non-root pour la sécurité
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 5000

# Gunicorn production : 4 workers, timeout 120s
CMD ["gunicorn", \
     "--workers", "4", \
     "--bind", "0.0.0.0:5000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
