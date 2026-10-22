# Elementos del Modelo: Clases, Interfaces, Enums y Paquetes

UmlStudio implementa los tipos de clasificadores estructurales reconocidos por el estándar OMG UML 2.5.

---

## 1. Clases (`Class`)

Una clase es la representación de un concepto del dominio con atributos y operaciones.
En el canvas se representa como un rectángulo dividido en tres compartimentos horizontales:

1. **Encabezado**: Nombre de la clase en negrita (y si es abstracta, con tipografía en cursiva o etiqueta `{abstract}`).
2. **Atributos**: Lista de propiedades con su visibilidad y tipo.
3. **Métodos / Operaciones**: Lista de funciones con parámetros y tipo de retorno.

---

## 2. Interfaces (`Interface`)

Una interfaz especifica un conjunto de operaciones que definen un contrato de comportamiento sin implementar su lógica.

- Se identifica mediante el estereotipo `<<interface>>` sobre el nombre.
- Todos sus métodos son implícitamente públicos y abstractos.
- Las clases se vinculan a ella mediante conectores de **Realización** (línea discontinua con triángulo cerrado).

---

## 3. Enumeraciones (`Enumeration`)

Una enumeración define un tipo de dato cuyos valores son un conjunto cerrado de identificadores constantes (literales).

- Se identifica mediante el estereotipo `<<enumeration>>`.
- Contiene un compartimento de literales (por ejemplo: `PENDIENTE`, `PAGADO`, `CANCELADO`).
- No posee métodos con lógica de negocio compleja.

---

## 4. Paquetes (`Package`)

Un paquete actúa como un espacio de nombres (namespace) y mecanismo de modularización.

- Se representa con una pestaña superior que indica el nombre del paquete.
- Permite albergar visualmente clases y submódulos relacionados para mantener diagramas grandes ordenados.
