# Guía de Diseño y Sistema Visual — UmlStudio

## Design System, Tokens, Especificación Visual de Nodos UML y Lineamientos de UI/UX

> **Propósito**: Este documento define los estándares estéticos, el sistema de tokens, la tipografía canónica, los componentes de interfaz y la especificación visual exacta de los elementos de Diagramas de Clases UML en **`UmlStudio`**.

---

## 1. Filosofía de Diseño: "Precision Technical Studio"

`UmlStudio` está concebido como una herramienta de ingeniería visual moderna y de alta gama para desarrolladores y arquitectos de software. Sus pilares estéticos son:

1. **Claridad Técnica y Cero Ruido**: La interfaz de usuario debe mantenerse fuera del camino del usuario, priorizando el lienzo de modelado (_canvas_) y la legibilidad del diagrama.
2. **Estética "Modern Dark & Crisp Light"**:
   - **Dark Mode**: Fondo profundo en tono obsidiana (`#0B0F19`), bordes técnicos sobrios (`#243046`), acentos en dodger blue (`#3590F3`) y contrastes calculados para largas jornadas de modelado.
   - **Light Mode**: Superficies limpias en blanco y gris neutro (`#FFFFFF`, `#F8FAFC`, `#F1F5F9`) con sombras suaves y contraste tipográfico nítido.
3. **Fidelidad Estricta al Estándar UML 2.5**: Los símbolos, terminaciones de flechas, compartimentos y visibilidades deben cumplir el estándar formal de la OMG (Object Management Group).

---

## 2. Sistema Modular de Tokens y Nueva Paleta de Colores

El sistema de diseño implementa una arquitectura modular de tokens con archivos de responsabilidad única en [`packages/ui/src/styles/tokens/`](packages/ui/src/styles/tokens/):

- `primitives.css`: Paleta base Coolors (`--color-palette-*`), variantes HSL y gradientes (`--gradient-*`).
- `typography.css`: Escala tipográfica, pesos de fuente, alturas de línea y familia Inter.
- `metrics.css`: Radios de curvatura, sombras técnicas, capas de elevación z-index y curvas de transición.
- `semantics.css`: Variables semánticas `--umlstudio-*` para modo claro (`:root`) y oscuro (`:root[data-theme="dark"]`).
- `uml.css`: Tokens `--uml-*` para compartimentos, visibilidad, nodos, aristas y handles UML.
- `index.css`: Archivo índice maestro que reúne y expone todos los tokens.

**Regla de capas**: los componentes usan tokens semánticos (`--umlstudio-primary`, `--umlstudio-surface`) o UML (`--uml-edge-stroke-active`), nunca primitivos ni hex sueltos.

### 2.1 Paleta Primaria Coolors (Rebranding Visual)

| Token Primitivo                 |    Hex    |         HSL          | Rol Semántico en UmlStudio                                         |
| :------------------------------ | :-------: | :------------------: | :----------------------------------------------------------------- |
| `--color-palette-dodger-blue`   | `#3590F3` | `hsl(211, 89%, 58%)` | Marca principal (`--umlstudio-primary`), selección activa          |
| `--color-palette-deep-sky`      | `#62BFED` | `hsl(200, 79%, 66%)` | Acento secundario, hovers interactivos, conectores activos         |
| `--color-palette-baby-blue`     | `#8FB8ED` | `hsl(214, 72%, 75%)` | Acento suave, visibilidad de paquete (`~`), badges secundarios     |
| `--color-palette-periwinkle`    | `#C2BBF0` | `hsl(248, 64%, 84%)` | Estereotipos UML (`<<interface>>`, `<<abstract>>`), bordes sutiles |
| `--color-palette-lavender-veil` | `#F1E3F3` | `hsl(293, 40%, 92%)` | Fondos claros, halos de resplandor                                 |

### 2.2 Gradientes Técnicos Predefinidos

