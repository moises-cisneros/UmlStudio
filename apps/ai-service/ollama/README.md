# Modelo Personalizado `umlstudio-mentor` (Ollama)

> **Trazabilidad**: Ciclo 2 · Iteración I2 · CU-15 (Modo Mentor) · RF-57 · Issue #29 (Backlog E5-02)  
> **Modelo base**: `qwen2.5:7b-instruct` (seleccionado formalmente en el benchmark de la Issue #28)  
> **Hardware de referencia**: Portátil del equipo — NVIDIA GeForce RTX 3050 Laptop GPU (6 GB VRAM), 16 GB RAM

---

## 1. Propósito

El modelo **`umlstudio-mentor`** es una especialización de código abierto basada en `qwen2.5:7b-instruct` empaquetada mediante un `Modelfile` versionado para Ollama. Su propósito es actuar como el motor local de la IA de Sala en UmlStudio para el **modo mentor** (CU-15 / RF-57), proporcionando:

- **Explicaciones pedagógicas en español** sobre conceptos de diseño orientado a objetos (SOLID, patrones GoF, acoplamiento, cohesión).
- **Semántica estricta de OMG UML 2.5**: diferenciación precisa entre agregación débil y composición fuerte (dependencia existencial y cascada de ciclo de vida), herencia vs realización, multiplicidades y visibilidades.
- **Preservación del canvas**: en modo mentor el modelo jamás emite código de implementación, diffs o estructuras JSON no solicitadas.
- **Capacidad ejecutora (CU-16 / RF-58)**: cuando se solicitan modificaciones explícitas, genera payloads conformes al contrato `ModelDiff`.

---

## 2. Parámetros del Modelfile

| Parámetro     | Valor                            | Justificación técnica                                                           |
| :------------ | :------------------------------- | :------------------------------------------------------------------------------ |
| `FROM`        | `qwen2.5:7b-instruct`            | Ganador del benchmark #28: 100 % diffs válidos, 21.4 t/s y 4.7 GB VRAM.         |
| `temperature` | `0.2`                            | Minimiza alucinaciones y asegura consistencia determinista en análisis UML.     |
| `top_p`       | `0.9`                            | Muestreo controlado para respuestas concisas y directas.                        |
| `num_ctx`     | `8192`                           | Admite la serialización de tableros UML complejos sin exceder los 6 GB de VRAM. |
| `stop`        | `<\|im_start\|>`, `<\|im_end\|>` | Secuencias de parada nativas de ChatML para evitar fugas de plantilla.          |

---

## 3. Instrucciones de Construcción y Uso

### Paso 1: Asegurar que Ollama esté en ejecución

```bash
ollama serve
```

### Paso 2: Descargar el modelo base

Descarga la versión cuantizada oficial de Qwen 2.5 7B Instruct:

```bash
ollama pull qwen2.5:7b-instruct
```

> **Nota para equipos con hardware modesto o batería**:  
> Si se opera sin GPU dedicada o con menos de 6 GB de VRAM, puede utilizarse `qwen2.5:3b` como alternativa ligera ajustando la primera línea del `Modelfile` a `FROM qwen2.5:3b`.

### Paso 3: Crear el modelo en Ollama

Desde la raíz del repositorio:

```bash
ollama create umlstudio-mentor -f apps/ai-service/ollama/Modelfile
```

O ubicándose dentro del directorio `apps/ai-service/ollama`:

```bash
cd apps/ai-service/ollama
ollama create umlstudio-mentor -f Modelfile
```

### Paso 4: Verificar la creación del modelo

Lista los modelos disponibles en Ollama para comprobar que figure `umlstudio-mentor`:

```bash
ollama list
```

Prueba interactiva rápida:

```bash
ollama run umlstudio-mentor "¿Cuál es la diferencia entre agregación y composición en UML?"
```

---

## 4. Configuración en UmlStudio

Una vez creado el modelo, configúralo en `apps/ai-service/.env`:

```env
# Conexión local a Ollama
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=umlstudio-mentor

# IA de Sala (CU-15 / CU-16)
ROOM_AI_SELF_HOSTED_URL=http://localhost:11434/v1
ROOM_AI_SELF_HOSTED_MODEL=umlstudio-mentor
```

Cuando `OLLAMA_MODEL=umlstudio-mentor`, el adaptador de Ollama (`apps/ai-service/src/adapters/ollama.py`) y el orquestador de sala derivan automáticamente las consultas hacia este modelo personalizado.

---

## 5. Despliegue en Google Cloud Run con GPU (Issue #30 / E5-03)

> **Trazabilidad**: Ciclo 2 · Iteración I2 · CU-15 · RNF-31, RNF-34 · Backlog E5-03  
> **Hardware en la nube**: 1× GPU NVIDIA L4 (24 GB VRAM), 4 vCPU, 16 GiB RAM  
> **Comportamiento**: Escalado a cero (`min-instances=0`) para costo cero en reposo y despliegue privado IAM (`--no-allow-unauthenticated`).

Para la defensa y demostración del sistema (I3 / ventana de presentación), el modelo `umlstudio-mentor` se sirve a través de un contenedor Ollama optimizado en **Google Cloud Run** con aceleración por GPU.

### 5.1 Imagen Docker con Modelo Preempaquetado (`Dockerfile`)

A diferencia de un despliegue base donde el contenedor arranca vacío y descarga pesos en tiempo de ejecución, el archivo `apps/ai-service/ollama/Dockerfile` hornea la plantilla `Modelfile` y los pesos del modelo directamente en las capas de la imagen Docker:

```dockerfile
# apps/ai-service/ollama/Dockerfile
FROM ollama/ollama:0.5.7
...
RUN (ollama serve &) && ... && ollama pull qwen2.5:7b-instruct && ollama create umlstudio-mentor -f /root/Modelfile && pkill ollama
```

- **Arranque instantáneo**: el contenedor responde a `/api/version` o `/v1/chat/completions` sin latencias de descarga al escalar desde cero.
- **Soporte dinámico de puerto**: `entrypoint.sh` enlaza `OLLAMA_HOST=0.0.0.0:${PORT:-11434}`, permitiendo operar tanto localmente como bajo el puerto inyectado por Cloud Run (`8080`).

Para compilar la imagen localmente:

```bash
docker build -t umlstudio-llm:latest -f apps/ai-service/ollama/Dockerfile .
```

### 5.2 Script de Despliegue (`deploy-cloud-run.sh`)

El script `apps/ai-service/ollama/deploy-cloud-run.sh` automatiza la verificación y el comando de despliegue con los parámetros exactos exigidos por la arquitectura:

```bash
# Modo simulación (Dry Run - no despliega recursos de pago):
./apps/ai-service/ollama/deploy-cloud-run.sh --dry-run

# Verificación de cuota de GPU en el proyecto activo:
./apps/ai-service/ollama/deploy-cloud-run.sh --quota-check

# Despliegue en la ventana de presentación:
./apps/ai-service/ollama/deploy-cloud-run.sh --deploy
```

Comando `gcloud` subyacente:

```bash
gcloud run deploy umlstudio-llm \
  --project="${PROJECT_ID}" \
  --region="us-central1" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/umlstudio/umlstudio-llm:latest" \
  --gpu=1 \
  --gpu-type=nvidia-l4 \
  --cpu=4 \
  --memory=16Gi \
  --no-cpu-throttling \
  --no-allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1 \
  --concurrency=4 \
  --timeout=600 \
  --port=11434
```

### 5.3 Cuotas de GPU en Google Cloud (Gratuito)

La solicitud y verificación de cuota de GPU en Google Cloud no tiene costo:

1. **Métrica requerida**: `run.googleapis.com/allocated_gpus` (o `NVIDIA_L4_GPUS` en Compute Engine / Cloud Run).
2. **Región sugerida**: `us-central1` (Tier 1 con soporte maduro de L4 para Cloud Run).
3. **Límite por defecto**: En cuentas nuevas o de nivel gratuito, la cuota inicial de GPU es **0**.
4. **Pasos para solicitarla** (sin costo de solicitud):
   - Acceder a **Consola GCP > IAM y administración > Cuotas**.
   - Filtrar por la métrica `NVIDIA L4` o `run.googleapis.com/allocated_gpus`.
   - Seleccionar región `us-central1` y solicitar incremento a **1**.
   - Requiere cuenta de facturación vinculada (tarjeta de crédito o crédito promocional).

### 5.4 Estimación de Costes (Calculadora Oficial GCP)

Cálculo basado en la región `us-central1` (Tier 1) para la configuración **1× NVIDIA L4 + 4 vCPU + 16 GiB RAM**:

| Componente                             | Tarifa por segundo               | Tarifa por hora | Notas de facturación                                   |
| :------------------------------------- | :------------------------------- | :-------------- | :----------------------------------------------------- |
| **GPU NVIDIA L4** (24 GB VRAM)         | $0.0001867 / s                   | $0.6721 / h     | Sin nivel gratuito en GPUs; tarifa por segundo activo  |
| **vCPU** (4 unidades con CPU asignada) | $0.0000960 / s (4 × $0.0000240)  | $0.3456 / h     | `--no-cpu-throttling` garantiza CPU dedicada a la GPU  |
| **Memoria** (16 GiB)                   | $0.0000400 / s (16 × $0.0000025) | $0.1440 / h     | Tarifa estándar de RAM en Cloud Run                    |
| **TOTAL ACTIVO**                       | **$0.0003227 / s**               | **$1.1617 / h** | Durante inferencia o calentamiento                     |
| **REPOSO (Escalado a 0)**              | **$0.0000000 / s**               | **$0.0000 / h** | `min-instances=0` apaga la instancia si no hay tráfico |

> **Impacto en la defensa**:  
> Una sesión de presentación y pruebas intensivas de 2 horas continuas representa un costo aproximado de **$2.32 USD**. Al finalizar la demo, el servicio escala a 0 automáticamente.

---

## 6. Guía de Contingencia: Modelo en Portátil con Cloudflare Quick Tunnel (Issue #33 / E5-06)

Si Cloud Run no está disponible durante la presentación, el portátil del equipo puede servir el modelo localmente a través de un túnel saliente efímero sin abrir puertos en el router:

1. **Proxy Caddy con Autenticación Bearer** (`apps/ai-service/ollama/Caddyfile`):
   Escucha en `:8080`, exige `Authorization: Bearer <token>` y redirige a Ollama en `localhost:11434`.
2. **Túnel Cloudflare**:
   Se inicia mediante `./contingency-tunnel.sh` o `python contingency_tunnel.py`, generando una URL temporal `https://*.trycloudflare.com`.
3. **Variables en Render**:
   - `OLLAMA_URL=https://<subdomain>.trycloudflare.com/v1`
   - `OLLAMA_AUTH=bearer`
   - `OLLAMA_API_KEY=<token>`
   - `OLLAMA_MODEL=umlstudio-mentor`

Guía paso a paso completa: [`docs/CONTINGENCY_GUIDE.md`](../../../docs/CONTINGENCY_GUIDE.md).

---

## 7. Criterios de Aceptación Verificados

- [x] `apps/ai-service/ollama/Modelfile` versionado en el repositorio con parámetros y prompt del sistema OMG UML 2.5 (Issue #29).
- [x] Comando `ollama create umlstudio-mentor -f Modelfile` documentado y reproducible (Issue #29).
- [x] `OLLAMA_MODEL=umlstudio-mentor` integrado y soportado en la configuración y adaptadores del servicio de IA (Issue #29).
- [x] Imagen Docker `apps/ai-service/ollama/Dockerfile` con Ollama y modelo `umlstudio-mentor` preempaquetado (Issue #30).
- [x] Script `apps/ai-service/ollama/deploy-cloud-run.sh` con `gcloud run deploy umlstudio-llm`, GPU L4, `--no-allow-unauthenticated`, `min-instances=0`, `max-instances=1` (Issue #30).
- [x] Cuota de GPU y desglose de precios por segundo documentados y registrados (Issue #30).
- [x] Cero recursos de pago desplegados antes de la ventana de presentación (Issue #30).
- [x] Proxy inverso Caddy con autenticación Bearer y túnel saliente Cloudflare documentados y probados (Issue #33).
