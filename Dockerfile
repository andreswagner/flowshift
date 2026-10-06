FROM registry.redhat.io/ubi9/python-311-minimal:latest

# ── Non-root user ────────────────────────────────────────────────────────────
RUN useradd -m -u 1001 appuser

WORKDIR /app

# ── Python dependencies ──────────────────────────────────────────────────────
# Install gunicorn alongside the project's own requirements.
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn>=21.2

# ── Application source ───────────────────────────────────────────────────────
COPY --chown=appuser:appuser server/ ./server/
COPY --chown=appuser:appuser migration-app/ ./migration-app/

USER 1001

# ── Runtime configuration ────────────────────────────────────────────────────
# HOST must stay 0.0.0.0 inside a container so the port is reachable from
# outside — the project default of 127.0.0.1 is for bare-metal dev only.
# Set ADMIN_TOKEN and mount a config.json volume for production use.
ENV HOST=0.0.0.0 \
    PORT=5000 \
    CONFIG_PATH=/app/server/config.json

EXPOSE 5000

# gunicorn serves the Flask app; adjust --workers to your CPU count.
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", \
     "--chdir", "/app/server", "app:app"]
