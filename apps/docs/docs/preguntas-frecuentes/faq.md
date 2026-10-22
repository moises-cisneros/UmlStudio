# Preguntas Frecuentes (FAQ)

Respuestas directas a las dudas más comunes sobre el uso de UmlStudio.

---

### ¿Por qué UmlStudio no permite crear diagramas de casos de uso o secuencia?

UmlStudio está especializado en la **estructura estática y arquitectónica orientada a objetos (Diagramas de Clases OMG UML 2.5)**. Esta especialización permite ofrecer validación semántica formal estricta, cálculo de métricas de software de alta precisión (como LCOM y DIT) y generación de código backend Spring Boot limpio sin ambigüedades.

---

### ¿Cómo garantiza UmlStudio que no se pierdan cambios en salas multiusuario?

El motor de sincronización se basa en **CRDTs (Conflict-free Replicated Data Types)** mediante la librería Yjs. Cada mutación es conmutativa y asociativa. Incluso si dos usuarios mueven elementos o crean atributos en paralelo con latencia de red, las operaciones se ordenan matemáticamente convergiendo en el mismo estado exacto para todos sin requerir un bloqueo centralizado de todo el canvas.

---

### ¿Qué ocurre si dos usuarios intentan editar el mismo atributo a la vez?

UmlStudio utiliza un sistema de **bloqueo fino de elementos (object locking)**. En cuanto un usuario abre el editor de un nodo, adquiere un cerrojo temporal visible para los demás. Si el usuario se desconecta repentinamente, un temporizador en el servidor libera el cerrojo tras unos segundos.

---

### ¿Los diagramas creados en UmlStudio son compatibles con Enterprise Architect?

Sí. Al exportar tu diagrama en formato **XMI 2.1**, se genera un esquema XML estandarizado que puede ser importado directamente en Sparx Systems Enterprise Architect, preservando clases, interfaces, relaciones de herencia, composiciones y multiplicidades.

---

### ¿Qué versión de Spring Boot se genera en el backend?

El generador produce proyectos basados en **Spring Boot 3.x** y **Java 21**, utilizando Spring Data JPA para PostgreSQL 16 y escuchando por defecto en el puerto `9000`.

---

### ¿Mis datos se envían a servidores externos al usar la IA?

El asistente de IA se comunica con el microservicio interno configurado en tu despliegue. Si utilizas proveedores LLM externos, únicamente se transmite la descripción textual del prompt y el esquema del diagrama necesario para computar el diff visual.
