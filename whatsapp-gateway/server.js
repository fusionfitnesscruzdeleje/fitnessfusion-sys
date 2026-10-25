const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 3001;
const AUTH_DIR = path.join(__dirname, 'auth_info');
const API_TOKEN = process.env.WHATSAPP_API_TOKEN || 'bunker_wa_secret_2026';
const GYM_NAME = process.env.GYM_NAME || 'Fusion Fitness';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let sock = null;
let isConnected = false;
let currentQR = null;
let currentQRDataUrl = null;
let connectedUser = null;
let isConnecting = false;

// Almacenamiento en memoria para responder peticiones de reintento de descifrado Signal (E2EE retry requests)
// Esto soluciona definitivamente el cartel "Esperando el mensaje. Esto puede demorar un poco."
const messageStore = new Map();

function storeMessage(keyId, message) {
  if (!keyId || !message) return;
  messageStore.set(keyId, message);
  if (messageStore.size > 2000) {
    const oldestKey = messageStore.keys().next().value;
    messageStore.delete(oldestKey);
  }
}

async function startWhatsApp() {
  if (isConnecting) return;
  isConnecting = true;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.windows('Desktop'),
      syncFullHistory: false,
      // Implementación obligatoria de getMessage para reenvío de claves en reintentos
      getMessage: async (key) => {
        if (key && key.id && messageStore.has(key.id)) {
          return messageStore.get(key.id);
        }
        return {
          conversation: 'Notificación de ' + GYM_NAME
        };
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        try {
          currentQRDataUrl = await qrcode.toDataURL(qr, { scale: 8, margin: 2 });
          console.log('\n[WHATSAPP] >> Nuevo código QR generado. Escanéalo en: http://localhost:' + PORT + ' o en la terminal.\n');
        } catch (e) {
          console.error('[WHATSAPP] Error generando QR DataURL:', e);
        }
      }

      if (connection === 'open') {
        isConnected = true;
        currentQR = null;
        currentQRDataUrl = null;
        connectedUser = sock.user;
        const phone = sock.user?.id ? sock.user.id.split(':')[0] : 'Desconocido';
        console.log(`\n======================================================`);
        console.log(`  [WHATSAPP CONECTADO CON ÉXITO]`);
        console.log(`  Número vinculado: +${phone}`);
        console.log(`  Nombre: ${sock.user?.name || GYM_NAME}`);
        console.log(`  Listo para despachar mensajes en segundo plano!`);
        console.log(`======================================================\n`);
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WHATSAPP] Conexión cerrada (Código: ${statusCode}). Reconectar: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[WHATSAPP] Sesión cerrada desde el celular. Limpiando credenciales para nuevo QR...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (e) {}
        }

        isConnecting = false;
        setTimeout(() => {
          startWhatsApp();
        }, 3000);
      }
    });
  } catch (error) {
    console.error('[WHATSAPP] Error inicializando socket:', error);
    isConnecting = false;
    setTimeout(startWhatsApp, 5000);
  }
}

// Check authorization middleware (optional for local, protects public tunnel)
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const queryToken = req.query.token;
  const bodyToken = req.body.token;

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : (queryToken || bodyToken);

  if (API_TOKEN && token && token !== API_TOKEN) {
    return res.status(401).json({ error: 'Token no autorizado' });
  }
  next();
}

// -------------------- HTTP ENDPOINTS --------------------

// Status JSON
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    phone: connectedUser?.id ? connectedUser.id.split(':')[0] : null,
    name: connectedUser?.name || null,
    hasQR: !!currentQR
  });
});

// Endpoint para reiniciar sesión limpia y generar nuevas claves criptográficas
app.all(['/relink', '/reset-session'], async (req, res) => {
  try {
    console.log('\n[WHATSAPP] >> Solicitud de re-vinculación/renovación de sesión recibida. Purgando credenciales desfasadas...');
    if (sock) {
      try { sock.end(); } catch (e) {}
      sock = null;
    }
    isConnected = false;
    currentQR = null;
    currentQRDataUrl = null;
    connectedUser = null;
    isConnecting = false;
    messageStore.clear();

    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log('[WHATSAPP] Carpeta auth_info limpiada exitosamente.');
      }
    } catch (e) {
      console.error('[WHATSAPP] Advertencia limpiando auth_info:', e);
    }

    setTimeout(() => {
      startWhatsApp();
    }, 1000);

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({ success: true, message: 'Sesión reiniciada con éxito. Por favor escanea el nuevo código QR.' });
    }
    return res.redirect('/');
  } catch (err) {
    console.error('[WHATSAPP RELINK ERROR]:', err);
    return res.status(500).send('Error reiniciando sesión: ' + err.message);
  }
});

