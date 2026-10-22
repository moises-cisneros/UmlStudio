# Atributos y Métodos: Visibilidad, Tipos y Sintaxis

El editor de clases de UmlStudio proporciona autocompletado y validación de sintaxis conforme a la gramática formal de UML.

---

## Modificadores de Visibilidad

UmlStudio soporta los 4 modificadores estándar de UML:

| Símbolo | Visibilidad               | Significado                                                |
| ------- | ------------------------- | ---------------------------------------------------------- |
| `+`     | **Público (Public)**      | Accesible desde cualquier otra clase o paquete.            |
| `-`     | **Privado (Private)**     | Accesible únicamente desde el interior de la propia clase. |
| `#`     | **Protegido (Protected)** | Accesible desde la clase y sus subclases derivadas.        |
| `~`     | **Paquete (Package)**     | Accesible por cualquier clase dentro del mismo paquete.    |

---

## Sintaxis de Atributos

La sintaxis canónica de un atributo sigue la estructura:

```
[visibilidad] nombre: tipo [ = valorPorDefecto ]
```

### Ejemplos:

- `+ id: Long`
- `- email: String`
- `# fechaCreacion: LocalDateTime`
- `~ activo: Boolean = true`

---

## Sintaxis de Métodos y Operaciones

La sintaxis canónica de un método sigue la estructura:

```
[visibilidad] nombre(parametro1: Tipo, parametro2: Tipo): tipoRetorno
```

### Ejemplos:

- `+ calcularTotal(): BigDecimal`
- `+ actualizarEstado(nuevoEstado: EstadoPedido): Boolean`
- `# registrarAuditoria(usuarioId: Long): void`

---

## Edición Rápida con Teclado

Al tener un nodo seleccionado en el canvas:

- Presiona <kbd>Enter</kbd> para abrir el popover de edición rápida de miembros.
- Usa la tecla <kbd>Tab</kbd> para navegar rápidamente entre nombre, visibilidad y tipo.
- Presiona <kbd>Esc</kbd> para consolidar los cambios y cerrar el editor.
