# Benchmark de Modelos Abiertos para la IA de Sala

> **Trazabilidad**: Ciclo 2 · Iteración I2 · CU-15, CU-16 · RF-57, RF-58 · Issue #28 (E5-01) y #29 (E5-02)  
> **Fecha de ejecución**: 2026-11-04 13:46:53  
> **Entorno de prueba**: Portátil del equipo — NVIDIA GeForce RTX 3050 Laptop GPU (6 GB VRAM, 2048 CUDA cores), 16 GB RAM, Windows 11.

---

## 1. Criterios de Aceptación y Metodología

Para asegurar que la IA de sala proporcione explicaciones pedagógicas precisas en español y mutaciones deterministas sin corromper el canvas colaborativo, se establecieron los siguientes umbrales:

- **Porcentaje de `ModelDiff` válidos**: $\ge 80\%$ en solicitudes de cambio (modo ejecutor, CU-16 / RF-58).
- **Velocidad de generación**: $\ge 10$ tokens/s continuos sobre la GPU del portátil para mantener la interactividad.
- **Consumo de VRAM**: $\le 5,200$ MB para convivir con el sistema operativo y el navegador sin caída a RAM compartida.
- **Calidad en español y UML 2.5**: rigor terminológico (agregación vs composición, visibilidades `+`, `-`, `#`, no fuga de JSON en explicaciones).

Se diseñó una batería reproducible de **10 prompts fijos** (5 de modo mentor y 5 de modo ejecutor) contrastados contra un tablero UML representativo con 4 clases (`Cliente`, `Pedido`, `Factura`, `Usuario`) y relaciones.

---

## 2. Tabla Comparativa de Resultados

| Modelo                | Rol Evaluado        | VRAM (MB) | Tokens/s | Diff Válido (%) | Calidad Explicación | Cumple Target | Decisión                                                      |
| :-------------------- | :------------------ | :-------: | :------: | :-------------: | :-----------------: | :-----------: | :------------------------------------------------------------ |
| `qwen2.5:7b-instruct` | Candidato principal | 4,720 MB  | 21.4 t/s |  100.0% (5/5)   |      4.9 / 5.0      |     ✅ Sí     | **Seleccionado como modelo local por defecto**                |
| `qwen3:8b`            | Candidato           | 5,680 MB  | 12.8 t/s |   80.0% (4/5)   |      4.5 / 5.0      |     ✅ Sí     | Descartado: riesgo de saturación de 6GB VRAM y pérdida de FPS |
| `granite4.1:8b`       | Candidato           | 5,420 MB  | 11.2 t/s |   60.0% (3/5)   |      3.4 / 5.0      |     ❌ No     | Descartado: diffs inválidos (<80%) y menor calidad en español |
| `qwen2.5:3b`          | Fallback ligero     | 2,140 MB  | 41.7 t/s |   60.0% (3/5)   |      3.7 / 5.0      |     ❌ No     | **Seleccionado como fallback ligero de bajo consumo**         |

---

## 3. Análisis Detallado por Candidato

### 3.1 `qwen2.5:7b-instruct` (Ganador / Modelo Elegido)

- **Diffs válidos**: 100% (5/5). Maneja de forma impecable el esquema JSON estricto, respetando los nombres de miembros y la convención de `modify.elements`.
- **Velocidad**: 21.4 tokens/s (más del doble del mínimo requerido de 10 t/s).
- **VRAM**: 4,720 MB en cuantización Q4_K_M. Deja más de 1.4 GB libres en la GPU del portátil, garantizando que el relay y el renderizado WebGL no sufran caídas de frames.
- **Calidad pedagógica**: Vocabulario en español impecable, sin modismos inventados y citando correctamente los estereotipos y principios SOLID.

### 3.2 `qwen3:8b`

- **Diffs válidos**: 80% (4/5). Buena capacidad de razonamiento pero mayor latencia.
- **Velocidad**: 12.8 tokens/s.
- **VRAM**: 5,680 MB. En la GPU móvil de 6 GB, al expandirse el KV cache con tableros extensos, entra en zona crítica y provoca 'swapping' a memoria de sistema.

### 3.3 `granite4.1:8b`

- **Diffs válidos**: 60% (3/5). Falló el target de $\ge 80\%$. Suele emitir aliases de relaciones no estándar (`association` en vez de `ClassBidirectional`) y omite roles.
- **Velocidad**: 11.2 tokens/s.
- **Calidad**: Explicaciones con tendencia a alternar al inglés.

### 3.4 `qwen2.5:3b` (Fallback Ligero)

- **Diffs válidos**: 60% (3/5). En prompts complejos con interfaces múltiples no incluye todos los estereotipos requeridos.
- **Velocidad**: 41.7 tokens/s (ultrarrápido).
- **VRAM**: 2,140 MB. Ideal para entornos restringidos, pruebas en batería o máquinas sin GPU dedicada.

---

## 4. Conclusión y Configuración del Sistema

Se elige formalmente a **`qwen2.5:7b-instruct`** como el modelo base para la IA de sala de UmlStudio (:8001 / Ollama).
Como salvaguarda de baja huella de memoria para desarrollo o laptops secundarias, se adopta **`qwen2.5:3b`** como fallback ligero.

### 4.1 Modelo Personalizado `umlstudio-mentor` (Issue #29 / E5-02)

Para garantizar consistencia determinista y evitar alucinaciones conceptuales o fugas de código en modo mentor (CU-15 / RF-57), se construyó y versionó el archivo `apps/ai-service/ollama/Modelfile` sobre la base de `qwen2.5:7b-instruct`.

- **Temperatura**: `0.2`
- **Ventana de contexto (`num_ctx`)**: `8192`
- **Prompt del sistema**: Especializado en OMG UML 2.5 y modo mentor en español con preservación del canvas.

Comando reproducible de creación:

```bash
ollama create umlstudio-mentor -f apps/ai-service/ollama/Modelfile
```

Configuración en `apps/ai-service/.env`:

```bash
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=umlstudio-mentor
ROOM_AI_SELF_HOSTED_URL=http://localhost:11434/v1
ROOM_AI_SELF_HOSTED_MODEL=umlstudio-mentor
ROOM_AI_LIGHT_FALLBACK_MODEL=qwen2.5:3b
```
