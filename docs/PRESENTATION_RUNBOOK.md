# Manual de Operación y Ensayo: Ventana de Presentación y Apagado

> **Trazabilidad**: Ciclo 2 · Iteración I3 · CU-15, CU-16, CU-17 · RNF-31, RNF-33 · Issue #34 (Backlog E5-07)  
> **Ventana operativa**: 6 de noviembre al 11 de noviembre de 2026 (defensa)  
> **Restricción de costo**: $0.00 de recursos activos tras finalizar la defensa.

---

## 1. Cronograma Operativo

```text
6 Nov: Despliegue e infraestructura ──► 8-9 Nov: Ensayo dos máquinas ──► 11 Nov: Defensa ──► 11 Nov: Apagado y $0
```

| Fecha           | Hito                                   | Acciones clave                                                                  |
| :-------------- | :------------------------------------- | :------------------------------------------------------------------------------ |
| **6 Nov**       | Despliegue inicial                     | Alertas de presupuesto GCP ($5/$10); despliegue de `umlstudio-llm` en Cloud Run |
| **7 Nov**       | Render y Neon                          | Activación de planes pagados en Render (con créditos); verificación de Neon     |
| **8-9 Nov**     | Ensayo completo                        | Simulación con dos máquinas físicas en simultáneo (concurrencia y conmutación)  |
| **11 Nov AM**   | Preparación de defensa                 | `min-instances=1` para evitar arranques en frío (2 horas activas)               |
| **11 Nov PM**   | Defensa del proyecto                   | Demostración de IA de Sala, propuestas, moderador proactivo e infra swappable   |
| **11 Nov Post** | **Apagado total (Shutdown checklist)** | Eliminación de servicio Cloud Run, reversión de planes Render y costo $0.00     |

---

## 2. Fase 1: Despliegue y Protección de Presupuesto (6-7 Nov)

### 2.1 Alerta de Presupuesto en Google Cloud Platform

Configuración obligatoria en **Facturación > Presupuestos y alertas**:

- **Presupuesto objetivo**: $10.00 USD.
- **Alertas de umbral**:
  - 50 % ($5.00): Notificación por correo electrónico a los integrantes.
  - 90 % ($9.00): Alerta urgente de verificación.
  - 100 % ($10.00): Desconexión inmediata de instancias.

### 2.2 Despliegue de `umlstudio-llm` en Cloud Run

Ejecutar el script verificado de la Issue #30:

```bash
bash apps/ai-service/ollama/deploy-cloud-run.sh --deploy
```

Parámetros activos:

- GPU: `nvidia-l4` (1 unidad, Tier 1 en `us-central1`).
- CPU/RAM: 4 vCPU, 16 GiB RAM, `--no-cpu-throttling`.
- Instancias iniciales: `min-instances=0`, `max-instances=1` (escala a cero en reposo).
- Seguridad: `--no-allow-unauthenticated` (solo accesible mediante token OIDC firmado por Google).

### 2.3 Planes de Render y Memoria Neon

1. **Render**: Asignar créditos educativos a los servicios `umlstudio-server` y `umlstudio-ai-service` para evitar que se suspendan por inactividad durante los ensayos.
2. **Neon**: Verificar que el proyecto `umlstudio-memory` tenga activas las ramas `main` y `dev`, y que `MEMORY_DATABASE_URL` esté configurada en Render.

---

## 3. Fase 2: Ensayo General con Dos Máquinas (8-9 Nov)

El ensayo valida que dos colaboradores en máquinas independientes experimentan sincronización íntegra sin discrepancias:

### 3.1 Lista de Verificación del Ensayo

1. **Conexión concurrente**:
   - Máquina A (Integrador 1) y Máquina B (Integrador 2) inician sesión con sus cuentas reales (sin usuarios anónimos ni inventados).
   - Ambos entran a la misma sala compartida (`/diagram/:id`).
   - Se comprueba presencia mutua y cursores en tiempo real.
2. **Modo Mentor simultáneo (CU-15)**:
   - Máquina A envía: _"Explica cómo refactorizar esta clase acumuladora aplicando Strategy"_.
   - Máquina B envía concurrentemente una pregunta sobre multiplicidades.
   - Ambas respuestas se atienden en orden de cola, difunden el estado `"IA pensando para..."` y comienzan con el nombre del autor correspondiente.
3. **Modo Ejecutor y Reclamación de Propuesta (CU-16)**:
   - Máquina A solicita un cambio en el tablero: _"Agrega una clase Pedido asociada a Cliente"_.
   - Ambos participantes ven la propuesta en estado `pending`.
   - Máquina B hace clic en **Aplicar**.
   - El servidor concede el _claim_ atómico (`claimed`), Yjs propaga los nuevos nodos y aristas a ambas pantallas, y la propuesta finaliza en `applied por <Nombre>`.
4. **Moderador Proactivo (CU-15 FA-07 / RF-62)**:
   - Se deja el tablero sin cambios durante 20 segundos con una clase de más de 7 métodos.
   - La IA publica automáticamente una observación dirigida al autor del elemento observado.
5. **Prueba de Conmutación de Contingencia (RNF-31)**:
   - En Render, conmutar `OLLAMA_URL` al túnel Cloudflare del portátil (`contingency-tunnel.sh`).
   - Repetir una consulta y comprobar que responde correctamente con la GPU local.

---

## 4. Fase 3: Día de la Defensa (11 Nov)

### 4.1 Calentamiento previo (15 minutos antes)

Para garantizar latencia inmediata en la primera consulta ante los evaluadores, fijar temporalmente una instancia caliente:

```bash
gcloud run services update umlstudio-llm \
  --region=us-central1 \
  --min-instances=1
```

Costo por hora activa de GPU NVIDIA L4: **$1.16 USD / hora**.

### 4.2 Durante la Defensa

- Exponer la arquitectura 4+1 y cómo las decisiones técnicas aíslan el canvas de fallos de red.
- Demostrar el streaming de deltas y el cumplimiento estricto del contrato `ModelDiff`.
- Si el tribunal solicita probar la resiliencia de infraestructura, mostrar el cambio de variable de entorno en Render cambiando de Cloud Run al túnel local.

---

## 5. Fase 4: Lista de Apagado Definitivo (Shutdown Checklist)

Inmediatamente finalizada la defensa (11 de noviembre):

- [ ] **1. Eliminar el servicio Cloud Run**:
  ```bash
  gcloud run services delete umlstudio-llm --region=us-central1 --quiet
  ```
- [ ] **2. Revertir planes en Render**:
  - Cambiar `umlstudio-server` y `umlstudio-ai-service` al plan **Free**.
- [ ] **3. Detener túneles y proxies locales**:
  - Cancelar cualquier proceso activo de Caddy o `cloudflared` en el portátil (`Ctrl + C`).
- [ ] **4. Rotar secretos de producción**:
  - Rotar `AI_INTERNAL_TOKEN` y revocar claves JSON de cuentas de servicio GCP de prueba:
  ```bash
  gcloud iam service-accounts keys delete <KEY_ID> --iam-account=cloudrun-invoker@...
  ```
- [ ] **5. Auditoría de facturación final**:
  - Entrar a la consola de GCP y verificar que no existan servicios en ejecución ni costos proyectados.
  - Verificar en Render que no haya cargos recurrentes.
