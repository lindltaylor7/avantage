import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateQualification,
  isInstitute,
  normalizeAcademicStatus,
  normalizeCycle,
  normalizeThesisSituation
} from '../leadQualification.js';

test('normalizeAcademicStatus reduce variantes al catálogo', () => {
  assert.equal(normalizeAcademicStatus('egresada'), 'Egresado');
  assert.equal(normalizeAcademicStatus('ya soy bachiller'), 'Bachiller');
  assert.equal(normalizeAcademicStatus('Magister'), 'Magíster');
  assert.equal(normalizeAcademicStatus('estudiante'), 'Estudiante');
  assert.equal(normalizeAcademicStatus('no sé'), null);
});

test('normalizeCycle acepta números y descarta lo que no es un ciclo', () => {
  assert.equal(normalizeCycle(8), 8);
  assert.equal(normalizeCycle('6to'), 6);
  assert.equal(normalizeCycle(null), null);
  assert.equal(normalizeCycle(40), null);
});

test('normalizeThesisSituation solo acepta valores exactos del catálogo', () => {
  assert.equal(normalizeThesisSituation('tesis sin avance'), 'Tesis sin avance');
  assert.equal(normalizeThesisSituation('Levantamiento de observaciones'), 'Levantamiento de Observaciones');
  assert.equal(normalizeThesisSituation('tengo algo avanzado'), null);
});

test('isInstitute distingue institutos de universidades', () => {
  assert.equal(isInstitute('IESTP Huancayo'), true);
  assert.equal(isInstitute('Instituto Pedagógico Nacional'), true);
  assert.equal(isInstitute('SENATI'), true);
  assert.equal(isInstitute('Universidad Continental'), false);
  assert.equal(isInstitute('Universidad Nacional Tecnológica de Lima Sur'), false);
});

test('estudiante de pregrado: pregunta el ciclo, descarta < 8 y deja pasar >= 8', () => {
  assert.deepEqual(evaluateQualification({ academicStatus: 'Estudiante' }), { status: 'missing', ask: 'cycle' });
  assert.deepEqual(evaluateQualification({ academicStatus: 'Estudiante', cycle: 5 }), { status: 'rejected', reason: 'low_cycle' });
  assert.deepEqual(evaluateQualification({ academicStatus: 'Estudiante', cycle: 8 }), { status: 'qualified' });
});

test('el filtro de ciclo no aplica a egresados ni a posgrado', () => {
  assert.equal(evaluateQualification({ academicStatus: 'Egresado' }).status, 'qualified');
  assert.equal(evaluateQualification({ academicStatus: 'Estudiante', cycle: 2, level: 'Posgrado (Maestría)' }).status, 'qualified');
  assert.equal(evaluateQualification({}).status, 'qualified');
});

test('instituto: pregunta la carrera, deja pasar administración/educación y descarta el resto', () => {
  assert.deepEqual(evaluateQualification({ university: 'IESTP Andahuaylas' }), { status: 'missing', ask: 'field' });
  assert.equal(evaluateQualification({ university: 'IESTP Andahuaylas', field: 'Contabilidad' }).status, 'qualified');
  assert.equal(evaluateQualification({ university: 'Instituto Pedagógico', field: 'Educación Inicial' }).status, 'qualified');
  assert.deepEqual(
    evaluateQualification({ university: 'SENATI', field: 'Mecánica automotriz' }),
    { status: 'rejected', reason: 'institute_field' }
  );
});
