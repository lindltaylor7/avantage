import { db } from '../db/connection.js';

/**
 * Campañas de marketing digital: definición manual (nombre, presupuesto,
 * fechas) + cálculo en vivo del rendimiento cruzando la atribución de
 * WhatsApp Click-to-WhatsApp con el funnel real (leads, sesiones del bot,
 * reuniones agendadas y cotizaciones).
 */

const AD_SOURCE_TYPES = new Set(['ad', 'post']);

function parseReferral(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function platformFromReferral(ref) {
  const url = (ref?.source_url || '').toLowerCase();
  if (url.includes('instagram')) return 'instagram';
  if (url.includes('facebook') || url.includes('fb.me') || url.includes('fb.com')) return 'facebook';
  return 'meta';
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return diff >= 0 ? diff : null;
}

function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && !Number.isNaN(v)).sort((x, y) => x - y);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

const WON_STATUSES = new Set(['ganado']);
const LOST_STATUSES = new Set(['perdido', 'descartado']);
const APPOINTMENT_STATUSES = new Set(['cita_agendada']);

export class CampaignService {
  // ─────────────────────────── CRUD de campañas ───────────────────────────
  async listCampaigns() {
    const campaigns = await db('campaigns').orderBy([{ column: 'status', order: 'asc' }, { column: 'created_at', order: 'desc' }]);
    const ads = await db('campaign_ads').orderBy('created_at', 'asc');
    const adsByCampaign = new Map();
    for (const ad of ads) {
      if (!adsByCampaign.has(ad.campaign_id)) adsByCampaign.set(ad.campaign_id, []);
      adsByCampaign.get(ad.campaign_id).push(ad);
    }
    return campaigns.map((c) => ({ ...c, ads: adsByCampaign.get(c.id) || [] }));
  }

  async getCampaign(id) {
    const campaign = await db('campaigns').where({ id }).first();
    if (!campaign) return null;
    campaign.ads = await db('campaign_ads').where({ campaign_id: id }).orderBy('created_at', 'asc');
    return campaign;
  }