Todos recorren la paleta en el mismo orden (`#f1e3f3 → #c2bbf0 → #8fb8ed → #62bfed → #3590f3`) y cambian solo la dirección: `--gradient-top`, `--gradient-right`, `--gradient-bottom`, `--gradient-left`, `--gradient-top-right` (45°), `--gradient-bottom-right`, `--gradient-top-left`, `--gradient-bottom-left` y `--gradient-radial`. Alias de marca: `--gradient-brand-horizontal`, `--gradient-brand-vertical`, `--gradient-brand-diagonal`, `--gradient-brand-subtle`, `--gradient-brand-glow`.

### 2.3 Colores Semánticos y de Estado

| Estado      | Token primitivo              | Valor Hex | Uso                                                |
| :---------- | :--------------------------- | :-------: | :------------------------------------------------- |
| **Success** | `--primitive-success-base`   | `#10B981` | Conexión WebSocket establecida, versión guardada   |
| **Warning** | `--primitive-warning-yellow` | `#F59E0B` | Conflictos de nombrado, advertencia de desconexión |
| **Danger**  | `--primitive-danger-color`   | `#EF4444` | Eliminar elemento, error de validación de esquema  |
| **Info**    | `--primitive-info-base`      | `#0EA5E9` | Notificaciones y ayuda contextual                  |

En componentes se consumen a través de su alias semántico (por ejemplo `--umlstudio-danger`, expuesto a Tailwind como `--color-destructive`).

### 2.4 Colores de Superficie y Fondo

| Token                             |         Claro         |            Oscuro            |
| :-------------------------------- | :-------------------: | :--------------------------: |
| `--umlstudio-background`          |       `#FFFFFF`       |          `#0B0F19`           |
| `--umlstudio-background-variant`  |       `#F8FAFC`       |          `#101626`           |
| `--umlstudio-surface` / `-sunken` | `#FFFFFF` / `#F1F5F9` | definidos en `semantics.css` |

Los colores de nodos, bordes y aristas del canvas se toman de `uml.css` (por ejemplo `--uml-node-border-active`, `--uml-edge-stroke-active`).

---

## 3. Tipografía Canónica: Familia Inter

La tipografía oficial del sistema es **Inter**, alojada como fuente canónica en [`assets/fonts/`](assets/fonts/):

```css
font-family:
  "Inter",
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Roboto,
  sans-serif;
```

### Escala Tipográfica

| Nivel                 | Tamaño |       Peso       | Uso                                                  |
| :-------------------- | :----: | :--------------: | :--------------------------------------------------- |
| **Display Title**     | `24px` |   Bold (`700`)   | Encabezados de Dashboard y Modales                   |
| **Node Title**        | `15px` | SemiBold (`600`) | Nombre de la Clase / Interfaz en el diagrama         |
| **Stereotype**        | `11px` |  Medium (`500`)  | `<<interface>>`, `<<abstract>>`, `<<enum>>`          |
| **Member Text**       | `13px` | Regular (`400`)  | Atributos y Métodos en los compartimentos            |
| **Visibility Marker** | `13px` | SemiBold (`600`) | Símbolos `+`, `-`, `#`, `~`                          |
| **Badge / Caption**   | `11px` |  Medium (`500`)  | Multiplicidades (`0..*`, `1..1`) y roles de relación |

---

## 4. Especificación Visual de Elementos UML de Clases

### 4.1 Anatomía del Nodo de Clase (3 Compartimentos)

```text
+-------------------------------------------------------------+
| <<interface>>                                               | <- 1. Compartimento de Cabecera:
| AuthService                                                 |    Estereotipo (itálica/badge) +
+-------------------------------------------------------------+    Nombre centrado o alineado
| - sessionToken: string                                      | <- 2. Compartimento de Atributos:
| # maxRetryCount: number = 3                                 |    Visibilidad + Nombre + Tipo
+-------------------------------------------------------------+
| + login(credentials: AuthDTO): Promise<User>                | <- 3. Compartimento de Métodos:
| + logout(): void                                            |    Visibilidad + Firma + Retorno
+-------------------------------------------------------------+
```

