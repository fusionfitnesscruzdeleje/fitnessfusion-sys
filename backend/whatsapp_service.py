import os
import re
import json
import logging
import threading
import urllib.request
import urllib.parse
import datetime
from sqlalchemy.orm.attributes import flag_modified

logger = logging.getLogger("whatsapp_service")
logging.basicConfig(level=logging.INFO)

def normalize_phone_number(target_phone: str) -> str:
    """Normaliza números de teléfono al formato internacional de WhatsApp (Argentina 549...)."""
    clean_digits = re.sub(r"\D", "", target_phone or "")
    if clean_digits.startswith("0"):
        clean_digits = clean_digits[1:]
    # Si tiene 10 dígitos (ej: 3516002716), agregar 549
    if not clean_digits.startswith("54") and len(clean_digits) == 10:
        clean_digits = "549" + clean_digits
    # Si arranca con 54 pero no con 549 (ej: 543516002716 - 12 dígitos), intercalar 9
    elif clean_digits.startswith("54") and not clean_digits.startswith("549") and len(clean_digits) == 12:
        clean_digits = "549" + clean_digits[2:]
    return clean_digits

def get_whatsapp_status_message(status: str, member_name: str = None) -> str:
    """Define los textos de los mensajes según el estado del socio."""
    gym = os.getenv("GYM_NAME") or "FUSION FITNESS"
    bot = os.getenv("WHATSAPP_BOT_NAME") or "FUSION BOT"
    st = (status or "ACTIVO").upper().strip()
    name_str = f" {member_name.split()[0]}" if member_name and member_name.strip() else ""

    if st in ["ACTIVO", "AL DIA", "AL DÍA"]:
        return f"Hola{name_str}, soy {bot} de {gym}, ¿cómo estás? Tu membresía está ACTIVA y al día. ¡A seguir con todo en los entrenamientos! 💪🏋️"
    elif st == "POR VENCER":
        return f"Hola{name_str}, soy {bot} de {gym}, ¿cómo estás? Te recordamos que tu cuota del gimnasio está POR VENCER en los próximos días. ¡No olvides renovar antes de que sea tarde para seguir entrenando sin pausa! ⏳"
    elif st == "DEUDA":
        return f"Hola{name_str}, soy {bot} de {gym}. Te informamos que tu plan se encuentra VENCIDO y figura en DEUDA. Por favor, acercate a recepción para regularizar tu cuota y seguir disfrutando del gimnasio. ¡Te esperamos! ⚠️"
    return f"Hola{name_str}, te contactamos desde {gym}."

def dispatch_whatsapp_message(target_phone: str, message: str, sender_phone: str = None) -> bool:
    """Envía la petición HTTP a la pasarela de WhatsApp en segundo plano."""
    clean_digits = normalize_phone_number(target_phone)
    if not clean_digits:
        logger.warning("[WHATSAPP] Teléfono inválido o vacío. Omitiendo envío.")
        return False

    sender = sender_phone or os.getenv("VITE_WHATSAPP_PHONE") or os.getenv("WHATSAPP_PHONE") or ""
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL")
    gateway_token = os.getenv("WHATSAPP_API_TOKEN")

    if not gateway_url:
        logger.warning("[WHATSAPP] WHATSAPP_GATEWAY_URL no configurada en las variables de entorno.")
        return False

    endpoint_url = gateway_url.strip()
    if not endpoint_url.endswith("/send") and not endpoint_url.endswith("/send/"):
        endpoint_url = endpoint_url.rstrip("/") + "/send"

    try:
        post_data = json.dumps({
            "sender": sender,
            "phone": clean_digits,
            "to": clean_digits,
            "message": message
        }).encode("utf-8")

        headers = {"Content-Type": "application/json"}
        if gateway_token:
            headers["Authorization"] = f"Bearer {gateway_token}"

        req = urllib.request.Request(endpoint_url, data=post_data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=12) as resp:
            logger.info(f"[WHATSAPP SENT via Gateway {resp.status}] Destino: +{clean_digits}")
            return True
    except Exception as e:
        logger.error(f"[WHATSAPP ERROR] Fallo al enviar a +{clean_digits}: {e}")
        return False

def notify_member_status_change(member, old_status: str, new_status: str, db=None, force: bool = False) -> bool:
    """
    Valida anti-spam y despacha en un hilo asíncrono en segundo plano (daemon thread).
    Nunca bloquea la UI ni la respuesta de la API.
    """
    st = (new_status or "ACTIVO").upper().strip()
    if st not in ["ACTIVO", "AL DIA", "AL DÍA", "POR VENCER", "DEUDA"]:
        return False

    wellness = dict(member.wellness_data or {})
    last_notified = wellness.get("last_wa_notified_status")

    # Anti-spam: no repetir si ya fue notificado en ese estado (a menos que se fuerce)
    if not force and last_notified == st:
        logger.info(f"[WHATSAPP ANTI-SPAM] Omitido: {getattr(member, 'name', 'Socio')} ya notificado con estado {st}")
        return False

    # Evitar notificar ACTIVO inicial si no venía de deuda o por vencer
    old_clean = (old_status or "").upper().strip()
    if not force and st in ["ACTIVO", "AL DIA", "AL DÍA"] and old_clean not in ["DEUDA", "POR VENCER"]:
        logger.info(f"[WHATSAPP ANTI-SPAM] Omitido: {getattr(member, 'name', 'Socio')} activo sin transición previa desde deuda/por vencer.")
        return False

    wellness["last_wa_notified_status"] = st
    wellness["last_wa_notified_at"] = datetime.datetime.utcnow().isoformat()
    member.wellness_data = wellness
    try:
        flag_modified(member, "wellness_data")
    except Exception:
        pass

    if db:
        try:
            db.add(member)
            db.commit()
        except Exception as e:
            logger.warning(f"[WHATSAPP] Advertencia al persistir anti-spam en BD: {e}")

    message = get_whatsapp_status_message(st, member_name=getattr(member, "name", None))
    target_phone = (getattr(member, "phone", None) or os.getenv("VITE_WHATSAPP_PHONE") or os.getenv("WHATSAPP_PHONE") or "").strip()

    if target_phone:
        logger.info(f"[WHATSAPP QUEUED] Disparando hilo para notificar a {getattr(member, 'name', 'Socio')} (+{target_phone}) -> Estado: {st}")
        threading.Thread(
            target=dispatch_whatsapp_message,
            args=(target_phone, message),
            daemon=True
        ).start()
        return True
    return False

def check_gateway_status() -> dict:
    """Verifica el estado del gateway y de la sesión de WhatsApp."""
    gateway_url = os.getenv("WHATSAPP_GATEWAY_URL")
    if not gateway_url:
        return {"configured": False, "connected": False, "error": "WHATSAPP_GATEWAY_URL no configurada"}

    base_url = gateway_url.replace("/send", "").rstrip("/")
    status_url = f"{base_url}/status"
    try:
        req = urllib.request.Request(status_url, headers={"User-Agent": "FastAPI-Backend"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return {"configured": True, "online": True, **data}
    except Exception as e:
        return {"configured": True, "online": False, "error": str(e)}
