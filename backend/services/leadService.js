import { db } from '../db/connection.js';

/**
 * Servicio de acceso a datos para los leads y prospectos (registro comercial de usuarios
 * del chatbot y prospectos capturados en la Base de Datos).
 */
export class LeadService {
  async createLead({
    topic,
    academicLevel,
    fieldOfStudy,
    email,
    phone,
    additionalNotes,
    overallViabilityScore,
    viabilityLevel,
    fullName,
    dni,
    gender,
    birthDate,
    university,
    thesisSituation,
    department,
    province,
    address,
    assignedTo,
    source,
    status
  }) {
    const [id] = await db('leads').insert({
      topic: topic || 'Asesoría de Tesis',
      academic_level: academicLevel || 'Pregrado (Bachiller/Título)',
      field_of_study: fieldOfStudy || 'General',
      email: email || '',
      phone: phone || '',
      additional_notes: additionalNotes || null,
      overall_viability_score: overallViabilityScore ?? null,
      viability_level: viabilityLevel || null,
      full_name: fullName || null,
      dni: dni || null,
      gender: gender || null,
      birth_date: birthDate || null,
      university: university || null,
      thesis_situation: thesisSituation || null,
      department: department || null,
      province: province || null,
      address: address || null,
      assigned_to: assignedTo || 'Kevin',
      source: source || 'Chatbot Web',
      status: status || 'nuevo'
    });
    return this.getLeadById(id);
  }

  async createProspect(data) {
    return this.createLead({
      fullName: data.fullName || data.full_name,
      phone: data.phone,
      email: data.email,
      dni: data.dni,
      gender: data.gender,
      birthDate: data.birthDate || data.birth_date,
      university: data.university,
      fieldOfStudy: data.fieldOfStudy || data.career || data.field_of_study,
      academicLevel: data.academicLevel || data.academic_level || 'Pregrado (Bachiller/Título)',
      thesisSituation: data.thesisSituation || data.thesis_situation,
      topic: data.topic || `Asesoría para ${data.fullName || 'Prospecto'}`,
      department: data.department,
      province: data.province,
      address: data.address,
      assignedTo: data.assignedTo || data.assigned_to || 'Kevin',
      source: data.source || 'Manual',
      status: data.status || 'nuevo',
      additionalNotes: data.additionalNotes || data.additional_notes || null
    });
  }

  async getAllLeads() {
    return db('leads')
      .select('leads.*', 'projects.id as project_id', 'projects.status as project_status')
      .leftJoin('projects', 'projects.lead_id', 'leads.id')
      .orderBy('leads.created_at', 'desc');
  }

  async findByAdditionalNotesContaining(text) {
    return db('leads').where('additional_notes', 'like', `%${text}%`).first();
  }

  async getLeadById(id) {
    return db('leads')
      .select('leads.*', 'projects.id as project_id', 'projects.status as project_status')
      .leftJoin('projects', 'projects.lead_id', 'leads.id')
      .where('leads.id', id)
      .first();
  }

  async updateLeadStatus(id, status) {
    await db('leads').where({ id }).update({ status });
    return this.getLeadById(id);
  }

  async updateLead(id, data) {
    const updatePayload = {};

    if (data.fullName !== undefined || data.full_name !== undefined) {
      updatePayload.full_name = data.fullName !== undefined ? data.fullName : data.full_name;
    }
    if (data.phone !== undefined) updatePayload.phone = data.phone;
    if (data.email !== undefined) updatePayload.email = data.email;
    if (data.dni !== undefined) updatePayload.dni = data.dni;
    if (data.gender !== undefined) updatePayload.gender = data.gender;
    if (data.birthDate !== undefined || data.birth_date !== undefined) {
      updatePayload.birth_date = data.birthDate !== undefined ? data.birthDate : data.birth_date;
    }
    if (data.university !== undefined) updatePayload.university = data.university;
    if (data.fieldOfStudy !== undefined || data.field_of_study !== undefined || data.career !== undefined) {
      updatePayload.field_of_study = data.fieldOfStudy || data.field_of_study || data.career;
    }
    if (data.academicLevel !== undefined || data.academic_level !== undefined) {
      updatePayload.academic_level = data.academicLevel || data.academic_level;
    }
    if (data.thesisSituation !== undefined || data.thesis_situation !== undefined) {
      updatePayload.thesis_situation = data.thesisSituation || data.thesis_situation;
    }
    if (data.topic !== undefined) updatePayload.topic = data.topic;
    if (data.department !== undefined) updatePayload.department = data.department;
    if (data.province !== undefined) updatePayload.province = data.province;
    if (data.address !== undefined) updatePayload.address = data.address;
    if (data.assignedTo !== undefined || data.assigned_to !== undefined) {
      updatePayload.assigned_to = data.assignedTo || data.assigned_to;
    }
    if (data.source !== undefined) updatePayload.source = data.source;
    if (data.status !== undefined) updatePayload.status = data.status;
    if (data.additionalNotes !== undefined || data.additional_notes !== undefined) {
      updatePayload.additional_notes = data.additionalNotes !== undefined ? data.additionalNotes : data.additional_notes;
    }

    if (Object.keys(updatePayload).length > 0) {
      await db('leads').where({ id }).update(updatePayload);
    }
    return this.getLeadById(id);
  }

  async deleteLead(id) {
    return db('leads').where({ id }).del();
  }
}
