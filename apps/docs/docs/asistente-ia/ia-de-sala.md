# Asistente de IA de Sala Colaborativa (Ciclo 2)

En UmlStudio v2.0, las salas colaborativas cuentan con un asistente de inteligencia artificial compartido. La IA no es una sesión privada de un solo navegador, sino un **compañero de equipo centralizado** que observa el tablero en tiempo real, participa en la conversación pública de la sala y puede proponer cambios de diseño directamente aplicables.

---

## 1. Modos de Interacción

Al abrir el panel de la IA dentro de una sala compartida (`/diagram/:id`), cada participante puede consultar a la IA mediante dos modalidades:

### 1.1 Modo Mentor (Preguntar)

- **Propósito**: Resolver dudas sobre modelado conceptual, patrones de diseño de software (GoF), aplicación de principios SOLID o alternativas arquitectónicas.
- **Comportamiento**: La IA analiza el tablero actual, formula su respuesta y se dirige **explícitamente por el nombre del autor** de la pregunta (por ejemplo: _"Hola Juan, para desacoplar el procesamiento de pagos..."_).
- **Garantía**: En Modo Mentor, la IA jamás modifica el diagrama de clases ni emite propuestas de cambio.

### 1.2 Modo Ejecutor (Pedir Cambio)

- **Propósito**: Solicitar a la IA que cree, modifique o suprima clases, interfaces, atributos, métodos o relaciones en el diagrama.
- **Comportamiento**: La IA genera una explicación de la decisión y adjunta una **Propuesta de Cambio** en formato estructurado `ModelDiff`.
- **Precondición**: La política de la sala debe permitir la entrega de soluciones (habilitada por defecto o configurada por el propietario).

---

## 2. Aplicación de Propuestas de Cambio (Claim Único)

Cuando la IA responde en Modo Ejecutor, todos los colaboradores conectados ven la propuesta con el desglose de elementos agregados, modificados o eliminados:

1. **Reclamación atómica**: Cualquier colaborador puede pulsar el botón **Aplicar** en la propuesta.
2. **Exclusión mutua**: El servidor valida la operación en milisegundos mediante un _claim_ atómico. Si dos participantes presionan "Aplicar" al mismo tiempo, solo el primero recibe la confirmación; el segundo recibe un aviso con el nombre del usuario que ganó el turno.
3. **Sincronización CRDT**: El cliente ganador ejecuta `applyDiff` sobre el documento Yjs, propagando de inmediato los nuevos nodos y relaciones a todos los usuarios de la sala.
4. **Registro de autoría**: La propuesta cambia a estado **"Aplicada por [Nombre]"**, manteniendo la trazabilidad histórica de quién autorizó el cambio.

---

## 3. Configuración y Política de Sala

Solo el **Propietario del diagrama** (el usuario creador del modelo) tiene permisos para ajustar la política de la IA:

- **Habilitar / Deshabilitar IA**: Activa o desactiva la presencia del asistente en la sala. Al desactivarla, se cancelan las consultas en cola.
- **Permitir entrega de soluciones**: Habilita o restringe el Modo Ejecutor. Si se desactiva, la IA opera estrictamente como Mentor formativo.
- **Modo de aplicación de propuestas**:
  - `manual` (Recomendado): Exige que un colaborador humano revise y pulse "Aplicar".
  - `auto`: La propuesta se aplica automáticamente en el cliente del solicitante al recibirse.
- **Moderador Proactivo**: Permite que la IA observe el tablero y, tras 20 segundos de inactividad, emita observaciones constructivas de diseño si detecta clases acumuladoras o violaciones heurísticas.

---

## 4. Perfiles Adaptativos Cerrados y Privacidad

Para brindar respuestas personalizadas sin vulnerar la privacidad del equipo:

- Cada usuario cuenta con un **perfil pedagógico cerrado** que se almacena localmente en su propio navegador.
- Los atributos permitidos son únicamente:
  - `detailLevel`: `'concise'` (resumido), `'balanced'` (equilibrado), o `'step_by_step'` (paso a paso).
  - `exampleStyle`: `'uml'` (notación gráfica), `'code'` (ejemplos en Java/TypeScript), `'analogy'` (analogías conceptuales), o `'none'`.
- La IA nunca recopila ni persiste notas de texto libre ni datos sensibles de los colaboradores en el servidor.

---

## 5. Arquitectura de Inferencia y Respaldo de Contingencia

La IA de sala está respaldada por una infraestructura modular de tres niveles:

| Nivel               | Servicio / Host                    | Modelo                | Uso principal                                   |
| :------------------ | :--------------------------------- | :-------------------- | :---------------------------------------------- |
| **Nivel 1 (GPU)**   | Google Cloud Run (`umlstudio-llm`) | `qwen2.5:7b-instruct` | Inferencia primaria en ventana de presentación  |
| **Nivel 2 (Túnel)** | Portátil del equipo con Cloudflare | Ollama local          | Contingencia sin costo ante cortes de cloud     |
| **Nivel 3 (Cloud)** | API Gemini / Proveedor en la nube  | Gemini 2.5 Flash      | Respaldo con rotulado explícito en la respuesta |

---

## 6. Panorama Integral: ¿Dónde más aplica IA UmlStudio?

Durante la defensa del sistema, es fundamental destacar que UmlStudio no limita la Inteligencia Artificial al chat de sala, sino que la integra de forma transversal en todo el ciclo de modelado:

1. **Modelado Asistido 1:1 por Lenguaje Natural**: Creación y refactorización de diagramas mediante instrucciones en texto con diff visual interactivo.
2. **Entrada de Voz y Dictado en Vivo**: Transcripción de audio a texto mediante Whisper para dictar requerimientos arquitectónicos sin usar el teclado.
3. **Visión por Computadora**: Digitalización automática de diagramas dibujados a mano en pizarras o fotografías a clases UML interactivas.
4. **Auditoría Heurística de Diseño**: Inspección algorítmica de métricas de software (WMC, LCOM, acoplamiento) con recomendaciones de patrones GoF.
5. **Auditoría de Productividad y Commits**: Análisis de coherencia entre los commits del repositorio Git y la evolución del diagrama UML.
6. **IA de Sala Compartida y Moderador Proactivo**: Asistente centralizado para equipos concurrentes con memoria contextual en PostgreSQL/Neon.
