import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappWebhookService } from '../whatsappWebhookService.js';

/**
 * Coexistencia: el setter le escribe al contacto desde la app de WhatsApp
 * Business del celular, no desde este panel. Meta reenvía esos mensajes por
 * el campo "smb_message_echoes" ("smb" por small business: es el eco de la
 * APP; el campo "message_echoes" sin ese prefijo es otro, el de la Cloud
 * API, y en una cuenta de coexistencia ni siquiera deja suscribirse).
 *
 * Antes se descartaban (handleEntry solo miraba "messages") y el bot nunca se
 * enteraba de que había un humano atendiendo: le seguía mandando recordatorios
 * por encima, y si la conversación no tenía fila de sesión, el barrido de
 * huérfanos la revivía con un "Perdona la demora".
 */

/**
 * Doble del servicio de mensajes. `knownMessageIds` son los mensajes que ya
 * están guardados — es lo que simula el onConflict(message_id).ignore() real:
 * un eco ya conocido devuelve isNew=false.
 */
function fakeDeps({ knownMessageIds = [] } = {}) {
  const known = new Set(knownMessageIds);
  const recorded = [];
  const paused = [];

  return {
    recorded,
    paused,
    messageService: {
      async recordOutboundEcho(payload) {
        recorded.push(payload);
        const isNew = !known.has(payload.messageId);
        known.add(payload.messageId);
        return { isNew };
      }
    },
    botService: {
      async setBotEnabled(waId, enabled) {
        paused.push({ waId, enabled });
      }
    }
  };
}

function buildService(deps) {
  const service = new WhatsappWebhookService({ botService: deps.botService });
  service.messageService = deps.messageService;
  return service;
}

function echoEntry(echoes) {
  return { changes: [{ field: 'smb_message_echoes', value: { message_echoes: echoes } }] };
}

const HUMAN_ECHO = {
  id: 'wamid.HUMANO1',
  to: '51999888777',
  type: 'text',
  timestamp: '1758650000',
  text: { body: 'Hola Erika, soy Luis del equipo. ¿Te llamo ahora?' }
};

test('un mensaje del setter desde la app de Business se guarda y pausa el bot', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry(echoEntry([HUMAN_ECHO]));

  assert.equal(deps.recorded.length, 1);
  assert.equal(deps.recorded[0].waId, '51999888777');
  assert.equal(deps.recorded[0].body, 'Hola Erika, soy Luis del equipo. ¿Te llamo ahora?');
  assert.deepEqual(deps.paused, [{ waId: '51999888777', enabled: false }]);
});

// Meta documenta que "smb_message_echoes" no trae lo que sale por la Cloud
// API, así que un mensaje del bot no debería aparecer acá. Esta es la red por
// si aparece igual (o por un reintento del mismo evento): si cada eco pausara,
// el bot se apagaría solo apenas manda su primer mensaje.
test('el eco de un mensaje que mandó el propio bot NO pausa el bot', async () => {
  const deps = fakeDeps({ knownMessageIds: ['wamid.DELBOT'] });
  await buildService(deps).handleEntry(echoEntry([{
    id: 'wamid.DELBOT',
    to: '51999888777',
    type: 'text',
    timestamp: '1758650000',
    text: { body: '¿Sigues por ahí? Cuando tengas un momento me cuentas 👀' }
  }]));

  assert.equal(deps.paused.length, 0, 'el bot no se debe pausar a sí mismo');
});

test('un eco repetido por un reintento de Meta pausa una sola vez', async () => {
  const deps = fakeDeps();
  const service = buildService(deps);
  await service.handleEntry(echoEntry([HUMAN_ECHO]));
  await service.handleEntry(echoEntry([HUMAN_ECHO]));

  assert.equal(deps.paused.length, 1);
});

// Un adjunto mandado desde el celular no trae texto: sin etiqueta se guardaba
// una fila vacía y el hilo del panel mostraba un renglón en blanco.
test('un adjunto del setter se guarda con su etiqueta y también pausa', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry(echoEntry([{
    id: 'wamid.IMG', to: '51999888777', type: 'image', timestamp: '1758650000', image: {}
  }]));

  assert.equal(deps.recorded[0].body, '[Imagen]');
  assert.equal(deps.paused.length, 1);
});

test('un eco sin destinatario se ignora sin romper el resto del lote', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry(echoEntry([{ id: 'wamid.SINTO', type: 'text', text: { body: 'x' } }, HUMAN_ECHO]));

  assert.equal(deps.recorded.length, 1);
  assert.deepEqual(deps.paused, [{ waId: '51999888777', enabled: false }]);
});

// Según la versión de la API el array puede venir con el nombre de siempre.
test('los ecos se leen también cuando vienen como "messages"', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry({
    changes: [{ field: 'smb_message_echoes', value: { messages: [HUMAN_ECHO] } }]
  });

  assert.equal(deps.paused.length, 1);
});

// El campo sin el prefijo "smb" se sigue aceptando por tolerancia. No es el
// que usa la coexistencia, pero si alguna vez llega, tratarlo igual no hace
// daño: el filtro de duplicados protege de los mensajes del propio bot.
test('un eco por el campo "message_echoes" sin prefijo también se atiende', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry({
    changes: [{ field: 'message_echoes', value: { message_echoes: [HUMAN_ECHO] } }]
  });

  assert.equal(deps.paused.length, 1);
});

// Regresión del nombre del campo: la primera version de este arreglo escuchaba
// "message_echoes" y el evento real de coexistencia nunca entraba.
test('el campo real de coexistencia es el que se atiende', async () => {
  const deps = fakeDeps();
  await buildService(deps).handleEntry({
    changes: [{ field: 'smb_message_echoes', value: { message_echoes: [HUMAN_ECHO] } }]
  });

  assert.equal(deps.recorded.length, 1, 'smb_message_echoes debe entrar al camino de ecos');
});

// El campo de siempre no se debe ver afectado: un entrante normal no pasa por
// el camino de ecos ni pausa nada.
test('un mensaje entrante normal no pausa el bot', async () => {
  const deps = fakeDeps();
  const service = buildService(deps);
  service.leadService = { async findOrCreateFromWhatsApp() {} };
  service.messageService.createFromMessage = async () => ({ record: { body: 'hola' }, isNew: false });

  await service.handleEntry({
    changes: [{ field: 'messages', value: { messages: [{ from: '51999888777', id: 'wamid.IN', type: 'text', text: { body: 'hola' } }] } }]
  });

  assert.equal(deps.paused.length, 0);
  assert.equal(deps.recorded.length, 0);
});
