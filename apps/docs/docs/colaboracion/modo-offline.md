# Comportamiento Offline y Reconexión Automática

UmlStudio está preparado para situaciones de conectividad intermitente en redes corporativas o trabajo móvil.

---

## Edición en Modo Desconectado

Si la conexión a Internet o el WebSocket hacia el servidor se interrumpe:

- Aparece un badge de advertencia sutil en la barra superior: **"Sin conexión — Modo local activo"**.
- Puedes continuar editando el diagrama, moviendo clases y añadiendo métodos con normalidad.
- Todas las mutaciones se encolan de forma segura en el almacenamiento local indexado del navegador (IndexedDB) utilizando el log binario de Yjs.

---

## Resolución de Conflictos al Reconectar

En el momento en que la red vuelve a estar disponible:

1. El cliente restablece automáticamente la sesión WebSocket en segundo plano con backoff exponencial.
2. Los cambios locales encolados se transmiten y fusionan matemáticamente con el estado del servidor mediante las propiedades conmutativas de los CRDTs.
3. No se pierden datos ni se sobrescriben destructivamente las modificaciones realizadas por otros colegas mientras estuviste desconectado.
