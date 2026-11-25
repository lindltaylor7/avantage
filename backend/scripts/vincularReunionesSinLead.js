/**
 * Ata a su lead las reuniones cargadas a mano sin lead (desde el Calendario).
 *
 *   node backend/scripts/vincularReunionesSinLead.js           → solo muestra
 *   node backend/scripts/vincularReunionesSinLead.js --apply   → escribe
 *
 * Usa la misma regla que el alta (`resolveLeadForMeeting`): el celular escrito
 * en el contacto o el tema, o el correo del invitado, y solo si apuntan a UN
 * lead. Las ambiguas y las sin dato se listan para atarlas a mano.
 */
import 'dotenv/config';
import { db } from '../db/connection.js';
import { resolveLeadForMeeting } from '../services/meetingLeadLink.js';

const apply = process.argv.includes('--apply');

const meetings = await db('scheduled_meetings')
  .whereNull('lead_id')
  .select('id', 'contact_name', 'topic', 'attendee_email', 'created_by', 'start_time');

let linked = 0;
const pending = [];
for (const m of meetings) {
  const leadId = await resolveLeadForMeeting({ contactName: m.contact_name, topic: m.topic, attendeeEmail: m.attendee_email });
  if (!leadId) { pending.push(m); continue; }
  linked += 1;
  console.log(`#${m.id} ${m.contact_name || ''} → lead ${leadId}`);
  if (apply) await db('scheduled_meetings').where({ id: m.id }).whereNull('lead_id').update({ lead_id: leadId });
}

console.log(`\n${meetings.length} reuniones sin lead · ${linked} ${apply ? 'vinculadas' : 'se vincularían (usa --apply)'} · ${pending.length} sin un lead único:`);
for (const m of pending) console.log(`  #${m.id} ${m.contact_name || '(sin nombre)'} · ${String(m.topic || '').slice(0, 60)}`);
await db.destroy();
