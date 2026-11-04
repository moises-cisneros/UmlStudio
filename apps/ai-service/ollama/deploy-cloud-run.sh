#!/usr/bin/env bash
# =====================================================================
# Script: deploy-cloud-run.sh
# Deploys umlstudio-llm (Ollama with umlstudio-mentor) to Google Cloud Run
# with an NVIDIA L4 GPU, private IAM auth, and scale-to-zero.
#
# Traceability: Ciclo 2 · Iteración I2 · CU-15 · RNF-31, RNF-34 · Issue #30 (E5-03)
# =====================================================================

set -euo pipefail

get_default_project() {
    if command -v gcloud >/dev/null 2>&1; then
        gcloud config get-value project 2>/dev/null || echo ""
    else
        echo ""
    fi
}

SERVICE_NAME="${SERVICE_NAME:-umlstudio-llm}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${PROJECT_ID:-$(get_default_project)}"
REPOSITORY="${REPOSITORY:-umlstudio}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="${IMAGE:-${REGION}-docker.pkg.dev/${PROJECT_ID:-PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}:${IMAGE_TAG}}"

GPU_COUNT="1"
GPU_TYPE="nvidia-l4"
CPU_CORES="4"
MEMORY_SIZE="16Gi"
CONCURRENCY="4"
TIMEOUT_SECONDS="600"
MIN_INSTANCES="0"
MAX_INSTANCES="1"

print_header() {
    echo "====================================================================="
    echo " UmlStudio · Cloud Run GPU Deployment Script (${SERVICE_NAME})"
    echo " Traceability: Issue #30 · CU-15 · RNF-31, RNF-34 · Backlog E5-03"
    echo "====================================================================="
}

usage() {
    print_header
    cat <<EOF
Usage: $0 [options]

Options:
  --dry-run         Print the gcloud run deploy command and billing details without executing (default).
  --deploy          Execute the deployment to Cloud Run.
  --build           Build and submit the Docker image via Google Cloud Build.
  --quota-check     Check the project's NVIDIA L4 GPU quota in the specified region.
  --help            Show this help message.

Environment Variables:
  PROJECT_ID        GCP Project ID (current: ${PROJECT_ID:-not set})
  REGION            GCP Region (default: us-central1)
  SERVICE_NAME      Cloud Run service name (default: umlstudio-llm)
  IMAGE             Full Artifact Registry container image URI

Pricing Reference (us-central1):
  - NVIDIA L4 GPU (1 unit):   \$0.0001867 / sec (~ \$0.6721 / hr)
  - vCPU (4 vCPUs):            \$0.0000960 / sec (~ \$0.3456 / hr)
  - Memory (16 GiB RAM):       \$0.0000400 / sec (~ \$0.1440 / hr)
  -------------------------------------------------------------
  - Active execution total:    \$0.0003227 / sec (~ \$1.1617 / hr)
  - Scale-to-zero (idle):      \$0.0000000 / sec (\$0.00 / hr)
EOF
}

check_gcloud() {
    if ! command -v gcloud >/dev/null 2>&1; then
        echo "[ERROR] 'gcloud' CLI is not installed or not in PATH."
        echo "Please install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
    if [ -z "${PROJECT_ID}" ]; then
        echo "[ERROR] GCP PROJECT_ID is not configured. Set PROJECT_ID or run: gcloud config set project <ID>"
        exit 1
    fi
}

check_quota() {
    check_gcloud
    echo "[INFO] Checking NVIDIA L4 GPU quota for project '${PROJECT_ID}' in region '${REGION}'..."
    echo "Running: gcloud compute project-info describe --project ${PROJECT_ID} --format=\"table(quotas[].metric,quotas[].limit,quotas[].usage)\""
    
    gcloud compute project-info describe --project "${PROJECT_ID}" \
        --format="table(quotas[].metric,quotas[].limit,quotas[].usage)" | grep -E "(L4|GPU)" || {
        echo "[WARN] No explicit L4 quota line found in project-info output."
        echo "Verify quotas in the Google Cloud Console under IAM & Admin > Quotas:"
        echo "  - Metric: 'run.googleapis.com/allocated_gpus' or 'NVIDIA_L4_GPUS'"
        echo "  - Region: ${REGION}"
        echo "  - Required: At least 1 GPU"
    }
}

build_image() {
    check_gcloud
    echo "[INFO] Submitting Cloud Build for ${IMAGE}..."
    REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
    gcloud builds submit "${REPO_ROOT}" \
        --project="${PROJECT_ID}" \
        --config="${REPO_ROOT}/apps/ai-service/ollama/cloudbuild.yaml" || \
    gcloud builds submit "${REPO_ROOT}" \
        --project="${PROJECT_ID}" \
        --tag="${IMAGE}" \
        --file="${REPO_ROOT}/apps/ai-service/ollama/Dockerfile"
    echo "[SUCCESS] Image built and pushed to: ${IMAGE}"
}

run_deploy() {
    local is_dry_run="$1"

    local CMD=(
        gcloud run deploy "${SERVICE_NAME}"
        --project="${PROJECT_ID:-<YOUR_PROJECT_ID>}"
        --region="${REGION}"
        --image="${IMAGE}"
        --gpu="${GPU_COUNT}"
        --gpu-type="${GPU_TYPE}"
        --cpu="${CPU_CORES}"
        --memory="${MEMORY_SIZE}"
        --no-cpu-throttling
        --no-allow-unauthenticated
        --min-instances="${MIN_INSTANCES}"
        --max-instances="${MAX_INSTANCES}"
        --concurrency="${CONCURRENCY}"
        --timeout="${TIMEOUT_SECONDS}"
        --port=11434
    )

    echo "[INFO] Target Cloud Run Service: ${SERVICE_NAME}"
    echo "[INFO] Region: ${REGION}"
    echo "[INFO] Container Image: ${IMAGE}"
    echo "[INFO] Hardware Allocation: ${GPU_COUNT}x ${GPU_TYPE} | ${CPU_CORES} vCPU | ${MEMORY_SIZE} RAM"
    echo "[INFO] Security & Scaling: --no-allow-unauthenticated (private IAM) | min-instances=${MIN_INSTANCES} | max-instances=${MAX_INSTANCES}"
    echo ""
    echo "Deployment Command:"
    echo "  ${CMD[*]}"
    echo ""

    if [ "${is_dry_run}" = "true" ]; then
        echo "[DRY RUN] Command not executed. Pass --deploy to apply to Google Cloud."
        echo "Cost reference: \$0.0003227/s active (~ \$1.16/hr); \$0.00/s while scaled to zero."
        return 0
    fi

    check_gcloud
    echo "[INFO] Executing gcloud run deploy..."
    "${CMD[@]}"
    echo "[SUCCESS] Service ${SERVICE_NAME} deployed successfully."
}

MODE="dry-run"
if [ $# -eq 0 ]; then
    MODE="dry-run"
else
    case "$1" in
        --dry-run)
            MODE="dry-run"
            ;;
        --deploy)
            MODE="deploy"
            ;;
        --build)
            MODE="build"
            ;;
        --quota-check)
            MODE="quota-check"
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "[ERROR] Unknown option: $1"
            usage
            exit 1
            ;;
    esac
fi

print_header
case "${MODE}" in
    dry-run)
        run_deploy "true"
        ;;
    deploy)
        run_deploy "false"
        ;;
    build)
        build_image
        ;;
    quota-check)
        check_quota
        ;;
esac
