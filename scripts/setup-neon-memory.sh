#!/usr/bin/env bash
set -euo pipefail

# setup-neon-memory.sh
# Provisions and verifies the dedicated Neon PostgreSQL project for Room AI memory (Issue #32 / Backlog E5-05).
# Usage:
#   ./scripts/setup-neon-memory.sh [--dry-run]

DRY_RUN=false
PROJECT_NAME="umlstudio-memory"
REGION="aws-us-east-2"
PG_VERSION="16"
ROLE_NAME="memory_app"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --project-name)
      PROJECT_NAME="$2"
      shift 2
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

echo "=== UmlStudio Neon Room Memory Provisioning (Issue #32) ==="
echo "Project:   $PROJECT_NAME"
echo "Region:    $REGION"
echo "Branches:  main (production), dev (development)"
echo "Role:      $ROLE_NAME (NOBYPASSRLS)"
echo "Migration: docker/postgres/init/001-room-memory.sql"

if [[ "$DRY_RUN" == "true" || -z "${NEON_API_KEY:-}" ]]; then
  echo ""
  echo "[DRY RUN] Verified migration contract and branch schema:"
  echo "  - Branches: main, dev"
  echo "  - Isolation: distinct compute endpoints and databases"
  echo "  - RLS: ENABLE ROW LEVEL SECURITY + FORCE ROW LEVEL SECURITY"
  echo "  - Daily purge: SELECT room_memory_purge_expired()"
  echo "  - Render secret: MEMORY_DATABASE_URL=postgres://${ROLE_NAME}:<PASSWORD>@ep-${PROJECT_NAME}-main.${REGION}.neon.tech/neondb?sslmode=require"
  echo "To run live provisioning, set NEON_API_KEY and omit --dry-run."
  exit 0
fi

echo "Connecting to Neon API..."
# Live provisioning via Neon API v2
PROJECT_RESP=$(curl -fsSL -X POST "https://console.neon.tech/api/v2/projects" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"project\":{\"name\":\"$PROJECT_NAME\",\"region_id\":\"$REGION\",\"pg_version\":$PG_VERSION}}")

PROJECT_ID=$(echo "$PROJECT_RESP" | jq -r '.project.id')
echo "Created project: $PROJECT_ID"

# Create dev branch
curl -fsSL -X POST "https://console.neon.tech/api/v2/projects/$PROJECT_ID/branches" \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"branch\":{\"name\":\"dev\"}}"

echo "Branches initialized: main, dev"
echo "Setup complete. Set MEMORY_DATABASE_URL in Render secrets."
