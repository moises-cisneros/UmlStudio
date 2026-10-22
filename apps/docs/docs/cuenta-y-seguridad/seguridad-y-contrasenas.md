# Seguridad, Autenticación y Cambio de Contraseña

UmlStudio implementa mecanismos de seguridad estándar en la industria para salvaguardar tu cuenta y tus diagramas de arquitectura.

---

## 1. Protección de Credenciales

- Las contraseñas se cifran en el backend mediante **Bcrypt** con factor de coste 12.
- Las sesiones utilizan **tokens JWT** firmados criptográficamente que expiran de manera periódica, complementados con cookies seguras `HttpOnly` y `SameSite=Lax`.

---

## 2. Cambiar tu Contraseña

1. Abre el menú de cuenta y selecciona **Mi Perfil**.
2. Dirígete a la pestaña **Seguridad y Contraseña**.
3. Ingresa tu contraseña actual.
4. Ingresa tu nueva contraseña cumpliendo las políticas mínimas de seguridad:
   - Al menos 8 caracteres.
   - Combinación de letras mayúsculas, minúsculas y números o símbolos.
5. Haz clic en **Actualizar Contraseña**. Tu sesión se renovará de forma segura.

---

## 3. Cerrar Sesión

Para cerrar sesión de forma segura en un equipo compartido, haz clic en tu avatar y selecciona **Cerrar Sesión**. Esto revoca tus tokens activos e invalida los accesos temporales a salas en ese navegador.
