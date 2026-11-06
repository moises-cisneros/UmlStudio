# Guión de Defensa y Demostración en Vivo: UmlStudio v2.0

> **Trazabilidad**: Ciclo 2 · Iteración I3 · CU-15, CU-16, CU-17 · RF-51..62, RNF-30..35 · Issue #39 (Backlog E6-04)  
> **Duración total**: 15 a 20 minutos (10 min presentación y demo interactiva + 5-10 min preguntas del tribunal)  
> **Requisitos técnicos**: Dos navegadores/dispositivos (Dispositivo A y Dispositivo B) con cuentas reales autenticadas.

---

## 1. Disposición y Preparación Previa (T - 15 minutos)

Antes de iniciar la exposición frente a los evaluadores:

1. **Precalentamiento de Cloud Run** (evita arranques en frío de la GPU):
   ```bash
   gcloud run services update umlstudio-llm --region=us-central1 --min-instances=1
   ```
2. **Precalentamiento de servicios en Render**:
   - Abrir en pestaña oculta `https://umlstudio-server.onrender.com/health` y `https://umlstudio-ai-service.onrender.com/health`.
3. **Inicio de sesión en dos equipos**:
   - **Dispositivo A (Propietario / Integrador 1)**: Inicia sesión con su cuenta real (`juan@umlstudio.com`). Crea o abre el diagrama compartido `ComercioElectronico`.
   - **Dispositivo B (Colaborador / Integrador 2)**: Inicia sesión con su cuenta real (`ana@umlstudio.com`). Se une al enlace de la sala compartida (`/diagram/:id`).
4. **Verificación de Presencia**:
   - Ambos participantes comprueban que ven sus nombres reales y cursores colaborativos en pantalla (Yjs awareness).

---

## 2. Estructura de la Presentación

```text
[00:00 - 02:00]  1. Contexto, PUDS y Arquitectura Centralizada de Sala
[02:00 - 05:00]  2. Demostración en Vivo: Modo Mentor y Preguntas Simultáneas
[05:00 - 08:30]  3. Demostración en Vivo: Modo Ejecutor y Claim Atómico de Propuestas
[08:30 - 11:00]  4. Moderador Proactivo y Cambio de Política en Caliente
[11:00 - 14:00]  5. Conmutación en Caliente de Infraestructura (Cloud Run -> Laptop -> Gemini)
[14:00 - 20:00]  6. Respuestas a Preguntas Críticas del Tribunal
```

---

## 3. Guión Paso a Paso de la Demostración

### Acto 1: Introducción y Enfoque Arquitectónico (2 minutos)

- **Expositor 1**:
  > _"En el Ciclo 1 entregamos un editor CASE colaborativo con CRDT y extensiones de IA individuales. Para este Ciclo 2, el desafío central consistió en transformar la IA en un verdadero integrante del equipo: un agente único, centralizado y visible para todos los que comparten una sala._  
  > _La IA no vive en el navegador de un usuario; el servidor mantiene una réplica autoritativa del tablero en memoria, procesa las preguntas en una cola concurrente y garantiza que todos vean en tiempo real qué se pregunta, quién lo pregunta y qué responde la IA."_

---

### Acto 2: Modo Mentor y Gestión de Preguntas Simultáneas (3 minutos)

- **Acción en pantalla**:
  1. En **Dispositivo A**, Juan abre el panel de IA de Sala y escribe:
     > _"¿Cómo podemos desacoplar el cálculo de impuestos en la clase `Factura` aplicando patrones GoF?"_  
     > _(Modo seleccionado: **Preguntar / Mentor**)_
  2. En el mismo segundo, en **Dispositivo B**, Ana envía otra pregunta:
     > _"¿Qué multiplicidad conviene asignar entre `Pedido` y `LineaPedido`?"_
- **Qué observa el tribunal**:
  - Ambas pantallas muestran en tiempo real:
    - `"Juan → IA"` y `"Ana → IA"` con sus avatares.
    - El banner de estado: `"IA pensando para Juan..."` y longitud de cola `1 pendiente`.
  - La respuesta de la IA llega primero a Juan y comienza textualmente:
    > _"Hola Juan, para desacoplar el cálculo de impuestos te sugiero aplicar el patrón Strategy..."_
  - De inmediato, el banner cambia a `"IA pensando para Ana..."`, y la segunda respuesta comienza:
    > _"Hola Ana, entre Pedido y LineaPedido la relación es de Composición con multiplicidad 1 a 1.._..."\*
- **Punto clave a destacar**:
  > _"No hay mezcla de contextos. La cola FIFO en Redis garantiza orden de llegada y cada respuesta preserva la identidad y el perfil adaptativo del autor correspondiente sin modificar el tablero."_

---

### Acto 3: Modo Ejecutor y Reclamación Atómica (_Claim_) de Propuesta (3.5 minutos)

- **Acción en pantalla**:
  1. En **Dispositivo A**, Juan selecciona **Pedir cambio (Ejecutor)** y envía:
     > _"Agrega una clase `Descuento` asociada a `Factura` con atributos `porcentaje: double` y `codigoCupon: string`."_
  2. La IA genera la explicación técnica y adjunta una tarjeta interactiva con la **Propuesta de Cambio**:
     - _Clases creadas_: `Descuento`.
     - _Relaciones creadas_: Asociación `Factura -> Descuento`.
  3. En **Dispositivo B**, Ana ve la propuesta en estado `Pendiente`.
  4. Ana hace clic en el botón **Aplicar** de la tarjeta.
