# Guía de Contingencia: Inferencia Local mediante Cloudflare Quick Tunnel

> **Trazabilidad**: Ciclo 2 · Iteración I2 · CU-15 · RNF-31 (Intercambiabilidad de Infraestructura) · Issue #33 (Backlog E5-06)

---

## 1. Contexto y Propósito

Si durante la defensa Cloud Run no responde (fallo de red, cuota, latencia o tarjeta bancaria), UmlStudio conmuta inmediatamente a la máquina portátil del equipo sin abrir puertos de router ni comprometer credenciales.

El portátil corre `umlstudio-mentor` sobre Ollama local (`:11434`), protegido por un proxy inverso **Caddy** (`:8080`) que exige `Authorization: Bearer <token>`, expuesto al exterior por un túnel saliente efímero de **Cloudflare Quick Tunnel** (`https://*.trycloudflare.com`).

```text
[ Render: ai-service ] ──── HTTPS Bearer ────► [ Cloudflare Quick Tunnel ]
                                                        │
                                                 (túnel saliente)
                                                        ▼
                                             [ Laptop: Caddy :8080 ]
                                                        │
                                              (Bearer auth check)
                                                        ▼
                                             [ Laptop: Ollama :11434 ]
                                              (umlstudio-mentor 7B)
```

---

## 2. Requisitos Previos en el Portátil

| Herramienta   | Instalación rápida                                                                    |
| :------------ | :------------------------------------------------------------------------------------ |
| `ollama`      | Descarga oficial: [ollama.com](https://ollama.com)                                    |
| `caddy`       | `choco install caddy` (Windows) / `brew install caddy` (macOS) / `apt install caddy`  |
| `cloudflared` | [Cloudflare Downloads](https://developers.cloudflare.com/cloudflare-one/connections/) |

---

## 3. Puesta en Marcha en 3 Pasos

### Paso 1: Asegurar que Ollama y el modelo estén listos

```bash
ollama serve
ollama list  # Debe figurar umlstudio-mentor
```

### Paso 2: Ejecutar el script de contingencia

Desde `apps/ai-service/ollama`:

```bash
# En Linux / macOS / Git Bash:
./contingency-tunnel.sh

# O mediante Python multiplataforma:
python contingency_tunnel.py
```

El script genera un token seguro, levanta Caddy en `:8080` validando `Authorization: Bearer <token>` y establece el túnel Cloudflare.

Salida esperada:

```text
=== UmlStudio Defense Contingency Tunnel (Issue #33) ===
Local Ollama Target: http://localhost:11434
Caddy Proxy Port:    8080
Bearer Token:        a4f89d3c2...

Your quick Tunnel has been created! Visit it at:
https://random-subdomain.trycloudflare.com
```

### Paso 3: Configurar variables en Render (`ai-service`)

En el panel de Render de `ai-service` (Environment Variables), modificar únicamente:

| Variable         | Valor                                      |
| :--------------- | :----------------------------------------- |
| `OLLAMA_URL`     | `https://<subdomain>.trycloudflare.com/v1` |
| `OLLAMA_AUTH`    | `bearer`                                   |
| `OLLAMA_API_KEY` | `<token generado por el script>`           |
| `OLLAMA_MODEL`   | `umlstudio-mentor`                         |

Al guardar, Render reinicia el servicio y Room AI pasa a consumir de inmediato la inferencia del portátil con GPU NVIDIA GeForce RTX 3050.

---

## 4. Prueba de Verificación Local

Para comprobar el enlace antes de la defensa:

```bash
curl -H "Authorization: Bearer <token>" https://<subdomain>.trycloudflare.com/v1/models
```

Respuesta esperada: `200 OK` con listado de modelos incluyendo `umlstudio-mentor`.  
Cualquier solicitud sin token recibe `401 Unauthorized`.

---

## 5. Vuelta al Estado Normal

Al terminar la demostración o contingencia, pulsar `Ctrl + C` en la terminal del portátil: Caddy y `cloudflared` se detienen inmediatamente y el túnel se destruye sin dejar puertos abiertos.
