# Inicio Rápido en 5 Minutos

Comenzar a diseñar con UmlStudio es un proceso directo que requiere solo unos pocos pasos.

---

## 1. Registro e Inicio de Sesión

1. Accede a la pantalla de bienvenida de UmlStudio (`/login`).
2. Si es tu primera vez, haz clic en **Crear Cuenta** (`/register`). Ingresa tu nombre, correo electrónico y una contraseña segura.
3. Al iniciar sesión, recibirás una sesión cifrada y accederás al panel de diagramas (`/`).

---

## 2. Crear tu Primer Diagrama

En el panel principal encontrarás tu lista de diagramas locales y compartidos:

- Haz clic en el botón **+ Nuevo Diagrama** en la esquina superior derecha.
- Asigna un nombre al diagrama (por ejemplo, `SistemaDeFacturacion`).
- Se abrirá automáticamente el canvas de modelado listo para trabajar.

---

## 3. Agregar y Conectar Clases

1. **Arrastrar desde la Paleta**: En el panel lateral izquierdo, mantén presionado el icono de **Clase** y arrástralo hacia el centro del canvas.
2. **Editar Nombre y Atributos**:
   - Haz doble clic sobre el encabezado de la clase para renombrarla (por ejemplo, `Cliente`).
   - Usa el popover de edición rápida o presiona <kbd>Enter</kbd> para agregar atributos (`+ id: Long`, `+ nombre: String`).
3. **Crear una Relación**:
   - Arrastra otra clase al canvas (por ejemplo, `Factura`).
   - Pasa el cursor sobre el borde de la clase `Cliente`: verás los puntos de conexión (handles).
   - Haz clic y arrastra desde el handle de `Cliente` hacia `Factura`.
   - Selecciona el tipo de relación en el menú emergente (por ejemplo, **Asociación** o **Composición**).
   - Define las multiplicidades en ambos extremos (por ejemplo, `1` a `0..*`).

---

## 4. Guardar y Exportar

- Los cambios se guardan de forma reactiva en el almacenamiento local y se sincronizan con la sala colaborativa si estás conectado.
- Para crear un punto de control inmutable, presiona <kbd>Ctrl</kbd>+<kbd>S</kbd> para registrar un **Snapshot**.
- Para exportar el diagrama como imagen, dirígete al menú superior **Exportar** y selecciona **Exportar como PNG** con la escala deseada.