  async createCampaign(data) {
    const [id] = await db('campaigns').insert(this.#sanitize(data));
    return this.getCampaign(id);
  }

  async updateCampaign(id, data) {
    await db('campaigns').where({ id }).update({ ...this.#sanitize(data), updated_at: db.fn.now() });
    return this.getCampaign(id);
  }

  async deleteCampaign(id) {
    return db('campaigns').where({ id }).del();
  }

  #sanitize(data) {
    const out = {};
    if (data.name !== undefined) out.name = String(data.name).trim().slice(0, 200);
    if (data.platform !== undefined) out.platform = String(data.platform || 'meta').trim().slice(0, 30);
    if (data.objective !== undefined) out.objective = data.objective ? String(data.objective).trim().slice(0, 120) : null;
    if (data.status !== undefined) out.status = ['activa', 'pausada', 'finalizada'].includes(data.status) ? data.status : 'activa';
    if (data.budgetTotal !== undefined) out.budget_total = Number(data.budgetTotal) || 0;
    if (data.spendToDate !== undefined) out.spend_to_date = data.spendToDate === '' || data.spendToDate === null ? null : Number(data.spendToDate);
    if (data.currency !== undefined) out.currency = String(data.currency || 'PEN').trim().slice(0, 10);
    if (data.startDate !== undefined) out.start_date = data.startDate || null;
    if (data.endDate !== undefined) out.end_date = data.endDate || null;
    if (data.notes !== undefined) out.notes = data.notes ? String(data.notes).trim() : null;
    return out;
  }

  // ─────────────────────── Mapeo de anuncios → campaña ─────────────────────
  async addAdMapping(campaignId, { adSourceId, adLabel }) {
    const clean = String(adSourceId || '').trim();
    if (!clean) throw new Error('Falta el ID del anuncio.');
    await db('campaign_ads')
      .insert({ campaign_id: campaignId, ad_source_id: clean, ad_label: adLabel ? String(adLabel).slice(0, 300) : null })
      .onConflict('ad_source_id')
      .merge({ campaign_id: campaignId, ad_label: adLabel ? String(adLabel).slice(0, 300) : null });
    return this.getCampaign(campaignId);
  }

  async removeAdMapping(mappingId) {
    return db('campaign_ads').where({ id: mappingId }).del();
  }

  // ──────────────────────────── Atribución base ───────────────────────────
  /**
   * Primer mensaje entrante con `referral` de anuncio por contacto. Es el
   * "clic en el anuncio → escribió por WhatsApp" y define a qué anuncio se
   * atribuye ese contacto.
   */
  async #buildAttribution({ from, to } = {}) {
    const rows = await db('whatsapp_messages')
      .whereNotNull('referral')
      .andWhere('direction', 'inbound')
      .orderBy('received_at', 'asc')
      .select('wa_id', 'referral', 'received_at', 'contact_name');

    const firstByContact = new Map();
    for (const row of rows) {
      if (firstByContact.has(row.wa_id)) continue;
      const ref = parseReferral(row.referral);
      const sourceId = ref?.source_id ? String(ref.source_id) : null;
      const sourceType = ref?.source_type || (sourceId ? 'ad' : null);
      if (!sourceId || !AD_SOURCE_TYPES.has(sourceType)) continue;
      firstByContact.set(row.wa_id, {
        waId: row.wa_id,
        contactName: row.contact_name || null,
        sourceId,
        headline: ref.headline || ref.body || null,
        sourceUrl: ref.source_url || null,
        platform: platformFromReferral(ref),
        firstMessageAt: row.received_at
      });
    }

    let list = [...firstByContact.values()];
    if (from) list = list.filter((a) => new Date(a.firstMessageAt) >= new Date(from));
    if (to) list = list.filter((a) => new Date(a.firstMessageAt) <= new Date(to));
    return list;
  }

  /**
   * Enriquece cada contacto atribuido con su recorrido real en el funnel.
   */
  async #enrichContacts(attribution) {
    const waIds = attribution.map((a) => a.waId);
    if (!waIds.length) return [];

    const [outboundRows, leads, sessions, meetings] = await Promise.all([
      db('whatsapp_messages').whereIn('wa_id', waIds).andWhere('direction', 'outbound')
        .groupBy('wa_id').select('wa_id').min('received_at as firstOut'),
      db('leads').whereIn('phone', waIds)
        .select('id', 'phone', 'status', 'created_at', 'full_name', 'topic', 'overall_viability_score'),
      db('whatsapp_bot_sessions').whereIn('wa_id', waIds)
        .select('wa_id', 'status', 'started_at', 'updated_at'),
      db('scheduled_meetings').whereIn('wa_id', waIds)
        .select('wa_id', 'lead_id', 'start_time', 'created_at')
    ]);

    const firstOutByWa = new Map(outboundRows.map((r) => [r.wa_id, r.firstOut]));
    const leadByWa = new Map(leads.map((l) => [l.phone, l]));
    const sessionByWa = new Map(sessions.map((s) => [s.wa_id, s]));
    const meetingByWa = new Map();
    for (const m of meetings) {
      const prev = meetingByWa.get(m.wa_id);
      if (!prev || new Date(m.created_at) < new Date(prev.created_at)) meetingByWa.set(m.wa_id, m);
    }

    const wonLeadIds = leads.filter((l) => WON_STATUSES.has(l.status)).map((l) => l.id);
    const quoteByLead = new Map();
    if (wonLeadIds.length) {
      const quotes = await db('quotes').whereIn('lead_id', wonLeadIds).orderBy('created_at', 'desc')
        .select('lead_id', 'amount', 'currency');
      for (const q of quotes) {
        if (!quoteByLead.has(q.lead_id)) quoteByLead.set(q.lead_id, q); // la más reciente
      }
    }

    return attribution.map((a) => {
      const lead = leadByWa.get(a.waId) || null;
      const session = sessionByWa.get(a.waId) || null;
      const meeting = meetingByWa.get(a.waId) || null;
      const firstOut = firstOutByWa.get(a.waId) || null;

      const responded = !!firstOut;
      const qualified = (session && session.status === 'completed')
        || (lead && lead.overall_viability_score != null)
        || (lead && !['nuevo'].includes(lead.status));
      const hasAppointment = !!meeting || (lead && APPOINTMENT_STATUSES.has(lead.status));
      const won = lead && WON_STATUSES.has(lead.status);
      const lost = lead && LOST_STATUSES.has(lead.status);

      const quote = won && lead ? quoteByLead.get(lead.id) : null;

      let currentStage = 'conversacion';
      if (responded) currentStage = 'respondido';
      if (qualified) currentStage = 'calificado';
      if (hasAppointment) currentStage = 'cita_agendada';
      if (won) currentStage = 'ganado';
      else if (lost) currentStage = 'perdido';

      return {
        ...a,
        lead,
        leadStatus: lead?.status || null,
        viability: lead?.overall_viability_score ?? null,
        firstResponseMinutes: minutesBetween(a.firstMessageAt, firstOut),
        qualifiedAt: session && session.status === 'completed' ? session.updated_at : null,
        meetingAt: meeting?.start_time || null,
        meetingBookedAt: meeting?.created_at || null,
        quotedValue: quote ? Number(quote.amount) : null,
        quotedCurrency: quote?.currency || null,
        responded,
        qualified: !!qualified,
        hasAppointment: !!hasAppointment,
        won: !!won,
        lost: !!lost,
        currentStage
      };
    });
  }