### 4.2 Marcadores de Visibilidad UML

Tokens en `uml.css` (valor claro / oscuro):

| Marcador      | Token                        |            Claro            |           Oscuro            |
| :------------ | :--------------------------- | :-------------------------: | :-------------------------: |
| `+` Público   | `--uml-visibility-public`    |          `#059669`          |          `#34D399`          |
| `-` Privado   | `--uml-visibility-private`   |          `#DC2626`          |          `#F87171`          |
| `#` Protegido | `--uml-visibility-protected` |          `#D97706`          |          `#FBBF24`          |
| `~` Paquete   | `--uml-visibility-package`   | `--color-palette-baby-blue` | `--color-palette-baby-blue` |

### 4.3 Especificación de Aristas y Relaciones UML

```text
Asociación:            A -----------------------------------------> B
Herencia/Gen:          A ----------------------------------------|> B (Triángulo hueco)
Realización:           A - - - - - - - - - - - - - - - - - - - - |> B (Línea discontinua + Triángulo)
Agregación:            A <>---------------------------------------- B (Rombo hueco)
Composición:           A <•>--------------------------------------- B (Rombo relleno)
Dependencia:           A - - - - - - - - - - - - - - - - - - - - -> B (Línea discontinua + Flecha abierta)
```

- **Grosor de Trazo**: `2px` constante en todas las aristas para máxima nitidez en zoom out.
- **Enrutamiento**: Ortogonal en ángulos rectos (90°), con arcos de salto (_line jumps_) automáticos en intersecciones para evitar confusiones de flujo.
- **Handles de Anclaje**: Puntos de anclaje magnéticos en los 4 puntos cardinales de cada nodo (Norte, Sur, Este, Oeste), que se activan al aproximar el puntero.

---

## 5. Componentes de UI y Sistema de Interacción

Los controles flotantes del editor se construyen con `@umlstudio/ui`:

1. **Floating Canvas Toolbar**: Barra flotante inferior/superior translúcida con efecto de desenfoque (_glassmorphism_ con `backdrop-blur-md` y fondo semitransparente), que contiene:
   - Selector de modo de puntero (Selección / Mano / Conectar).
   - Paleta rápida de clases, interfaces y paquetes.
   - Controles de Zoom (`+`, `-`, `Fit View` al 100%).
   - Indicador de estado de conexión (Dot verde pulsante para WebSocket activo).
2. **Drawer Lateral de Versiones (Timeline)**:
   - Panel desplegable a la derecha que lista cronológicamente los snapshots almacenados en Redis.
   - Cada entrada muestra autor, etiqueta, hora relativa y botón para restaurar de forma atómica.
3. **Modales y Diálogos**:
   - Diálogo de Exportación: Permite seleccionar dimensiones, escala (1x, 2x, 4x), fondo transparente y formato de archivo (SVG, PNG, PDF, JSON).
   - Diálogo de Atajos (`HowToUseModal`): Guía interactiva de teclado invocada instantáneamente con la tecla `?` o el botón Help.

---

## 6. Reglas de Implementación en Código (CSS y Componentes)

1. **Evitar Valores Mágicos Hardcodeados**:
   - Utilizar siempre las clases y variables del Design System. No introducir colores RGB/HEX arbitrarios en componentes React individuales.
2. **Compatibilidad con TailwindCSS v4**:
   - No utilizar sintaxis inválida en Tailwind v4 (como clases arbitrarias con espacios o signos de exclamación huérfanos).
3. **Micro-animaciones**:
   - Transiciones suaves de `150ms` a `200ms` con curva `cubic-bezier(0.4, 0, 0.2, 1)` en hovers de botones y aperturas de menú.
   - El canvas de modelado no debe tener animaciones pesadas que comprometan el rendimiento a 60 FPS durante operaciones de arrastre masivo (_dragging_).
