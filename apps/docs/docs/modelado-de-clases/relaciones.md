# Relaciones Estructurales en UML 2.5

Las relaciones conectan las entidades del diagrama de clases definiendo la estructura de datos, jerarquías y dependencias funcionales.

---

## 1. Asociación (`Association`)

Conexión estructural bidireccional o unidireccional entre dos clases.

- **Representación**: Línea continua, opcionalmente con una punta de flecha abierta para indicar navegabilidad.
- **Multiplicidades**: Indica cuántas instancias de una clase pueden asociarse con una instancia de la otra (ejemplos: `1`, `0..1`, `1..*`, `*`, `0..*`).
- **Roles**: Nombre del rol opcional en cada extremo.

---

## 2. Agregación (`Aggregation`)

Relación de "todo-parte" débil.

- **Representación**: Rombo blanco (hueco) en el extremo de la clase agregadora (el "todo") y línea continua hacia la parte.
- **Semántica**: Las partes pueden existir de forma independiente si el contenedor se destruye (por ejemplo, `Universidad` y `Profesor`).

---

## 3. Composición (`Composition`)

Relación de "todo-parte" fuerte con dependencia estricta de ciclo de vida.

- **Representación**: Rombo negro (relleno) en el extremo del contenedor y línea continua hacia la parte.
- **Semántica**: La parte no puede existir sin su contenedor. Si el contenedor se destruye, sus partes son eliminadas en cascada (por ejemplo, `Factura` y `LineaFactura`).

---

## 4. Generalización / Herencia (`Inheritance`)

Indica que una subclase hereda los atributos y métodos de una superclase.

- **Representación**: Línea continua con una punta de flecha triangular cerrada (sin rellenar) apuntando hacia la superclase.
- **Regla semántica**: No admite multiplicidades en sus extremos.

---

## 5. Realización (`Realization`)

Indica que una clase implementa las operaciones descritas en una interfaz.

- **Representación**: Línea discontinua con punta de flecha triangular cerrada apuntando hacia la interfaz.

---

## 6. Dependencia (`Dependency`)

Indica que una clase utiliza a otra de manera temporal o como parámetro en una operación, sin existir un vínculo estructural permanente en sus atributos.

- **Representación**: Línea discontinua con punta de flecha abierta apuntando hacia la clase requerida.