  #summariseGroup(contacts, campaign) {
    const conversations = contacts.length;
    const responded = contacts.filter((c) => c.responded).length;
    const qualified = contacts.filter((c) => c.qualified).length;
    const appointments = contacts.filter((c) => c.hasAppointment).length;
    const won = contacts.filter((c) => c.won).length;
    const lost = contacts.filter((c) => c.lost).length;

    const spend = campaign
      ? (campaign.spend_to_date != null ? Number(campaign.spend_to_date) : Number(campaign.budget_total) || 0)
      : 0;
    const quotedValue = contacts.reduce((sum, c) => sum + (c.quotedValue || 0), 0);

    const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
    const perStage = (den) => (den > 0 && spend > 0 ? Math.round((spend / den) * 100) / 100 : null);

    return {
      funnel: [
        { key: 'conversacion', label: 'Conversaciones atribuidas', count: conversations },
        { key: 'respondido', label: 'Avan respondió', count: responded },
        { key: 'calificado', label: 'Calificado (informe de viabilidad)', count: qualified },
        { key: 'cita_agendada', label: 'Cita agendada', count: appointments },
        { key: 'ganado', label: 'Ganado / matriculado', count: won }
      ],
      metrics: {
        conversations,
        responded,
        qualified,
        appointments,
        won,
        lost,
        qualificationRate: rate(qualified, conversations),
        conversationToAppointmentRate: rate(appointments, conversations),
        appointmentToWonRate: rate(won, appointments),
        avgViability: (() => {
          const vals = contacts.map((c) => c.viability).filter((v) => v != null);
          return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
        })(),
        medianFirstResponseMin: (() => {
          const m = median(contacts.map((c) => c.firstResponseMinutes));
          return m == null ? null : Math.round(m * 10) / 10;
        })(),
        spend,
        quotedValue,
        roas: spend > 0 && quotedValue > 0 ? Math.round((quotedValue / spend) * 100) / 100 : null,
        costPerConversation: perStage(conversations),
        costPerQualified: perStage(qualified),
        costPerAppointment: perStage(appointments),
        costPerWon: perStage(won)
      },
      sampleContacts: contacts
        .slice()
        .sort((x, y) => new Date(y.firstMessageAt) - new Date(x.firstMessageAt))
        .slice(0, 12)
        .map((c) => ({
          name: c.lead?.full_name || c.contactName || c.waId,
          topic: c.lead?.topic || null,
          currentStage: c.currentStage,
          viability: c.viability,
          adHeadline: c.headline,
          timeline: this.#buildTimeline(c)
        }))
    };
  }

  #buildTimeline(c) {
    const steps = [];
    const platformLabel = c.platform === 'instagram' ? 'Instagram' : c.platform === 'facebook' ? 'Facebook' : 'Meta';
    steps.push({ stage: `Escribió por WhatsApp desde el anuncio (${platformLabel})`, at: c.firstMessageAt });
    if (c.firstResponseMinutes != null && c.responded) {
      steps.push({ stage: 'Avan respondió', at: null, note: `${Math.round(c.firstResponseMinutes)} min de espera` });
    }
    if (c.qualifiedAt) steps.push({ stage: 'Calificado por Avan (informe de viabilidad)', at: c.qualifiedAt });
    else if (c.qualified) steps.push({ stage: 'Calificado por Avan', at: null });
    if (c.meetingBookedAt) {
      steps.push({ stage: 'Cita agendada', at: c.meetingBookedAt, note: c.meetingAt ? `para ${new Date(c.meetingAt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : null });
    }
    const finalLabel = {
      ganado: 'Ganado / matriculado',
      perdido: 'Perdido / descartado',
      cita_agendada: 'En espera de la reunión',
      calificado: 'Calificado, sin cita aún',
      respondido: 'En conversación con Avan',
      conversacion: 'Sin respuesta todavía'
    }[c.currentStage];
    steps.push({ stage: `Estado actual: ${finalLabel}`, at: null, isFinal: true });
    return steps;
  }

  // ──────────────────────────── Rendimiento global ────────────────────────
  async getPerformance({ from = null, to = null } = {}) {
    const [campaigns, attribution] = await Promise.all([
      this.listCampaigns(),
      this.#buildAttribution({ from, to })
    ]);
    const contacts = await this.#enrichContacts(attribution);

    // source_id -> campaña
    const campaignByAd = new Map();
    for (const campaign of campaigns) {
      for (const ad of campaign.ads) campaignByAd.set(ad.ad_source_id, campaign);
    }

    const contactsByCampaign = new Map();
    const unclassified = [];
    for (const c of contacts) {
      const campaign = campaignByAd.get(c.sourceId);
      if (!campaign) {
        unclassified.push(c);
        continue;
      }
      if (!contactsByCampaign.has(campaign.id)) contactsByCampaign.set(campaign.id, []);
      contactsByCampaign.get(campaign.id).push(c);
    }

    const campaignReports = campaigns.map((campaign) => {
      const group = contactsByCampaign.get(campaign.id) || [];
      const summary = this.#summariseGroup(group, campaign);
      return {
        id: campaign.id,
        name: campaign.name,
        platform: campaign.platform,
        objective: campaign.objective,
        status: campaign.status,
        budgetTotal: Number(campaign.budget_total) || 0,
        spendToDate: campaign.spend_to_date != null ? Number(campaign.spend_to_date) : null,
        currency: campaign.currency,
        startDate: campaign.start_date,
        endDate: campaign.end_date,
        notes: campaign.notes,
        ads: campaign.ads.map((a) => ({ id: a.id, sourceId: a.ad_source_id, label: a.ad_label })),
        ...summary
      };
    });

    // Anuncios detectados en los referrals que aún no están mapeados
    const unclassifiedByAd = new Map();
    for (const c of unclassified) {
      const entry = unclassifiedByAd.get(c.sourceId) || {
        sourceId: c.sourceId,
        headline: c.headline,
        sourceUrl: c.sourceUrl,
        platform: c.platform,
        conversations: 0,
        qualified: 0,
        appointments: 0,
        won: 0,
        firstSeen: c.firstMessageAt,
        lastSeen: c.firstMessageAt
      };
      entry.conversations += 1;
      if (c.qualified) entry.qualified += 1;
      if (c.hasAppointment) entry.appointments += 1;
      if (c.won) entry.won += 1;
      if (new Date(c.firstMessageAt) < new Date(entry.firstSeen)) entry.firstSeen = c.firstMessageAt;
      if (new Date(c.firstMessageAt) > new Date(entry.lastSeen)) entry.lastSeen = c.firstMessageAt;
      if (!entry.headline && c.headline) entry.headline = c.headline;
      unclassifiedByAd.set(c.sourceId, entry);
    }

    const totalsClassified = this.#summariseGroup(
      contacts.filter((c) => campaignByAd.has(c.sourceId)),
      null
    ).metrics;
    const totalSpend = campaigns.reduce(
      (sum, c) => sum + (c.spend_to_date != null ? Number(c.spend_to_date) : Number(c.budget_total) || 0),
      0
    );
    const totalQuoted = contacts.reduce((sum, c) => sum + (c.quotedValue || 0), 0);

    return {
      generatedAt: new Date().toISOString(),
      range: { from, to },
      kpis: {
        activeCampaigns: campaigns.filter((c) => c.status === 'activa').length,
        totalConversations: contacts.length,
        classifiedConversations: totalsClassified.conversations,
        unclassifiedConversations: unclassified.length,
        qualified: contacts.filter((c) => c.qualified).length,
        appointments: contacts.filter((c) => c.hasAppointment).length,
        won: contacts.filter((c) => c.won).length,
        totalSpend,
        totalQuotedValue: totalQuoted,
        roas: totalSpend > 0 && totalQuoted > 0 ? Math.round((totalQuoted / totalSpend) * 100) / 100 : null,
        costPerConversation: totalSpend > 0 && totalsClassified.conversations > 0
          ? Math.round((totalSpend / totalsClassified.conversations) * 100) / 100 : null,
        costPerAppointment: totalSpend > 0 && totalsClassified.appointments > 0
          ? Math.round((totalSpend / totalsClassified.appointments) * 100) / 100 : null,
        costPerWon: totalSpend > 0 && totalsClassified.won > 0
          ? Math.round((totalSpend / totalsClassified.won) * 100) / 100 : null
      },
      campaigns: campaignReports,
      unclassifiedAds: [...unclassifiedByAd.values()].sort((a, b) => b.conversations - a.conversations)
    };
  }
}