- **Qué observa el tribunal**:
  - El servidor concede el _claim_ atómico (`POST /proposals/:id/claim` -> `200`).
  - Si Juan intentara hacer clic simultáneamente, su navegador recibiría `409 Conflict` indicando que Ana ya tomó la propuesta.
  - El cliente de Ana ejecuta `applyDiff` en el documento Yjs: la clase `Descuento` aparece instantáneamente en el canvas de Juan y de Ana.
  - La tarjeta en ambas pantallas se actualiza a **"Aplicada por Ana"**.
- **Punto clave a destacar**:
  > _"La IA nunca muta el canvas directamente. Genera un contrato `ModelDiff` validado por el metamodelo de UML 2.5, y requiere un claim atómico exclusivo para que un colaborador humano autorice la integración mediante CRDT."_

---

### Acto 4: Moderador Proactivo y Configuración de Política (2.5 minutos)

- **Acción en pantalla**:
  1. Juan (como propietario) abre el panel de configuración de la IA de Sala:
     - Muestra los interruptores: _IA Habilitada_, _Permitir entrega de soluciones_, _Moderador proactivo_.
     - Activa la casilla **Moderador proactivo**.
  2. En **Dispositivo B**, Ana intenta abrir la configuración y el sistema le informa que solo el propietario del diagrama tiene privilegios para modificar la política (`CU-17`).
  3. Juan modela en el canvas una clase `GestorUniversal` con 8 métodos para simular una "God Class" o clase acumuladora.
  4. Los expositores dejan el canvas quieto durante 20 segundos.
- **Qué observa el tribunal**:
  - El `RoomAiModerator` en el servidor detecta la inactividad y la violación de la heurística de WMC (> 7 métodos).
  - La IA publica automáticamente en el chat compartido:
    > _"Hola Juan, he notado que la clase `GestorUniversal` acumula 8 métodos. Te sugiero evaluar el principio de Responsabilidad Única (SRP) y considerar dividirla en controladores especializados."_
- **Punto clave a destacar**:
  > _"La moderación es no invasiva, respeta un intervalo de enfriamiento de 2 minutos para no saturar al equipo y se dirige exclusivamente al autor del elemento observado."_

---

### Acto 5: Conmutación en Caliente de Infraestructura (_Swappable Host_) (3 minutos)

- **Expositor 2**:
  > _"Para cumplir con el estándar de confiabilidad y la restricción de $0.00 de costos posteriores, diseñamos una infraestructura de inferencia intercambiable con cero cambios de código."_
- **Demostración de conmutación**:
  1. Mostrar que actualmente la variable en Render apunta al servicio en Google Cloud Run con GPU NVIDIA L4:
     ```bash
     OLLAMA_URL=https://umlstudio-llm-xyz.a.run.app
     ```
  2. **Simulación de contingencia**:
     - Ejecutar en la laptop local el script de túnel Cloudflare:
       ```bash
       bash apps/ai-service/ollama/contingency-tunnel.sh
       ```
     - En el dashboard de Render, conmutar `OLLAMA_URL` a la URL rápida del túnel `https://<hash>.trycloudflare.com`.
     - Enviar una nueva consulta y comprobar que la inferencia se resuelve a través de la laptop del expositor.
  3. **Demostración de respaldo en la nube**:
     - Si la URL de Ollama fallara o no estuviera disponible, la IA de sala conmuta automáticamente al proveedor cloud (Gemini 2.5 Flash), rotulando explícitamente en el pie de la respuesta: `[Inferencia: Respaldo Cloud]`.

---

## 4. Banco de Respuestas a Preguntas del Jurado

### P1: "¿Cómo garantizan que la IA entienda el estado del diagrama si los clientes usan Yjs?"

> _"El servidor de UmlStudio ejecuta un cliente `BoardReplica` basado en `yjs` que se conecta a la sala como un colaborador sin interfaz visual. Cada vez que un usuario mueve una clase o añade una relación, la réplica actualiza su estado local en memoria en tiempo real. Cuando llega una pregunta, el servidor serializa el diagrama directamente desde esta réplica sincronizada, garantizando que el contexto nunca esté desactualizado."_

### P2: "¿Qué impide que dos usuarios apliquen la misma propuesta y dupliquen clases?"

> _"El mecanismo de claim atómico en Redis (`POST /proposals/:messageId/claim`). Utiliza una operación condicional atómica que verifica si el estado es `pending` y lo cambia a `claimed` registrando el `userId`. Solo una petición puede tener éxito (`200 OK`); cualquier petición concurrente posterior recibe `409 Conflict`."_

### P3: "¿Por qué optaron por un modelo local de 7B (Qwen 2.5) en vez de usar siempre una API externa?"

> _"Por tres razones: privacidad estricta del modelo de negocio de la empresa, cumplimiento del requerimiento académico de modelos abiertos auto-alojados, y control absoluto de la latencia y la ventana operativa. Además, nuestro benchmark de modelos demostró que `qwen2.5:7b-instruct` ofrece un 100% de cumplimiento sintáctico en la generación de diffs válidos."_

### P4: "¿Cómo aseguran que el costo del proyecto quede en $0.00 tras la evaluación?"

> _"Contamos con un protocolo automatizado (`scripts/presentation-lifecycle.mjs` y `docs/PRESENTATION_RUNBOOK.md`). Durante el ensayo y la defensa activamos la GPU en Cloud Run con un presupuesto máximo de $10.00. Inmediatamente terminada la sesión, ejecutamos el comando de borrado (`gcloud run services delete umlstudio-llm --quiet`) y revertimos Render al plan gratuito, garantizando cero gastos recurrentes."_

---

## 5. Procedimiento Inmediato Post-Defensa (Cierre $0.00)

En cuanto el jurado dé por finalizada la sesión:

```bash
# 1. Eliminar el servicio GPU en Cloud Run
bash scripts/presentation-lifecycle.sh shutdown

# 2. Verificar estado de presupuesto cero
node scripts/presentation-lifecycle.mjs --verify-shutdown
```
