# Gestión de Diagramas: Crear, Renombrar, Duplicar y Compartir

UmlStudio proporciona una gestión completa de proyectos de modelado, permitiendo organizar múltiples diagramas tanto en almacenamiento local como en la nube.

---

## 1. Crear y Renombrar Diagramas

- **Crear**: Desde la vista de inicio (`/`), haz clic en **+ Nuevo Diagrama**. El sistema inicializará un lienzo limpio con un identificador único.
- **Renombrar**: Haz clic directamente sobre el título del diagrama en la barra superior del editor o en el menú de tres puntos de la tarjeta del diagrama en la vista principal.

---

## 2. Duplicar Diagramas

Si deseas crear una variante o explorar una arquitectura alternativa sin alterar el diseño original:

1. En la vista principal de diagramas, abre el menú de opciones de la tarjeta.
2. Selecciona **Duplicar**.
3. Se generará una copia completa e independiente del metamodelo, lista para ser editada sin afectar al diagrama fuente.

---

## 3. Eliminar Diagramas

- Para eliminar un diagrama, selecciona **Eliminar** en el menú de la tarjeta.
- El sistema te solicitará una confirmación de seguridad para prevenir pérdidas accidentales de trabajo.

---

## 4. Compartir Diagramas (Modo Colaborativo)

Para transformar un diagrama en una sesión colaborativa en tiempo real:

1. Haz clic en el botón **Compartir** en la esquina superior derecha del editor.
2. UmlStudio generará una sala dedicada respaldada por WebSockets y Redis.
3. Copia el enlace único generado y envíaselo a tus compañeros de equipo para comenzar a modelar en conjunto.
