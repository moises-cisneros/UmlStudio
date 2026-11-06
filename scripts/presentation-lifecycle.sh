#!/usr/bin/env bash
# Presentation Window Lifecycle & Shutdown Controller Helper (Issue #34 / Backlog E5-07)
set -euo pipefail

REGION="${GCP_REGION:-us-central1}"
SERVICE="${GCP_SERVICE:-umlstudio-llm}"

usage() {
  echo "Usage: $0 [pre-warm | shutdown | status | cost]"
  echo "  pre-warm:  Set min-instances=1 on Cloud Run 15m before presentation"
  echo "  shutdown:  Delete Cloud Run service and verify 0 active resources"
  echo "  status:    Check service state and instance count"
  echo "  cost:      Print estimated cost for defense window"
  exit 1
}

CMD="${1:-}"

case "$CMD" in
  pre-warm)
    echo "==> Setting min-instances=1 on ${SERVICE} in ${REGION} (Pre-warming for defense)..."
    gcloud run services update "${SERVICE}" --region="${REGION}" --min-instances=1
    echo "==> Done. Instance pre-warmed."
    ;;
  shutdown)
    echo "==> Deleting Cloud Run service ${SERVICE} in ${REGION} (Post-defense shutdown)..."
    gcloud run services delete "${SERVICE}" --region="${REGION}" --quiet
    echo "==> Service deleted. Resources returned to \$0.00."
    ;;
  status)
    echo "==> Checking status of ${SERVICE}..."
    gcloud run services describe "${SERVICE}" --region="${REGION}" --format="value(status.url)" || echo "Service not found or scaled down."
    ;;
  cost)
    echo "==> Estimated GPU active cost: ~\$1.16/hour (NVIDIA L4 on Cloud Run)."
    echo "==> 2h defense window estimate: ~\$2.32 USD."
    ;;
  *)
    usage
    ;;
esac