// Send Message Endpoint (Compatible con backend y Argentina 54 vs 549)
app.post('/send', authenticate, async (req, res) => {
  try {
    const rawTo = req.body.to || req.body.phone || req.body.recipient;
    const message = req.body.message || req.body.body || req.body.text;

    if (!rawTo) {
      return res.status(400).json({ error: 'Campo "to" o "phone" es obligatorio.' });
    }
    if (!message) {
      return res.status(400).json({ error: 'Campo "message" o "body" es obligatorio.' });
    }

    if (!isConnected || !sock) {
      return res.status(503).json({
        error: 'WhatsApp no está vinculado todavía. Por favor escanear el código QR primero.',
        hasQR: !!currentQR
      });
    }

    // Normalizar dígitos
    let cleanPhone = String(rawTo).replace(/[^0-9]/g, '');

    // Generar candidatos de Argentina (con 9 y sin 9) para resolver el JID exacto y canónico
    const candidates = [];
    if (cleanPhone.startsWith('549')) {
      candidates.push(cleanPhone);
      candidates.push('54' + cleanPhone.slice(3));
    } else if (cleanPhone.startsWith('54')) {
      candidates.push('549' + cleanPhone.slice(2));
      candidates.push(cleanPhone);
    } else if (cleanPhone.startsWith('9') && cleanPhone.length === 11) {
      candidates.push('54' + cleanPhone);
      candidates.push('54' + cleanPhone.slice(1));
    } else if (cleanPhone.length === 10) {
      candidates.push('549' + cleanPhone);
      candidates.push('54' + cleanPhone);
    } else {
      candidates.push(cleanPhone);
    }

    let targetJid = null;
    for (const cand of candidates) {
      try {
        const [lookup] = await sock.onWhatsApp(cand);
        if (lookup && lookup.exists && lookup.jid) {
          targetJid = lookup.jid;
          console.log(`[WHATSAPP ON_WHATSAPP] Número verificado: ${cand} -> JID Canónico: ${targetJid}`);
          break;
        }
      } catch (e) {}
    }

    if (!targetJid) {
      targetJid = `${candidates[0]}@s.whatsapp.net`;
      console.log(`[WHATSAPP FALLBACK] JID no verificado directamente, usando: ${targetJid}`);
    }

    console.log(`[WHATSAPP DISPATCH] Enviando mensaje a ${targetJid}...`);
    const sent = await sock.sendMessage(targetJid, { text: String(message) });

    // Guardar en el almacén de mensajes para resolver retry requests futuros
    if (sent && sent.key && sent.key.id) {
      storeMessage(sent.key.id, sent.message);
    }

    console.log(`[WHATSAPP SENT] Mensaje entregado con ID: ${sent.key.id}`);

    return res.json({
      success: true,
      status: 'sent',
      messageId: sent.key.id,
      to: targetJid,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[WHATSAPP SEND ERROR]:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Error interno al enviar mensaje de WhatsApp'
    });
  }
});

// UI: Web View with Live QR Code or Connected Status
app.get(['/', '/qr'], (req, res) => {
  const phone = connectedUser?.id ? connectedUser.id.split(':')[0] : null;

  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${GYM_NAME} - Pasarela WhatsApp</title>
  <style>
    body {
      margin: 0;
      background: #0d0f14;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 20px;
      box-sizing: border-box;
    }
    .card {
      background: #151922;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 28px;
      max-width: 440px;
      width: 100%;
      padding: 36px 30px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
    }
    .logo {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 3px;
      color: #f38e26;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .subtitle {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.4);
      margin-bottom: 24px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 24px;
    }
    .badge.connected {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid rgba(34, 197, 94, 0.4);
      color: #4ade80;
    }
    .badge.disconnected {
      background: rgba(243, 142, 38, 0.15);
      border: 1px solid rgba(243, 142, 38, 0.4);
      color: #f38e26;
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
    }
    .qr-container {
      background: #ffffff;
      padding: 16px;
      border-radius: 20px;
      display: inline-block;
      margin: 10px 0 20px 0;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .qr-container img {
      display: block;
      width: 240px;
      height: 240px;
    }
    .instructions {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .instructions b {
      color: #ffffff;
    }
    .token-box {
      background: rgba(0,0,0,0.3);
      border: 1px dashed rgba(255,255,255,0.15);
      border-radius: 12px;
      padding: 10px;
      font-size: 11px;
      color: rgba(255,255,255,0.7);
      word-break: break-all;
      margin-top: 20px;
      font-family: monospace;
    }
    .footer {
      font-size: 10px;
      color: rgba(255,255,255,0.25);
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">${GYM_NAME}</div>
    <div class="subtitle">Pasarela de WhatsApp 2026</div>

    ${isConnected ? `
      <div class="badge connected">
        <span class="badge-dot"></span>
        Conectado y Activo
      </div>
      <div style="font-size: 18px; font-weight: 900; margin: 15px 0 5px 0;">+${phone}</div>
      <p style="font-size: 12px; color: rgba(255,255,255,0.5); margin-bottom: 20px;">
        La pasarela está lista para despachar recordatorios y notificaciones de forma silenciosa.
      </p>
    ` : `
      <div class="badge disconnected">
        <span class="badge-dot"></span>
        Escanea el Código QR
      </div>

      ${currentQRDataUrl ? `
        <div class="qr-container">
          <img src="${currentQRDataUrl}" alt="WhatsApp QR Code" />
        </div>
        <div class="instructions">
          Abrí <b>WhatsApp</b> en tu celular &rarr; <b>Dispositivos vinculados</b> &rarr; <b>Vincular un dispositivo</b> y apuntá la cámara hacia este código QR.
        </div>
      ` : `
        <div style="padding: 40px 20px; color: rgba(255,255,255,0.4); font-size: 13px;">
          Iniciando sesión y generando código QR... Por favor aguarda unos segundos.
        </div>
      `}
    <div style="margin: 20px 0 10px 0;">
      <a href="/relink" onclick="return confirm('¿Deseas reiniciar la sesión y generar un nuevo código QR limpio?')" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px rgba(220, 38, 38, 0.3); transition: all 0.2s;">
        🔄 Re-vincular / Renovar Sesión
      </a>
    </div>

    <div class="token-box">
      <b>Token de API:</b> ${API_TOKEN}
    </div>

    <div class="footer">${GYM_NAME} OS • Baileys + Cloudflare Engine</div>
  </div>

  <script>
    // Auto-reload every 15s if waiting for QR or scan
    ${!isConnected ? `
      setTimeout(() => {
        window.location.reload();
      }, 15000);
    ` : ''}
  </script>
</body>
</html>
  `);
});

// Start listening and launch WhatsApp client
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  ${GYM_NAME} WhatsApp Gateway corriendo en:`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`======================================================\n`);
  startWhatsApp();
});
