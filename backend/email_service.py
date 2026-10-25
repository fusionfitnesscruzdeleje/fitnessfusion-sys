import os
import re
import smtplib
import logging
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr
from datetime import datetime

logger = logging.getLogger("email_service")
logging.basicConfig(level=logging.INFO)

# Configuración SMTP (por defecto Gmail de Fusion Fitness)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "fusionfitnesscruzdeleje@gmail.com")
# Se limpian los espacios de contraseñas de aplicación de Google (ej: "rcez kbqr ogyv txbc" -> "rcezkbqrogyvtxbc")
SMTP_PASS = os.getenv("SMTP_PASS", "rcezkbqrogyvtxbc").replace(" ", "").strip()
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Fusion Fitness")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

def is_valid_email(email_str: str) -> bool:
    if not email_str or not isinstance(email_str, str):
        return False
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email_str.strip()))

def _send_email_worker(to_email: str, subject: str, html_content: str, text_content: str = ""):
    """Función de trabajo que ejecuta el envío SMTP sincrónico en segundo plano."""
    clean_to = to_email.strip()
    if not is_valid_email(clean_to):
        logger.warning(f"[EMAIL] Dirección de correo inválida: '{clean_to}'. Omitiendo envío.")
        return False

    if not SMTP_USER or not SMTP_PASS:
        logger.warning("[EMAIL] Credenciales SMTP_USER / SMTP_PASS no configuradas. Omitiendo envío.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_EMAIL))
    msg["To"] = clean_to

    # Parte de texto plano de respaldo
    plain_text = text_content or re.sub(r"<[^>]+>", " ", html_content)
    part_text = MIMEText(plain_text, "plain", "utf-8")
    msg.attach(part_text)

    # Parte HTML interactiva y estilizada
    part_html = MIMEText(html_content, "html", "utf-8")
    msg.attach(part_html)

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM_EMAIL, [clean_to], msg.as_string())
        server.quit()
        logger.info(f"[EMAIL SENT] Correo entregado exitosamente a {clean_to} | Asunto: {subject}")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ERROR] Error enviando correo a {clean_to}: {e}")
        return False

def send_email_async(to_email: str, subject: str, html_content: str, text_content: str = ""):
    """Despacha el correo electrónico de forma no bloqueante en un hilo daemon."""
    if not is_valid_email(to_email):
        return False
    thread = threading.Thread(
        target=_send_email_worker,
        args=(to_email, subject, html_content, text_content),
        daemon=True
    )
    thread.start()
    return True

# ----------------- PLANTILLAS HTML ESTILIZADAS -----------------

def get_base_html(title: str, badge_text: str, badge_bg: str, badge_color: str, content_html: str) -> str:
    gym = os.getenv("GYM_NAME") or "FUSION FITNESS"
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0c0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0c0f17; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #151b27; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 30px 20px 30px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: linear-gradient(180deg, rgba(249, 115, 22, 0.1) 0%, rgba(21, 27, 39, 0) 100%);">
              <h1 style="margin: 0; font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #f97316; text-transform: uppercase;">{gym}</h1>
              <p style="margin: 5px 0 0 0; font-size: 10px; font-weight: 700; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; letter-spacing: 3px;">Sistema de Gestión de Socios</p>
            </td>
          </tr>
          
          <!-- Badge -->
          <tr>
            <td align="center" style="padding: 24px 30px 10px 30px;">
              <span style="display: inline-block; padding: 6px 16px; border-radius: 30px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; background-color: {badge_bg}; color: {badge_color}; border: 1px solid {badge_color}40;">
                {badge_text}
              </span>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 10px 30px 30px 30px; font-size: 14px; line-height: 1.6; color: rgba(255, 255, 255, 0.85);">
              {content_html}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 30px; background-color: #0f131c; border-top: 1px solid rgba(255, 255, 255, 0.05); text-align: center;">
              <p style="margin: 0; font-size: 11px; color: rgba(255, 255, 255, 0.4);">
                📍 <b>{gym}</b> &middot; Cruz del Eje, Córdoba
              </p>
              <p style="margin: 6px 0 0 0; font-size: 10px; color: rgba(255, 255, 255, 0.25);">
                Este es un mensaje institucional automático generado por el sistema de recepción.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

