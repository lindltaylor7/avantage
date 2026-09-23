import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingEventTitle } from '../whatsappBotService.js';

/*
 * Título del evento en el Google Calendar del closer.
 *
 * Caso real: cuatro reuniones seguidas con el título IDÉNTICO
 * "💻 Asesoría de tesis - Tema de tesis por definir: Caso de estudio y
 * propuesta en Perú", porque ese tema genérico es el de casi todos los leads.
 * El closer no sabía con quién era cada una sin abrirlas.
 */

test('el nombre del lead va primero, que es lo que sobrevive al corte del título', () => {
  const title = meetingEventTitle({ leadName: 'María Fernanda Quispe', waId: '51987654321' });
  assert.equal(title, '💻 María Fernanda Quispe — Asesoría de tesis');
  assert.ok(title.indexOf('María') < title.indexOf('Asesoría'), 'el nombre debe ir antes');
});

test('se usa el nombre COMPLETO: dos "María" en la semana volverían a confundirse', () => {
  const a = meetingEventTitle({ leadName: 'María Fernanda Quispe' });
  const b = meetingEventTitle({ leadName: 'María Alejandra Torres' });
  assert.notEqual(a, b);
});

test('el icono distingue la modalidad', () => {
  assert.match(meetingEventTitle({ leadName: 'Carlos Ramírez', isPhone: true }), /^📞/);
  assert.match(meetingEventTitle({ leadName: 'Carlos Ramírez', isPhone: false }), /^💻/);
});

test('sin nombre se cae al teléfono del contacto', () => {
  const title = meetingEventTitle({ leadName: null, contactPhone: '+51 987 654 321', waId: '51987654321' });
  assert.equal(title, '💻 +51 987 654 321 — Asesoría de tesis');
});

test('el nombre genérico de WhatsApp no cuenta como nombre', () => {
  const title = meetingEventTitle({
    leadName: 'Contacto de WhatsApp',
    contactPhone: '+51 987 654 321',
    waId: '51987654321'
  });
  assert.match(title, /\+51 987 654 321/);
  assert.doesNotMatch(title, /Contacto de WhatsApp/);
});

// Un contacto de Instagram/Facebook llega sin teléfono real (wa_id "PE.2249…").
test('sin nombre ni teléfono se usa el id de WhatsApp antes que nada', () => {
  const title = meetingEventTitle({ leadName: '', waId: 'PE.2249381' });
  assert.equal(title, '💻 PE.2249381 — Asesoría de tesis');
});

// Un alias raro distingue mejor que no poner nada.
test('un alias de perfil se usa tal cual', () => {
  assert.match(meetingEventTitle({ leadName: 'Julinho_Cal🤗' }), /Julinho_Cal🤗/);
});

test('dos leads distintos nunca producen el mismo título', () => {
  const titles = new Set([
    meetingEventTitle({ leadName: 'Ana Pérez' }),
    meetingEventTitle({ leadName: 'Luis Gómez' }),
    meetingEventTitle({ leadName: null, contactPhone: '+51 911 111 111' }),
    meetingEventTitle({ leadName: null, contactPhone: '+51 922 222 222' })
  ]);
  assert.equal(titles.size, 4);
});
