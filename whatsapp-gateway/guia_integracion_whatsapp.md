# 📦 Guía de Integración y Portabilidad: Pasarela Automática de WhatsApp

Esta guía documenta la arquitectura completa, el código fuente y los pasos necesarios para replicar este sistema de **WhatsApp Bot Autónomo y Mensajería Automática** en cualquier otro proyecto (como `gym-recognition`).

---

## 🏗️ 1. Arquitectura General

```
┌────────────────────────────────────────────────────────┐
│              COMPUTADORA LOCAL / GIMNASIO              │
│                                                        │
│  [WhatsApp Gateway - Node.js :3001]                    │
│    ├── Baileys (@whiskeysockets/baileys)               │
│    │     └── Mantiene la sesión Web (auth_info/)      │
│    ├── Express Server                                  │
│    │     └── POST /send  (recibe { phone, message })   │
│    └── Túnel Permanente Ngrok                          │
│          └── https://tu-dominio.ngrok-free.dev         │
└──────────────────────────▲─────────────────────────────┘
                           │ HTTPS POST
┌──────────────────────────┴─────────────────────────────┐
│          BACKEND / NUBE (FastAPI / Vercel)             │
│                                                        │
│  [Lógica de Negocio]                                   │
│    ├── Cambio de estado por vencimiento (7 días)       │
│    ├── Registro de pago (Deuda -> Al Día)              │
│    └── Edición de socio desde el panel                 │
│                                                        │
│  [Anti-Spam & Hilos Asíncronos]                        │
│    ├── Guarda 'last_wa_notified_status' en BD          │
│    └── Dispara threading.Thread (No bloquea la UI)     │
└────────────────────────────────────────────────────────┘
```

---

## 📁 2. Estructura de Archivos a Copiar

Solo necesitás llevar la carpeta `whatsapp-gateway/` a la raíz de tu nuevo proyecto:

```
tu-proyecto/
├── whatsapp-gateway/
│   ├── package.json
│   ├── server.js                        # Microservicio Baileys + Express
│   ├── run.js                           # Orquestador con Ngrok y Cloudflare fallback
│   ├── ngrok.exe                        # Binario Ngrok (Windows)
│   ├── start_silent.vbs                 # Lanzador invisible (segundo plano)
│   ├── detener_whatsapp.bat             # Cierre seguro de procesos
│   ├── iniciar_whatsapp.bat             # Lanzador visible (modo depuración)
│   ├── CONFIGURAR_ESTA_COMPUTADORA.bat  # Instalador 1-click para la compu destino
│   └── auth_info/                       # Carpeta de llaves de cifrado (vacía al clonar)
```

---

## 💻 3. Código del Microservicio (`whatsapp-gateway`)

### A. `package.json`
```json
{
  "name": "whatsapp-gateway",
  "version": "1.0.0",
  "description": "Pasarela local de WhatsApp para envíos automáticos",
  "main": "server.js",
  "scripts": {
    "start": "node run.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "@whiskeysockets/baileys": "^6.7.18",
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "pino": "^9.6.0",
    "qrcode": "^1.5.4"
  }
}
```

### B. `server.js` (Puntos Clave)
* Inicia Baileys con `useMultiFileAuthState(AUTH_DIR)`.
* Genera código QR en `http://localhost:3001` para fácil escaneo con el celular.
* Expone:
  * `GET /status`: Para chequear si WhatsApp está conectado.
  * `POST /send`: Recibe `{ "phone": "549...", "message": "Texto" }` protegido con header `Authorization: Bearer <TOKEN>`.

### C. `run.js` (Orquestador del Túnel)
* Ejecuta `server.js`.
* Levanta `ngrok.exe http 3001 --url=tu-dominio.ngrok-free.dev`.
* Si Ngrok falla o cierra, hace fallback automático a `cloudflared.exe`.
* Guarda las URLs activas en `whatsapp_tunnel_url.txt` y registra logs en `gateway.log`.

### D. `CONFIGURAR_ESTA_COMPUTADORA.bat`
* Verifica que Node.js esté instalado.
* Ejecuta `npm install` si falta `node_modules`.
* Configura el authtoken de Ngrok.
* Crea el archivo `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\BunkerWhatsAppBot.vbs` para arranque invisible automático con Windows.
* Inicia el bot silencioso y abre el navegador en `http://localhost:3001` para escanear el QR.

---

## 🐍 4. Código del Backend (Python / FastAPI)

Para replicarlo en cualquier backend Python, necesitas estos 3 elementos:

### A. Modelo de Base de Datos (`Member`)
El modelo debe tener teléfono y una columna JSON (o texto) para registrar las notificaciones:
```python
class Member(Base):
    __tablename__ = "members"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    phone = Column(String, nullable=True)     # Ej: +5493516002716
    status = Column(String, default="ACTIVO")  # ACTIVO, POR VENCER, DEUDA
    joined_at = Column(DateTime)
    wellness_data = Column(JSON, nullable=True) # Almacena anti-spam
```

### B. Funciones Helper de WhatsApp
Agregá estas funciones en tu archivo de rutas (`admin_routes.py` o similar):