def send_member_status_email(member, status: str, next_due_date: str = None) -> bool:
    """Envía el correo correspondiente según el estado del socio (ACTIVO, POR VENCER, DEUDA)."""
    to_email = getattr(member, "email", None)
    if not is_valid_email(to_email):
        return False

    name = getattr(member, "name", "Socio")
    st = (status or "ACTIVO").upper().strip()
    plan_name = getattr(member, "membership_type", "Pase General")
    due_str = f"<b>Próximo Vencimiento:</b> {next_due_date}<br>" if next_due_date else ""

    if st in ["ACTIVO", "AL DIA", "AL DÍA"]:
        subject = f"💪 ¡Tu membresía está Activa y al día! - {name}"
        badge_text = "Membresía al Día"
        badge_bg = "rgba(34, 197, 94, 0.15)"
        badge_color = "#4ade80"
        headline = "¡Todo listo para entrenar!"
        body_text = f"""
          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #ffffff;">Hola, {name} 👋</h2>
          <p style="margin: 0 0 16px 0;">
            Te confirmamos que tu membresía en <b>Fusion Fitness</b> se encuentra <b>ACTIVA y al día</b>.
          </p>
          <div style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; font-weight: 800;">Detalles de tu cuenta:</p>
            <p style="margin: 0; font-size: 13px;">
              <b>Socio:</b> {name}<br>
              <b>Plan:</b> {plan_name}<br>
              {due_str}
              <b>Estado:</b> <span style="color: #4ade80; font-weight: bold;">AL DÍA</span>
            </p>
          </div>
          <p style="margin: 0;">¡A seguir con todo en tus entrenamientos! 💪🏋️</p>
        """
    elif st == "POR VENCER":
        subject = f"⏳ Aviso: Tu cuota está próxima a vencer - {name}"
        badge_text = "Próximo Vencimiento"
        badge_bg = "rgba(245, 158, 11, 0.15)"
        badge_color = "#fbbf24"
        headline = "Recordatorio de renovación"
        body_text = f"""
          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #ffffff;">Hola, {name} 👋</h2>
          <p style="margin: 0 0 16px 0;">
            Te recordamos que tu cuota en <b>Fusion Fitness</b> está <b>POR VENCER en los próximos días</b>.
          </p>
          <div style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; font-weight: 800;">Estado de la Membresía:</p>
            <p style="margin: 0; font-size: 13px;">
              <b>Socio:</b> {name}<br>
              <b>Plan:</b> {plan_name}<br>
              {due_str}
              <b>Estado:</b> <span style="color: #fbbf24; font-weight: bold;">POR VENCER</span>
            </p>
          </div>
          <p style="margin: 0 0 12px 0;">
            ¡No olvides renovar tu cuota en recepción para seguir entrenando sin interrupciones!
          </p>
        """
    elif st == "DEUDA":
        subject = f"⚠️ Regularizá tu cuota del gimnasio - {name}"
        badge_text = "Cuota Vencida / Pendiente"
        badge_bg = "rgba(239, 68, 68, 0.15)"
        badge_color = "#f87171"
        headline = "Aviso importante de membresía"
        body_text = f"""
          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #ffffff;">Hola, {name}</h2>
          <p style="margin: 0 0 16px 0;">
            Te informamos que tu plan en <b>Fusion Fitness</b> figura <b>VENCIDO y con saldo pendiente</b>.
          </p>
          <div style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: rgba(255, 255, 255, 0.5); text-transform: uppercase; font-weight: 800;">Detalles de la Cuenta:</p>
            <p style="margin: 0; font-size: 13px;">
              <b>Socio:</b> {name}<br>
              <b>Plan:</b> {plan_name}<br>
              {due_str}
              <b>Estado:</b> <span style="color: #f87171; font-weight: bold;">DEUDA / VENCIDO</span>
            </p>
          </div>
          <p style="margin: 0;">
            Por favor, acercate a recepción en tu próxima visita para regularizar tu cuota y continuar disfrutando de las instalaciones. ¡Te esperamos!
          </p>
        """
    else:
        return False

    html_email = get_base_html(subject, badge_text, badge_bg, badge_color, body_text)
    return send_email_async(to_email, subject, html_email)

def send_payment_receipt_email(member, amount: float, method: str, plans_str: str = "", staff_name: str = "", next_due_date: str = None) -> bool:
    """Envía el comprobante digital de pago registrado al correo del socio."""
    to_email = getattr(member, "email", None)
    if not is_valid_email(to_email):
        return False

    name = getattr(member, "name", "Socio")
    gym = os.getenv("GYM_NAME") or "FUSION FITNESS"
    subject = f"🧾 Comprobante de Pago Confirmado - {gym}"
    badge_text = "Pago Confirmado"
    badge_bg = "rgba(34, 197, 94, 0.15)"
    badge_color = "#4ade80"
    now_str = datetime.now().strftime("%d/%m/%Y %H:%M")
    due_line = f"<tr><td style='padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;'>Próximo Vencimiento:</td><td style='padding: 6px 0; font-weight: bold; text-align: right; color: #f97316;'>{next_due_date}</td></tr>" if next_due_date else ""

    body_text = f"""
      <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 800; color: #ffffff;">¡Gracias por tu pago, {name}! 🎉</h2>
      <p style="margin: 0 0 18px 0;">
        Hemos registrado correctamente tu pago en recepción. A continuación encontrarás el resumen de tu comprobante:
      </p>

      <table role="presentation" width="100%" style="background-color: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 18px; margin-bottom: 20px;">
        <tr>
          <td style="padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;">Socio:</td>
          <td style="padding: 6px 0; font-weight: bold; text-align: right;">{name}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;">DNI:</td>
          <td style="padding: 6px 0; font-weight: bold; text-align: right;">{getattr(member, 'dni', '-')}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;">Planes:</td>
          <td style="padding: 6px 0; font-weight: bold; text-align: right; color: #f97316;">{plans_str or getattr(member, 'membership_type', 'Pase General')}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;">Medio de Pago:</td>
          <td style="padding: 6px 0; font-weight: bold; text-align: right;">{method}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: rgba(255,255,255,0.5); font-size: 12px;">Fecha y Hora:</td>
          <td style="padding: 6px 0; font-weight: bold; text-align: right;">{now_str}</td>
        </tr>
        {due_line}
        <tr style="border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <td style="padding: 12px 0 0 0; color: #ffffff; font-weight: 900; font-size: 14px; text-transform: uppercase;">Total Abonado:</td>
          <td style="padding: 12px 0 0 0; font-weight: 900; text-align: right; font-size: 18px; color: #4ade80;">${amount:,.0f}</td>
        </tr>
      </table>

      <p style="margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.5); text-align: center;">
        Atendido por: {staff_name or 'Recepción'}
      </p>
    """

    html_email = get_base_html(subject, badge_text, badge_bg, badge_color, body_text)
    return send_email_async(to_email, subject, html_email)
