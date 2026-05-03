#!/usr/bin/env bash
# Daily backup: pg_dump + MinIO mirror
# Usage: ./infra/scripts/backup.sh
# Required env: DATABASE_URL, BACKUP_DIR (default: /var/backups/voice-studio)
#               MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET
# Optional env: BACKUP_ENCRYPT_KEY (age public key; if set, output is encrypted with age)

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/voice-studio}"
DATE=$(date -u +"%Y%m%d_%H%M%S")
BACKUP_PATH="${BACKUP_DIR}/${DATE}"

mkdir -p "${BACKUP_PATH}"

echo "[backup] Starting at ${DATE}"

# ── Postgres dump ──────────────────────────────────────────────────────────────
PG_DUMP_FILE="${BACKUP_PATH}/postgres.dump"
echo "[backup] pg_dump → ${PG_DUMP_FILE}"
pg_dump --format=custom --compress=9 --no-password "${DATABASE_URL}" -f "${PG_DUMP_FILE}"
echo "[backup] pg_dump complete ($(du -h "${PG_DUMP_FILE}" | cut -f1))"

# ── MinIO mirror ───────────────────────────────────────────────────────────────
MINIO_MIRROR_DIR="${BACKUP_PATH}/minio"
mkdir -p "${MINIO_MIRROR_DIR}"
echo "[backup] mc mirror → ${MINIO_MIRROR_DIR}"

MINIO_SCHEME="http"
if [[ "${MINIO_USE_SSL:-false}" == "true" ]]; then
  MINIO_SCHEME="https"
fi

mc alias set backup-src "${MINIO_SCHEME}://${MINIO_ENDPOINT}:${MINIO_PORT}" \
  "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" --quiet

mc mirror --quiet "backup-src/${MINIO_BUCKET}" "${MINIO_MIRROR_DIR}/"
echo "[backup] mc mirror complete"

# ── Optional encryption ────────────────────────────────────────────────────────
if [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]]; then
  ARCHIVE="${BACKUP_PATH}.tar.gz"
  echo "[backup] Creating archive ${ARCHIVE}"
  tar -czf "${ARCHIVE}" -C "${BACKUP_DIR}" "${DATE}"

  ENCRYPTED="${ARCHIVE}.age"
  echo "[backup] Encrypting → ${ENCRYPTED}"
  age --recipient "${BACKUP_ENCRYPT_KEY}" --output "${ENCRYPTED}" "${ARCHIVE}"
  rm -rf "${ARCHIVE}" "${BACKUP_PATH}"
  echo "[backup] Encrypted backup: ${ENCRYPTED} ($(du -h "${ENCRYPTED}" | cut -f1))"
else
  echo "[backup] No BACKUP_ENCRYPT_KEY set — backup is unencrypted at ${BACKUP_PATH}"
fi

echo "[backup] Done at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