```python
import os
import re
import json
import logging
import threading
import urllib.request
import urllib.parse
import datetime
from sqlalchemy.orm.attributes import flag_modified

def get_whatsapp_status_message(status: str) -> str:
    st = (status or "ACTIVO").upper().strip()
    if st in ["ACTIVO", "AL DIA", "AL DÍA"]:
        return "Hola soy BUNKER BOT de BUNKER GYM, como estas ? como van esos entrenamientos?"
    elif st == "POR VENCER":
        return "Hola soy BUNKER BOT de BUNKER GYM, como estas ? te hablaba para hacerte recordar que tu cuenta del gym esta POR VENCER no te olvides de renovar antes que sea tarde"
    elif st == "DEUDA":
        return "Hola soy BUNKER BOT de BUNKER GYM, tu plan está VENCIDO y figura en DEUDA, necesitamos que reestablezcas el pago, acercate a nuestro personal y comenta tu situacion"
    return "Hola te contactamos desde el gimnasio."

def dispatch_whatsapp_message(target_phone: str, message: str, sender_phone: str = None) -> bool:
    """Envía la petición HTTP a la pasarela en segundo plano."""
    logger = logging.getLogger("whatsapp_sender")
    clean_digits = re.sub(r"\D", "", target_phone or "")
    if clean_digits.startswith("0"):
        clean_digits = clean_digits[1:]
    if not clean_digits.startswith("54") and len(clean_digits) == 10:
        clean_digits = "549" + clean_digits
    elif clean_digits.startswith("54") and not clean_digits.startswith("549") and len(clean_digits) == 12:
        clean_digits = "549" + clean_digits[2:]

    if not clean_digits:
        return False

    sender = sender_phone or os.getenv("VITE_WHATSAPP_PHONE") or os.getenv("WHATSAPP_PHONE") or ""
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL")
    gateway_token = os.getenv("WHATSAPP_API_TOKEN")

    try:
        if gateway_url:
            post_data = json.dumps({
                "sender": sender,
                "phone": clean_digits,
                "to": clean_digits,
                "message": message
            }).encode("utf-8")
            headers = {"Content-Type": "application/json"}
            if gateway_token:
                headers["Authorization"] = f"Bearer {gateway_token}"

            req = urllib.request.Request(gateway_url, data=post_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=12) as resp:
                logger.info(f"[WHATSAPP SENT via Gateway {resp.status}] To: {clean_digits}")
                return True
    except Exception as e:
        logger.error(f"[WHATSAPP ERROR] Fallo al enviar a {clean_digits}: {e}")
        return False

def notify_member_status_change(member, old_status: str, new_status: str, db, force: bool = False) -> bool:
    """Valida anti-spam y despacha en un hilo daemon."""
    st = (new_status or "ACTIVO").upper().strip()
    if st not in ["ACTIVO", "AL DIA", "AL DÍA", "POR VENCER", "DEUDA"]:
        return False

    wellness = dict(member.wellness_data or {})
    last_notified = wellness.get("last_wa_notified_status")

    # Anti-spam: no repetir si ya fue notificado en ese estado
    if not force and last_notified == st:
        return False

    # Evitar notificar ACTIVO inicial si no venía de deuda o por vencer
    if not force and st in ["ACTIVO", "AL DIA", "AL DÍA"] and old_status not in ["DEUDA", "POR VENCER"]:
        return False

    wellness["last_wa_notified_status"] = st
    wellness["last_wa_notified_at"] = datetime.datetime.utcnow().isoformat()
    member.wellness_data = wellness
    flag_modified(member, "wellness_data")

    message = get_whatsapp_status_message(st)
    target_phone = (member.phone or os.getenv("VITE_WHATSAPP_PHONE") or os.getenv("WHATSAPP_PHONE") or "").strip()

    if target_phone:
        # Hilo en segundo plano: NUNCA congela la respuesta de la API
        threading.Thread(
            target=dispatch_whatsapp_message,
            args=(target_phone, message),
            daemon=True
        ).start()
        return True
    return False
```

### C. Dónde conectar `notify_member_status_change`:

1. **En la consulta general / cron de socios:**
   ```python
   if m.status != new_status:
       old_st = m.status
       m.status = new_status
       notify_member_status_change(m, old_st, new_status, db)
   ```
2. **Al cobrar una cuota:**
   ```python
   old_status = member.status
   member.status = "ACTIVO"
   member.joined_at = datetime.datetime.utcnow()
   db.commit()
   if old_status and old_status != "ACTIVO":
       notify_member_status_change(member, old_status, "ACTIVO", db)
   ```
3. **Al editar el socio:**
   ```python
   if db_member.status != old_status:
       notify_member_status_change(db_member, old_status, db_member.status, db)
   ```

---

## ⚙️ 5. Variables de Entorno (.env)

### En la computadora local (`whatsapp-gateway/.env`):
```env
NGROK_DOMAIN=caramel-gopher-ounce.ngrok-free.dev
WHATSAPP_API_TOKEN=bunker_wa_secret_2026
PORT=3001
```

### En el servidor / Vercel (`.env`):
```env
WHATSAPP_GATEWAY_URL=https://caramel-gopher-ounce.ngrok-free.dev/send
WHATSAPP_API_TOKEN=bunker_wa_secret_2026
WHATSAPP_PHONE=+5493516002716
VITE_WHATSAPP_PHONE=+5493516002716
```

---

## 🚀 6. Pasos para Implementarlo en el Nuevo Proyecto

1. Copiá la carpeta `whatsapp-gateway/` a tu nuevo proyecto `gym-recognition`.
2. Asegurate de que la subcarpeta `auth_info/` esté **vacía**.
3. Copiá las funciones de Python (`get_whatsapp_status_message`, `dispatch_whatsapp_message`, `notify_member_status_change`) en tu backend.
4. Conectá las llamadas en los puntos donde cambia el estado del socio (vencimientos y cobros).
5. En la computadora donde correrá el bot:
   * Instalá Node.js.
   * Ejecutá `CONFIGURAR_ESTA_COMPUTADORA.bat`.
   * Escaneá el código QR una sola vez desde WhatsApp.
6. Configurá las variables en el hosting (Vercel, Render o servidor).
