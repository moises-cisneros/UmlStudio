# Salas Compartidas y Colaboración en Tiempo Real

UmlStudio cuenta con un motor colaborativo en tiempo real basado en tipos de datos replicados libres de conflicto (**CRDTs con Yjs**) y respaldado por un clúster de memoria Redis en el servidor.

---

## Cómo Funciona una Sala Compartida

Cuando dos o más usuarios se unen a la misma URL de diagrama compartido (`/shared/:diagramId`):

1. El cliente web establece una conexión WebSocket segura y de baja latencia con el servidor relay.
2. El estado del diagrama se sincroniza inmediatamente a través de vectores de estado binarios compactos.
3. Cualquier mutación (mover una clase, añadir un atributo o trazar una relación) se propaga en milisegundos a todos los participantes conectados sin recargar la página.

---

## Invitar a Colaboradores

1. Abre el diagrama deseado y haz clic en el botón **Compartir** en la barra superior.
2. Si el diagrama era estrictamente local, el sistema te ofrecerá migrarlo a una sala colaborativa segura en la nube.
3. Se generará un enlace permanente único.
4. Cualquier miembro del equipo que abra el enlace con su cuenta iniciada se unirá inmediatamente a la sala compartida.

---

## Seguridad en Salas Compartidas

- **Identidad Autenticada**: En UmlStudio no existen usuarios fantasma o anónimos en salas de equipo; cada participante está autenticado mediante su token JWT seguro.
- **Canal Cifrado**: Todo el tráfico viaja a través de conexiones seguras (WSS / HTTPS).
