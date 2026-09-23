import 'dotenv/config';
import { WhatsappBotService } from '../services/whatsappBotService.js';

/**
 * Reproduce la alerta interna "🆘 Lead transferido a un asesor" — la que falló
 * las 3 veces que ocurrió de verdad, porque se mandaba como texto libre al
 * número interno fuera de la ventana de 24 h de WhatsApp.
 *
 * Por defecto NO envía nada: imprime el correo que saldría y por qué canal.
 * Con `--send` manda el correo de verdad al destinatario configurado.
 *
 *   node backend/scripts/checkInternalAlert.js
 *   node backend/scripts/checkInternalAlert.js --send
 */

const reallySend = process.argv.includes('--send');

const recipient = process.env.INTERNAL_ALERT_EMAIL || '(sin configurar)';
const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const waId = process.argv.find((a) => /^\d{8,}$/.test(a)) || '51921124360';

const captured = [];

const bot = new WhatsappBotService({
  notificationService: {
    create: async (n) => { captured.push({ canal: 'panel', ...n }); return n; }
  },
  emailService: {
    sendInternalAlertEmail: async (to, payload) => {
      captured.push({ canal: 'email', to, ...payload });
      return { success: true };
    }
  },
  settingsService: {
    // Sin `sales_notification_email` configurado, para comprobar que cae al
    // INTERNAL_ALERT_EMAIL del entorno. `sales_notification_phone` puesto para
    // ver que WhatsApp se salta solo cuando la ventana está cerrada.
    get: async () => ({ sales_notification_phone: '51972566937' })
  },
  whatsappMessageService: {
    isCustomerWindowOpen: async () => false, // el caso real: cerrada
    sendTextMessage: async () => { captured.push({ canal: 'whatsapp' }); }
  }
});

await bot.alertInternal({
  waId,
  type: 'whatsapp_lead_handed_off',
  title: 'Lead de WhatsApp transferido a un asesor',
  body: `🆘 Lead transferido a un asesor: Julinho Cal (${waId}). Motivo: pidió hablar con una persona.`
});

console.log(`\nDestinatario configurado: ${recipient}`);
console.log(`Enlace del botón:        ${base}/admin/whatsapp?waId=${waId}\n`);
console.log('Canales por los que salió la alerta:');
for (const c of captured) {
  if (c.canal === 'panel') console.log(`  ✅ panel    → "${c.title}" (link ${c.link})`);
  if (c.canal === 'email') console.log(`  ✅ email    → ${c.to} | asunto: "${c.subject}" | botón: ${c.actionUrl}`);
  if (c.canal === 'whatsapp') console.log('  ✅ whatsapp → enviado');
}
if (!captured.some((c) => c.canal === 'whatsapp')) {
  console.log('  ⏭️  whatsapp → omitido (ventana de 24 h cerrada). Antes se intentaba y fallaba en silencio.');
}

if (reallySend) {
  const { EmailService } = await import('../services/emailService.js');
  const emailService = new EmailService();
  const result = await emailService.sendInternalAlertEmail(process.env.INTERNAL_ALERT_EMAIL, {
    subject: '[Avan] Lead de WhatsApp transferido a un asesor (prueba)',
    title: 'Lead de WhatsApp transferido a un asesor',
    bodyText: `🆘 Lead transferido a un asesor: Julinho Cal (${waId}). Motivo: prueba del canal de alertas.`,
    actionUrl: `${base}/admin/whatsapp?waId=${waId}`,
    actionLabel: 'Abrir la conversación'
  });
  console.log('\nEnvío real:', result);
}

process.exit(0);
