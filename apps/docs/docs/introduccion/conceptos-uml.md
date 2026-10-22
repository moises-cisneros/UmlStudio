# Conceptos Clave de Modelado UML 2.5

UmlStudio se apega de forma estricta a la especificación oficial **OMG Unified Modeling Language (UML) versión 2.5**, enfocándose exclusivamente en el **Diagrama de Estructura Estática (Diagrama de Clases)**.

---

## Principio de Dominio Exclusivo

A diferencia de herramientas de dibujo genéricas, el canvas de UmlStudio valida activamente que los elementos pertenezcan a la semántica formal de orientación a objetos. No se admiten elementos de Casos de Uso, Diagramas de Secuencia, Diagramas de Actividades o BPMN en el mismo lienzo. Esto asegura que todo diagrama modelado sea computacionalmente válido y directamente traducible a código ejecutable o esquemas XMI.

---

## Elementos Estructurales Nucleares

1. **Clase (`Class`)**:
   Representa una abstracción con estado (atributos) y comportamiento (métodos u operaciones).
2. **Interfaz (`Interface`)**:
   Define un contrato abstracto de operaciones que una o más clases implementan, denotado con el estereotipo `<<interface>>`.
3. **Enumeración (`Enumeration`)**:
   Define un conjunto cerrado de valores constantes literales, denotado con el estereotipo `<<enumeration>>`.
4. **Paquete (`Package`)**:
   Mecanismo de agrupación lógica y namespace que organiza elementos en subsistemas modulares.

---

## Relaciones Estructurales

- **Generalización / Herencia**: Relación "es-un" con flecha triangular cerrada y línea continua hacia la superclase.
- **Realización**: Implementación de una interfaz por una clase concreta, con flecha triangular cerrada y línea discontinua.
- **Asociación**: Conexión estructural entre dos clases con multiplicidades definidas en los extremos.
- **Agregación**: Relación de "parte-todo" débil (el componente puede existir independientemente del agregado), simbolizada con un rombo blanco.
- **Composición**: Relación de "parte-todo" fuerte y dependiente de ciclo de vida (si se destruye el contenedor, se destruyen los componentes), simbolizada con un rombo negro relleno.
- **Dependencia**: Relación semántica donde un elemento requiere de otro para su especificación, con flecha abierta y línea discontinua.
- **Clase de Asociación**: Entorno donde la relación entre dos clases posee atributos y métodos propios; se conecta a la arista principal mediante una línea discontinua perpendicular.
