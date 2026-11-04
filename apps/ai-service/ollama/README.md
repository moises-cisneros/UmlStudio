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

## 5. Criterios de Aceptación Verificados

- [x] `apps/ai-service/ollama/Modelfile` versionado en el repositorio con parámetros y prompt del sistema OMG UML 2.5.
- [x] Comando `ollama create umlstudio-mentor -f Modelfile` documentado y reproducible.
- [x] `OLLAMA_MODEL=umlstudio-mentor` integrado y soportado en la configuración y adaptadores del servicio de IA.
