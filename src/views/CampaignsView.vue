<template>
  <main class="container-fluid campaigns-page">
    <header class="page-header">
      <div class="page-header-titles">
        <span class="page-eyebrow">Marketing digital · Datos en vivo</span>
        <h2 class="section-heading"><span class="heading-icon">📣</span> Campañas</h2>
        <p class="section-subheading campaigns-subheading">
          Rendimiento real de las campañas de <strong>Click-to-WhatsApp</strong>: cada contacto que escribe tras tocar
          un anuncio queda atribuido por el <code>referral</code> de Meta y se sigue por el funnel real hasta la cita o
          el cierre. La inversión se registra a mano por campaña.
        </p>
      </div>
      <div class="campaigns-toolbar">
        <div class="range-tabs">
          <button
            v-for="opt in RANGE_OPTIONS"
            :key="opt.value"
            type="button"
            class="range-tab"
            :class="{ active: rangeDays === opt.value }"
            @click="setRange(opt.value)"
          >{{ opt.label }}</button>
        </div>
        <button
          type="button"
          class="btn-secondary sync-btn"
          :disabled="syncing || (metaStatus && !metaStatus.configured)"
          :title="metaStatus && !metaStatus.configured ? 'Configura las credenciales de Meta Ads primero' : ''"
          @click="syncMeta"
        >{{ syncing ? '↻ Sincronizando…' : '↻ Sincronizar con Meta' }}</button>
        <button type="button" class="btn-primary new-campaign-btn" @click="openCreateModal">＋ Nueva campaña</button>
      </div>
    </header>

    <p v-if="metaStatus && !metaStatus.configured" class="state-banner state-hint">
      <template v-if="metaStatus.reason === 'no_token'">
        🔌 No hay ningún token de Meta configurado. Define <code>META_ADS_ACCESS_TOKEN</code> (o
        <code>META_PAGE_ACCESS_TOKEN</code>) en el <code>.env</code>.
      </template>
      <template v-else-if="metaStatus.reason === 'no_ad_account'">
        🔌 El token de Meta no tiene acceso a ninguna cuenta publicitaria. Agrégale el permiso
        <code>ads_read</code> y asigna el usuario/System User a la cuenta de Meta Ads, o define
        <code>META_ADS_ACCOUNT_ID</code> en el <code>.env</code>.
      </template>
      <template v-else>
        🔌 No se pudo conectar con Meta Ads: {{ metaStatus.error || 'error desconocido' }}.
        Verifica el permiso <code>ads_read</code> del token o define <code>META_ADS_ACCOUNT_ID</code> en el <code>.env</code>.
      </template>
    </p>
    <p v-else-if="metaStatus && metaStatus.configured" class="state-banner state-ok meta-connected">
      🟢 Conectado a Meta Ads<template v-if="metaStatus.accountName"> · {{ metaStatus.accountName }}</template>
      <span class="data-mono"> ({{ metaStatus.accountId }})</span>
      <template v-if="metaStatus.accountSource === 'auto' && metaStatus.accountOptions > 1">
        · detectadas {{ metaStatus.accountOptions }} cuentas, usando la primera activa; fija una con <code>META_ADS_ACCOUNT_ID</code>
      </template>
    </p>
    <p v-if="syncMsg" class="state-banner" :class="syncError ? 'state-error' : 'state-ok'">{{ syncMsg }}</p>
    <p v-if="errorMsg" class="state-banner state-error">⚠️ {{ errorMsg }}</p>
    <p v-else-if="loading && !report" class="state-banner">Cargando rendimiento de campañas…</p>

    <template v-if="report">
      <!-- KPIs -->
      <section class="kpi-row">
        <div class="kpi-tile">
          <span class="kpi-label">Campañas activas</span>
          <span class="kpi-value">{{ report.kpis.activeCampaigns }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Conversaciones atribuidas</span>
          <span class="kpi-value">{{ num(report.kpis.totalConversations) }}</span>
          <span class="kpi-sub" v-if="report.kpis.unclassifiedConversations">
            {{ num(report.kpis.unclassifiedConversations) }} sin clasificar
          </span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Calificados</span>
          <span class="kpi-value">{{ num(report.kpis.qualified) }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Citas agendadas</span>
          <span class="kpi-value">{{ num(report.kpis.appointments) }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Ganados</span>
          <span class="kpi-value">{{ num(report.kpis.won) }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Inversión registrada</span>
          <span class="kpi-value">{{ money(report.kpis.totalSpend) }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Costo por cita</span>
          <span class="kpi-value">{{ report.kpis.costPerAppointment != null ? money(report.kpis.costPerAppointment) : '—' }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Costo por ganado</span>
          <span class="kpi-value">{{ report.kpis.costPerWon != null ? money(report.kpis.costPerWon) : '—' }}</span>
        </div>
        <div class="kpi-tile">
          <span class="kpi-label">Valor cotizado (ganados)</span>
          <span class="kpi-value">{{ money(report.kpis.totalQuotedValue) }}</span>
          <span class="kpi-sub" v-if="report.kpis.roas != null">ROAS {{ report.kpis.roas }}×</span>
        </div>
        <template v-if="report.kpis.metaImpressions != null">
          <div class="kpi-tile kpi-meta">
            <span class="kpi-label">Impresiones (Meta)</span>
            <span class="kpi-value">{{ num(report.kpis.metaImpressions) }}</span>
            <span class="kpi-sub" v-if="report.kpis.metaReach">Alcance {{ num(report.kpis.metaReach) }}</span>
          </div>
          <div class="kpi-tile kpi-meta">
            <span class="kpi-label">Clics (Meta)</span>
            <span class="kpi-value">{{ num(report.kpis.metaClicks) }}</span>
            <span class="kpi-sub" v-if="report.kpis.metaCtr != null">CTR {{ report.kpis.metaCtr }}%</span>
          </div>
          <div class="kpi-tile kpi-meta">
            <span class="kpi-label">Clics en el enlace (Meta)</span>
            <span class="kpi-value">{{ num(report.kpis.metaLinkClicks) }}</span>
            <span class="kpi-sub" v-if="report.kpis.metaLinkCtr != null">CTR del enlace {{ report.kpis.metaLinkCtr }}%</span>
          </div>
          <div class="kpi-tile kpi-meta" v-if="report.kpis.metaLandingPageViews">
            <span class="kpi-label">Visitas a la página (Meta)</span>
            <span class="kpi-value">{{ num(report.kpis.metaLandingPageViews) }}</span>
          </div>
          <div class="kpi-tile kpi-meta">
            <span class="kpi-label">Conversaciones (Meta)</span>
            <span class="kpi-value">{{ num(report.kpis.metaMessagingStarted) }}</span>
          </div>
        </template>
      </section>

      <!-- Campañas -->
      <section class="campaigns-table-section">
        <p v-if="!report.campaigns.length" class="state-banner">
          Aún no has creado ninguna campaña. Usa <strong>＋ Nueva campaña</strong> o clasifica un anuncio detectado abajo.
        </p>

        <template v-else>
          <div class="table-toolbar">
            <div class="search-box">
              <span class="search-icon" aria-hidden="true">🔍</span>
              <input v-model="searchQuery" type="text" class="search-input" placeholder="Buscar campaña por nombre..." />
              <button v-if="searchQuery" type="button" class="search-clear" title="Limpiar búsqueda" @click="searchQuery = ''">✕</button>
            </div>
            <select v-model="platformFilter" class="filter-select">
              <option v-for="opt in PLATFORM_FILTERS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <select v-model="statusFilter" class="filter-select">
              <option v-for="opt in STATUS_FILTERS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <span class="table-total">Total {{ filteredCampaigns.length }} {{ filteredCampaigns.length === 1 ? 'campaña' : 'campañas' }}</span>
          </div>

          <div v-if="filteredCampaigns.length" class="data-table-wrapper">
            <table class="data-table campaigns-table">
              <thead>
                <tr>
                  <th class="col-campaign">Campaña</th>
                  <th>Estado</th>
                  <th>Fechas</th>
                  <th>Inversión</th>
                  <th>Conversaciones</th>
                  <th>Citas</th>
                  <th>Ganados</th>
                  <th>Costo / cita</th>
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="campaign in pagedCampaigns" :key="campaign.id">
                  <tr class="campaign-row" @click="toggleExpand(campaign.id)">
                    <td class="col-campaign">
                      <div class="campaign-identity">
                        <img
                          v-if="campaignImageUrls[campaign.id]"
                          :src="campaignImageUrls[campaign.id]"
                          alt=""
                          class="campaign-thumb"
                        />
                        <span v-else class="campaign-thumb campaign-thumb-fallback">
                          <BrandIcon :name="brandIconName(campaign.platform)" :size="20" />
                        </span>
                        <div class="campaign-identity-text">
                          <strong class="campaign-name">
                            {{ campaign.name }}
                            <span v-if="campaign.source === 'meta'" class="meta-badge">Meta Ads</span>
                          </strong>
                          <span class="campaign-objective">{{ campaign.objective || 'Sin objetivo registrado' }}</span>
                        </div>
                      </div>
                    </td>
                    <td><span class="pill" :class="statusPillClass(campaign.status)">{{ statusLabel(campaign.status) }}</span></td>
                    <td class="data-mono">{{ dateRangeLabel(campaign) }}</td>
                    <td class="data-mono">{{ money(campaign.metrics.spend) }}</td>
                    <td class="data-mono">{{ num(campaign.metrics.conversations) }}</td>
                    <td class="data-mono">{{ num(campaign.metrics.appointments) }}</td>
                    <td class="data-mono">{{ num(campaign.metrics.won) }}</td>
                    <td class="data-mono">{{ campaign.metrics.costPerAppointment != null ? money(campaign.metrics.costPerAppointment) : '—' }}</td>
                    <td class="col-actions" @click.stop>
                      <button type="button" class="icon-btn" title="Editar campaña" @click="openEditModal(campaign)">✏️</button>
                      <button
                        v-if="campaign.source !== 'meta'"
                        type="button"
                        class="icon-btn"
                        title="Eliminar campaña"
                        @click="removeCampaign(campaign)"
                      >🗑️</button>
                      <button
                        type="button"
                        class="icon-btn expand-btn"
                        :class="{ 'is-open': expandedId === campaign.id }"
                        :title="expandedId === campaign.id ? 'Ocultar detalle' : 'Ver detalle'"
                        @click="toggleExpand(campaign.id)"
                      >▾</button>
                    </td>
                  </tr>

                  <tr v-if="expandedId === campaign.id" class="campaign-detail-row">
                    <td colspan="9">
                      <div class="campaign-detail">
                        <span class="campaign-meta">
                          <template v-if="campaign.lastSyncedAt">Última sincronización: {{ formatDateTime(campaign.lastSyncedAt) }}</template>
                          <template v-else>Campaña manual, sin sincronizar con Meta</template>
                        </span>

                        <!-- Embudo real -->
                        <div class="funnel">
                          <div v-for="(stage, i) in campaign.funnel" :key="stage.key" class="funnel-row">
                            <span class="funnel-label">{{ stage.label }}</span>
                            <div class="funnel-bar-track">
                              <div
                                class="funnel-bar-fill"
                                :style="{ width: funnelBarWidth(campaign.funnel, stage) }"
                                :title="`${stage.label}: ${num(stage.count)}`"
                              ></div>
                              <span class="funnel-bar-value">{{ num(stage.count) }}</span>
                            </div>
                            <span v-if="i > 0" class="funnel-dropoff">{{ dropoffLabel(campaign.funnel[i - 1], stage) }}</span>
                            <span v-else class="funnel-dropoff funnel-dropoff-spacer"></span>
                          </div>
                        </div>

                        <!-- Métricas del Administrador de anuncios (Meta) -->
                        <div v-if="campaign.metrics.impressions != null" class="metrics-block">
                          <div class="metrics-block-head">
                            <h4 class="metrics-block-title">📊 Meta Ads</h4>
                            <span class="metrics-block-note">
                              Informe {{ reportWindowLabel(campaign.metrics) }}
                              <template v-if="campaign.metrics.attributionSetting">
                                · Configuración de atribución: {{ campaign.metrics.attributionSetting }}
                              </template>
                            </span>
                          </div>
                          <div class="metric-grid">
                            <div class="metric metric-meta">
                              <span class="metric-label">Resultados</span>
                              <span class="metric-value">{{ campaign.metrics.metaResults != null ? num(campaign.metrics.metaResults) : '—' }}</span>
                              <span v-if="campaign.metrics.metaResultIndicator" class="metric-sub">{{ campaign.metrics.metaResultIndicator }}</span>
                            </div>
                            <div class="metric metric-meta"><span class="metric-label">Coste por resultado</span><span class="metric-value">{{ campaign.metrics.metaCostPerResult != null ? money(campaign.metrics.metaCostPerResult) : '—' }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Importe gastado</span><span class="metric-value">{{ money(campaign.metrics.metaSpend ?? campaign.metrics.spend) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Alcance</span><span class="metric-value">{{ num(campaign.metrics.reach) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Frecuencia</span><span class="metric-value">{{ campaign.metrics.frequency != null ? campaign.metrics.frequency : '—' }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Impresiones</span><span class="metric-value">{{ num(campaign.metrics.impressions) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">CPM</span><span class="metric-value">{{ campaign.metrics.cpm != null ? money(campaign.metrics.cpm) : '—' }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Clics en el enlace</span><span class="metric-value">{{ num(campaign.metrics.linkClicks) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">CTR del enlace</span><span class="metric-value">{{ pct(campaign.metrics.linkCtr) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">CPC del enlace</span><span class="metric-value">{{ campaign.metrics.costPerLinkClick != null ? money(campaign.metrics.costPerLinkClick) : '—' }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Clics (todos)</span><span class="metric-value">{{ num(campaign.metrics.clicks) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">CTR (todos)</span><span class="metric-value">{{ pct(campaign.metrics.ctr) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">CPC (todos)</span><span class="metric-value">{{ campaign.metrics.cpc != null ? money(campaign.metrics.cpc) : '—' }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Visitas a la página de destino</span><span class="metric-value">{{ num(campaign.metrics.landingPageViews) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Coste por visita a la página</span><span class="metric-value">{{ campaign.metrics.costPerLandingPageView != null ? money(campaign.metrics.costPerLandingPageView) : '—' }}</span></div>
                            <div v-if="campaign.metrics.shopClicks" class="metric metric-meta"><span class="metric-label">Clics en la tienda</span><span class="metric-value">{{ num(campaign.metrics.shopClicks) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Conversaciones (Meta)</span><span class="metric-value">{{ num(campaign.metrics.metaMessagingStarted) }}</span></div>
                            <div class="metric metric-meta"><span class="metric-label">Costo/conv. (Meta)</span><span class="metric-value">{{ campaign.metrics.costPerLeadMeta != null ? money(campaign.metrics.costPerLeadMeta) : '—' }}</span></div>
                          </div>
                        </div>

                        <!-- Desglose por anuncio: mismas columnas que el informe
                             del Administrador de anuncios. Las tres clasificaciones
                             y la entrega sólo existen a este nivel. -->
                        <div v-if="campaign.metaAds && campaign.metaAds.length" class="metrics-block">
                          <div class="metrics-block-head">
                            <h4 class="metrics-block-title">🧾 Rendimiento por anuncio</h4>
                            <span class="metrics-block-note">
                              {{ campaign.metaAds.length }} {{ campaign.metaAds.length === 1 ? 'anuncio' : 'anuncios' }} con datos · desplázate en horizontal para ver todas las columnas
                            </span>
                          </div>
                          <div class="ads-insights-wrapper">
                            <table class="data-table ads-insights-table">
                              <thead>
                                <tr>
                                  <th class="col-ad-name">Nombre del anuncio</th>
                                  <th>Entrega</th>
                                  <th>Resultados</th>
                                  <th>Coste por resultado</th>
                                  <th>Alcance</th>
                                  <th>Frecuencia</th>
                                  <th>Presupuesto del conjunto</th>
                                  <th>Importe gastado</th>
                                  <th>Fin</th>
                                  <th>Calidad</th>
                                  <th>Interacción</th>
                                  <th>Conversión</th>
                                  <th>Impresiones</th>
                                  <th>CPM</th>
                                  <th>Clics en el enlace</th>
                                  <th>Clics en la tienda</th>
                                  <th>CPC del enlace</th>
                                  <th>CTR del enlace</th>
                                  <th>Clics (todos)</th>
                                  <th>CTR (todos)</th>
                                  <th>CPC (todos)</th>
                                  <th>Visitas a la página</th>
                                  <th>Coste por visita</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr v-for="ad in campaign.metaAds" :key="ad.adId">
                                  <td class="col-ad-name">
                                    <strong class="ad-row-name" :title="ad.adName">{{ ad.adName }}</strong>
                                    <span v-if="ad.adsetName" class="ad-row-sub">{{ ad.adsetName }}</span>
                                  </td>
                                  <td><span class="pill pill-xs" :class="deliveryPillClass(ad.delivery)">{{ deliveryLabel(ad.delivery) }}</span></td>
                                  <td class="data-mono">
                                    {{ ad.results != null ? num(ad.results) : '—' }}
                                    <span v-if="ad.resultIndicator" class="ad-row-sub">{{ ad.resultIndicator }}</span>
                                  </td>
                                  <td class="data-mono">{{ ad.costPerResult != null ? money(ad.costPerResult) : '—' }}</td>
                                  <td class="data-mono">{{ num(ad.reach) }}</td>
                                  <td class="data-mono">{{ ad.frequency != null ? ad.frequency : '—' }}</td>
                                  <td class="data-mono">
                                    {{ ad.adsetBudget != null ? money(ad.adsetBudget) : '—' }}
                                    <span v-if="ad.adsetBudgetType" class="ad-row-sub">{{ ad.adsetBudgetType === 'diario' ? 'Diario' : 'Total' }}</span>
                                  </td>
                                  <td class="data-mono">{{ money(ad.spend) }}</td>
                                  <td class="data-mono">{{ ad.endTime ? formatDate(ad.endTime) : 'Sin fecha' }}</td>
                                  <td><span class="pill pill-xs" :class="rankPillClass(ad.qualityRanking)" :title="rankTitle(ad.qualityRanking)">{{ rankLabel(ad.qualityRanking) }}</span></td>
                                  <td><span class="pill pill-xs" :class="rankPillClass(ad.engagementRanking)" :title="rankTitle(ad.engagementRanking)">{{ rankLabel(ad.engagementRanking) }}</span></td>
                                  <td><span class="pill pill-xs" :class="rankPillClass(ad.conversionRanking)" :title="rankTitle(ad.conversionRanking)">{{ rankLabel(ad.conversionRanking) }}</span></td>
                                  <td class="data-mono">{{ num(ad.impressions) }}</td>
                                  <td class="data-mono">{{ ad.cpm != null ? money(ad.cpm) : '—' }}</td>
                                  <td class="data-mono">{{ num(ad.linkClicks) }}</td>
                                  <td class="data-mono">{{ num(ad.shopClicks) }}</td>
                                  <td class="data-mono">{{ ad.costPerLinkClick != null ? money(ad.costPerLinkClick) : '—' }}</td>
                                  <td class="data-mono">{{ pct(ad.linkCtr) }}</td>
                                  <td class="data-mono">{{ num(ad.clicks) }}</td>
                                  <td class="data-mono">{{ pct(ad.ctr) }}</td>
                                  <td class="data-mono">{{ ad.cpc != null ? money(ad.cpc) : '—' }}</td>
                                  <td class="data-mono">{{ num(ad.landingPageViews) }}</td>
                                  <td class="data-mono">{{ ad.costPerLandingPageView != null ? money(ad.costPerLandingPageView) : '—' }}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <!-- Métricas del funnel propio (CRM) -->
                        <div class="metrics-block">
                          <div class="metrics-block-head">
                            <h4 class="metrics-block-title">🎯 Funnel del CRM</h4>
                          </div>
                          <div class="metric-grid">
                            <div class="metric"><span class="metric-label">Tasa de calificación</span><span class="metric-value">{{ campaign.metrics.qualificationRate }}%</span></div>
                            <div class="metric"><span class="metric-label">Conversación → cita</span><span class="metric-value">{{ campaign.metrics.conversationToAppointmentRate }}%</span></div>
                            <div class="metric"><span class="metric-label">Cita → ganado</span><span class="metric-value">{{ campaign.metrics.appointmentToWonRate }}%</span></div>
                            <div class="metric"><span class="metric-label">Viabilidad prom.</span><span class="metric-value">{{ campaign.metrics.avgViability != null ? campaign.metrics.avgViability + '%' : '—' }}</span></div>
                            <div class="metric"><span class="metric-label">1ª respuesta (mediana)</span><span class="metric-value">{{ responseLabel(campaign.metrics.medianFirstResponseMin) }}</span></div>
                            <div class="metric"><span class="metric-label">Costo / conversación</span><span class="metric-value">{{ campaign.metrics.costPerConversation != null ? money(campaign.metrics.costPerConversation) : '—' }}</span></div>
                            <div class="metric"><span class="metric-label">Costo / ganado</span><span class="metric-value">{{ campaign.metrics.costPerWon != null ? money(campaign.metrics.costPerWon) : '—' }}</span></div>
                            <div class="metric"><span class="metric-label">Valor cotizado</span><span class="metric-value">{{ money(campaign.metrics.quotedValue) }}</span></div>
                            <div class="metric"><span class="metric-label">ROAS</span><span class="metric-value">{{ campaign.metrics.roas != null ? campaign.metrics.roas + '×' : '—' }}</span></div>
                          </div>
                        </div>

                        <!-- Anuncios mapeados -->
                        <div class="ad-chips">
                          <span class="ad-chips-label">Anuncios:</span>
                          <span v-for="ad in campaign.ads" :key="ad.id" class="ad-chip">
                            {{ ad.label || ad.sourceId }}
                            <button type="button" class="ad-chip-x" title="Quitar anuncio" @click="detachAd(ad.id)">✕</button>
                          </span>
                          <span v-if="!campaign.ads.length" class="ad-chips-empty">sin anuncios asociados</span>
                        </div>

                        <button type="button" class="btn-secondary campaign-trace-btn" @click="toggleTrace(campaign.id)">
                          {{ openTraceId === campaign.id ? '▲ Ocultar trazabilidad' : '🔍 Ver trazabilidad de leads' }}
                        </button>

                        <div v-if="openTraceId === campaign.id" class="trace-panel">
                          <p v-if="!campaign.sampleContacts.length" class="trace-hint">
                            Todavía no hay contactos atribuidos a esta campaña en el rango seleccionado.
                          </p>
                          <template v-else>
                            <p class="trace-hint">
                              Recorrido real de {{ campaign.sampleContacts.length }} contacto(s) de esta campaña, desde el anuncio hasta su etapa actual.
                            </p>
                            <div class="trace-leads">
                              <div v-for="(lead, li) in campaign.sampleContacts" :key="li" class="trace-lead">
                                <div class="trace-lead-header">
                                  <strong class="trace-lead-name">{{ lead.name }}</strong>
                                  <span v-if="lead.topic" class="trace-lead-topic">{{ lead.topic }}</span>
                                  <span class="pill" :class="stagePillClass(lead.currentStage)">{{ stageLabel(lead.currentStage) }}</span>
                                  <span v-if="lead.viability != null" class="pill pill-neutral">Viab. {{ lead.viability }}%</span>
                                </div>
                                <ol class="trace-timeline">
                                  <li
                                    v-for="(step, idx) in lead.timeline"
                                    :key="idx"
                                    class="trace-step"
                                    :class="{ 'is-last': idx === lead.timeline.length - 1 }"
                                  >
                                    <span class="trace-step-dot" :class="stepDotClass(lead, step, idx)"></span>
                                    <span class="trace-step-body">
                                      <span class="trace-step-label">{{ step.stage }}</span>
                                      <span class="trace-step-time data-mono">
                                        <template v-if="step.at">{{ formatDateTime(step.at) }}</template>
                                        <template v-else-if="step.note">{{ step.note }}</template>
                                      </span>
                                    </span>
                                  </li>
                                </ol>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div v-else class="empty-state">
            <span class="empty-state-icon" aria-hidden="true">🔍</span>
            <p class="empty-state-title">Sin resultados</p>
            <p class="empty-state-text">Ninguna campaña coincide con los filtros aplicados.</p>
          </div>

          <div v-if="filteredCampaigns.length" class="table-pagination">
            <button type="button" class="page-btn" :disabled="currentPage === 1" @click="currentPage--">‹</button>
            <span class="page-indicator">Página {{ currentPage }} de {{ totalPages }}</span>
            <button type="button" class="page-btn" :disabled="currentPage === totalPages" @click="currentPage++">›</button>
            <select v-model.number="pageSize" class="page-size-select">
              <option :value="10">10 / pág.</option>
              <option :value="25">25 / pág.</option>
              <option :value="50">50 / pág.</option>
            </select>
          </div>
        </template>
      </section>

      <!-- Anuncios sin clasificar -->
      <section v-if="report.unclassifiedAds.length" class="unclassified-section">
        <h3 class="unclassified-heading">🧩 Anuncios detectados sin clasificar</h3>
        <p class="unclassified-hint">
          Meta reportó tráfico de estos anuncios pero aún no los has asociado a ninguna campaña. Sus leads no cuentan
          para el costo de ninguna campaña hasta que los asignes.
        </p>
        <div class="unclassified-list">
          <div v-for="ad in report.unclassifiedAds" :key="ad.sourceId" class="unclassified-card">
            <div class="unclassified-main">
              <BrandIcon :name="brandIconName(ad.platform)" :size="20" />
              <div>
                <strong class="unclassified-title">{{ ad.headline || 'Anuncio ' + ad.sourceId }}</strong>
                <span class="unclassified-id data-mono">ID {{ ad.sourceId }}</span>
              </div>
            </div>
            <div class="unclassified-stats">
              <span>{{ num(ad.conversations) }} conv.</span>
              <span>{{ num(ad.qualified) }} calif.</span>
              <span>{{ num(ad.appointments) }} citas</span>
              <span>{{ num(ad.won) }} ganados</span>
            </div>
            <div class="unclassified-actions">
              <select v-model="assignSelection[ad.sourceId]" class="assign-select">
                <option value="">Asignar a campaña…</option>
                <option v-for="c in report.campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <button
                type="button"
                class="btn-secondary btn-mini"
                :disabled="!assignSelection[ad.sourceId]"
                @click="assignAd(ad)"
              >Asignar</button>
              <button type="button" class="btn-secondary btn-mini" @click="openCreateModal(ad)">Crear campaña</button>
            </div>
          </div>
        </div>
      </section>

      <p class="generated-note">
        Actualizado {{ formatDateTime(report.generatedAt) }} · rango:
        {{ report.range.from ? 'desde ' + formatDate(report.range.from) : 'todo el histórico' }}
      </p>
    </template>

    <!-- Modal de campaña -->
    <div v-if="showModal" class="cmp-modal-overlay" @click.self="closeModal">
      <div class="cmp-modal">
        <div class="cmp-modal-head">
          <h3>{{ editingId ? 'Editar campaña' : 'Nueva campaña' }}</h3>
          <button type="button" class="icon-btn" @click="closeModal">✕</button>
        </div>
        <form class="cmp-modal-body" @submit.prevent="saveCampaign">
          <label class="fld">
            <span>Nombre *</span>
            <input v-model="form.name" type="text" required placeholder="Ej: Ingeniería Civil — Lima Norte" />
          </label>
          <div class="fld-row">
            <label class="fld">
              <span>Plataforma</span>
              <select v-model="form.platform">
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="meta">Meta (ambas)</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="other">Otra</option>
              </select>
            </label>
            <label class="fld">
              <span>Estado</span>
              <select v-model="form.status">
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="finalizada">Finalizada</option>
              </select>
            </label>
          </div>
          <label class="fld">
            <span>Objetivo (opcional)</span>
            <input v-model="form.objective" type="text" placeholder="Ej: Mensajes / Conversaciones" />
          </label>
          <div class="fld-row">
            <label class="fld">
              <span>Presupuesto total ({{ form.currency }})</span>
              <input v-model="form.budgetTotal" type="number" min="0" step="0.01" placeholder="850" />
            </label>
            <label class="fld">
              <span>Gasto a la fecha (opcional)</span>
              <input v-model="form.spendToDate" type="number" min="0" step="0.01" placeholder="Se usa para los costos reales" />
            </label>
            <label class="fld fld-narrow">
              <span>Moneda</span>
              <select v-model="form.currency">
                <option value="PEN">S/</option>
                <option value="USD">US$</option>
              </select>
            </label>
          </div>
          <div class="fld-row">
            <label class="fld"><span>Inicio</span><input v-model="form.startDate" type="date" /></label>
            <label class="fld"><span>Fin</span><input v-model="form.endDate" type="date" /></label>
          </div>
          <label class="fld">
            <span>ID(s) de anuncio a asociar (opcional, separados por coma)</span>
            <input v-model="form.adSourceIds" type="text" placeholder="120210000000000001, 120210000000000002" />
            <small class="fld-help">Es el <code>source_id</code> del anuncio. Puedes dejarlo vacío y clasificar los anuncios detectados desde la lista de abajo.</small>
          </label>
          <label class="fld">
            <span>Notas</span>
            <textarea v-model="form.notes" rows="2" placeholder="Segmentación, creatividades, etc."></textarea>
          </label>
          <p v-if="modalError" class="cmp-modal-error">{{ modalError }}</p>
          <div class="cmp-modal-actions">
            <button type="button" class="btn-secondary" @click="closeModal">Cancelar</button>
            <button type="submit" class="btn-primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { apiFetch } from '../apiClient.js';
import { loadApiImage } from '../apiImage.js';
import BrandIcon from '../components/BrandIcon.vue';

const RANGE_OPTIONS = [
  { value: 7, label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
  { value: 0, label: 'Todo' }
];

const report = ref(null);
const loading = ref(false);
const errorMsg = ref('');
const rangeDays = ref(30);
const openTraceId = ref(null);
const expandedId = ref(null);
const assignSelection = reactive({});

// ─────────────────────── Búsqueda, filtros y paginación ───────────────────
const searchQuery = ref('');
const platformFilter = ref('all');
const statusFilter = ref('all');
const currentPage = ref(1);
const pageSize = ref(10);

const PLATFORM_FILTERS = [
  { value: 'all', label: 'Todas las plataformas' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'meta', label: 'Meta (ambas)' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Otra' }
];

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'activa', label: 'Activa' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'finalizada', label: 'Finalizada' }
];

const filteredCampaigns = computed(() => {
  const list = report.value?.campaigns || [];
  const query = searchQuery.value.trim().toLowerCase();
  return list.filter((c) => {
    if (query && !c.name.toLowerCase().includes(query)) return false;
    if (platformFilter.value !== 'all' && c.platform !== platformFilter.value) return false;
    if (statusFilter.value !== 'all' && c.status !== statusFilter.value) return false;
    return true;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredCampaigns.value.length / pageSize.value)));

const pagedCampaigns = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredCampaigns.value.slice(start, start + pageSize.value);
});

watch([searchQuery, platformFilter, statusFilter, pageSize], () => { currentPage.value = 1; });
watch(totalPages, (max) => { if (currentPage.value > max) currentPage.value = max; });

// ────────────────────── Miniatura del anuncio (Meta) ───────────────────────
// Cada campaña sincronizada con Meta guarda una copia local del thumbnail
// del creativo de su primer anuncio (ver metaAdsService.sync()); se sirve
// por /api/campaigns/:id/image y se pide solo cuando `hasImage` es true.
const campaignImageUrls = reactive({});

function releaseCampaignImages(keepIds) {
  for (const key of Object.keys(campaignImageUrls)) {
    if (keepIds.has(key)) continue;
    URL.revokeObjectURL(campaignImageUrls[key]);
    delete campaignImageUrls[key];
  }
}

async function hydrateCampaignImages(campaigns) {
  const withImage = campaigns.filter((c) => c.hasImage);
  releaseCampaignImages(new Set(withImage.map((c) => String(c.id))));
  for (const c of withImage) {
    const key = String(c.id);
    if (campaignImageUrls[key]) continue;
    const url = await loadApiImage(`/api/campaigns/${c.id}/image`);
    if (url) campaignImageUrls[key] = url;
  }
}

onBeforeUnmount(() => releaseCampaignImages(new Set()));

const metaStatus = ref(null);
const syncing = ref(false);
const syncMsg = ref('');
const syncError = ref(false);

const showModal = ref(false);
const editingId = ref(null);
const saving = ref(false);
const modalError = ref('');
const form = reactive({
  name: '', platform: 'instagram', status: 'activa', objective: '',
  budgetTotal: '', spendToDate: '', currency: 'PEN',
  startDate: '', endDate: '', adSourceIds: '', notes: ''
});

// ─────────────────────────── Carga de datos ───────────────────────────
async function loadReport() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const params = new URLSearchParams();
    if (rangeDays.value > 0) {
      const from = new Date(Date.now() - rangeDays.value * 86400000);
      params.set('from', from.toISOString());
    }
    const res = await apiFetch(`/api/campaigns/performance?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo cargar el rendimiento.');
    report.value = data;
    await hydrateCampaignImages(data.campaigns || []);
  } catch (err) {
    errorMsg.value = err.message;
  } finally {
    loading.value = false;
  }
}

function setRange(value) {
  rangeDays.value = value;
  loadReport();
}

async function loadMetaStatus() {
  try {
    const res = await apiFetch('/api/campaigns/meta/status');
    if (res.ok) metaStatus.value = await res.json();
  } catch { /* silencioso: el banner de config se muestra solo si hay respuesta */ }
}

const PRESET_BY_RANGE = { 7: 'last_7d', 30: 'last_30d', 90: 'last_90d', 0: 'maximum' };

async function syncMeta() {
  syncing.value = true;
  syncMsg.value = '';
  syncError.value = false;
  try {
    const res = await apiFetch('/api/campaigns/meta/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ datePreset: PRESET_BY_RANGE[rangeDays.value] || 'last_30d' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar con Meta.');
    const s = data.summary;
    syncMsg.value = `✅ Meta: ${s.campaigns} campaña(s), ${s.adsMapped} anuncio(s) mapeado(s), ${s.insightsUpdated} con métricas`
      + `, ${s.adInsights || 0} fila(s) de rendimiento por anuncio.`
      + (s.errors?.length ? ` ⚠️ ${s.errors.join(' · ')}` : '');
    await loadReport();
  } catch (err) {
    syncError.value = true;
    syncMsg.value = `No se pudo sincronizar: ${err.message}`;
  } finally {
    syncing.value = false;
  }
}

function toggleTrace(id) {
  openTraceId.value = openTraceId.value === id ? null : id;
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id;
}

// ─────────────────────────── Campañas (CRUD) ──────────────────────────
function resetForm() {
  Object.assign(form, {
    name: '', platform: 'instagram', status: 'activa', objective: '',
    budgetTotal: '', spendToDate: '', currency: 'PEN',
    startDate: '', endDate: '', adSourceIds: '', notes: ''
  });
}

function openCreateModal(ad) {
  resetForm();
  editingId.value = null;
  modalError.value = '';
  if (ad && ad.sourceId) {
    form.name = ad.headline ? ad.headline.slice(0, 120) : `Anuncio ${ad.sourceId}`;
    form.platform = ad.platform || 'meta';
    form.adSourceIds = ad.sourceId;
  }
  showModal.value = true;
}

function openEditModal(campaign) {
  editingId.value = campaign.id;
  modalError.value = '';
  Object.assign(form, {
    name: campaign.name,
    platform: campaign.platform || 'meta',
    status: campaign.status || 'activa',
    objective: campaign.objective || '',
    budgetTotal: campaign.budgetTotal ?? '',
    spendToDate: campaign.spendToDate ?? '',
    currency: campaign.currency || 'PEN',
    startDate: campaign.startDate ? String(campaign.startDate).slice(0, 10) : '',
    endDate: campaign.endDate ? String(campaign.endDate).slice(0, 10) : '',
    adSourceIds: '',
    notes: campaign.notes || ''
  });
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

async function saveCampaign() {
  saving.value = true;
  modalError.value = '';
  try {
    const payload = {
      name: form.name, platform: form.platform, status: form.status,
      objective: form.objective, budgetTotal: form.budgetTotal || 0,
      spendToDate: form.spendToDate === '' ? null : form.spendToDate,
      currency: form.currency, startDate: form.startDate || null, endDate: form.endDate || null,
      notes: form.notes
    };
    const url = editingId.value ? `/api/campaigns/${editingId.value}` : '/api/campaigns';
    const method = editingId.value ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'No se pudo guardar la campaña.');

    const campaignId = data.campaign.id;
    const ids = form.adSourceIds.split(',').map((s) => s.trim()).filter(Boolean);
    for (const adSourceId of ids) {
      await apiFetch(`/api/campaigns/${campaignId}/ads`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adSourceId })
      });
    }
    showModal.value = false;
    await loadReport();
  } catch (err) {
    modalError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function removeCampaign(campaign) {
  if (!confirm(`¿Eliminar la campaña "${campaign.name}"? Los anuncios asociados quedarán sin clasificar.`)) return;
  try {
    const res = await apiFetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar.');
    await loadReport();
  } catch (err) {
    alert(err.message);
  }
}

async function assignAd(ad) {
  const campaignId = assignSelection[ad.sourceId];
  if (!campaignId) return;
  try {
    const res = await apiFetch(`/api/campaigns/${campaignId}/ads`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adSourceId: ad.sourceId, adLabel: ad.headline })
    });
    if (!res.ok) throw new Error('No se pudo asignar el anuncio.');
    assignSelection[ad.sourceId] = '';
    await loadReport();
  } catch (err) {
    alert(err.message);
  }
}

async function detachAd(mappingId) {
  if (!confirm('¿Quitar este anuncio de la campaña?')) return;
  try {
    const res = await apiFetch(`/api/campaigns/ads/${mappingId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo quitar el anuncio.');
    await loadReport();
  } catch (err) {
    alert(err.message);
  }
}

// ───────────────────────────── Formateo ───────────────────────────────
function num(n) {
  return Number(n || 0).toLocaleString('es-PE');
}

function money(n) {
  const value = Number(n || 0);
  return `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** Los porcentajes de Meta (CTR) ya llegan en puntos porcentuales. */
function pct(value) {
  return value != null ? `${value}%` : '—';
}

/** Ventana del informe de Meta ("Inicio/Fin del informe"). */
function reportWindowLabel(metrics) {
  if (!metrics.reportStart && !metrics.reportStop) return 'sin datos de Meta';
  return `${formatDate(metrics.reportStart)} – ${formatDate(metrics.reportStop)}`;
}

/** "Entrega de anuncios": `effective_status` del anuncio en Meta. */
const DELIVERY_META = {
  ACTIVE: { label: 'Activo', pill: 'pill-success' },
  PAUSED: { label: 'En pausa', pill: 'pill-warning' },
  ADSET_PAUSED: { label: 'Conjunto en pausa', pill: 'pill-warning' },
  CAMPAIGN_PAUSED: { label: 'Campaña en pausa', pill: 'pill-warning' },
  PENDING_REVIEW: { label: 'En revisión', pill: 'pill-info' },
  IN_PROCESS: { label: 'En proceso', pill: 'pill-info' },
  PENDING_BILLING_INFO: { label: 'Falta pago', pill: 'pill-warning' },
  DISAPPROVED: { label: 'Rechazado', pill: 'pill-danger' },
  WITH_ISSUES: { label: 'Con problemas', pill: 'pill-danger' },
  ARCHIVED: { label: 'Archivado', pill: 'pill-neutral' },
  DELETED: { label: 'Eliminado', pill: 'pill-neutral' },
  COMPLETED: { label: 'Finalizado', pill: 'pill-neutral' }
};
function deliveryLabel(status) {
  if (!status) return '—';
  return DELIVERY_META[status]?.label || status.toLowerCase().replace(/_/g, ' ');
}
function deliveryPillClass(status) { return DELIVERY_META[status]?.pill || 'pill-neutral'; }

/**
 * Las tres clasificaciones de Meta comparan el anuncio con los demás que
 * compiten por la misma audiencia. La etiqueta va abreviada porque la tabla
 * ya es muy ancha; el texto completo queda en el `title`.
 */
const RANKING_META = {
  above_average: { short: 'Encima', label: 'Por encima del promedio', pill: 'pill-success' },
  average: { short: 'Promedio', label: 'Promedio', pill: 'pill-info' },
  below_average_35: { short: '35% inf.', label: 'Por debajo del promedio (35% inferior de los anuncios)', pill: 'pill-warning' },
  below_average_20: { short: '20% inf.', label: 'Por debajo del promedio (20% inferior de los anuncios)', pill: 'pill-danger' },
  below_average_10: { short: '10% inf.', label: 'Por debajo del promedio (10% inferior de los anuncios)', pill: 'pill-danger' },
  unknown: { short: '—', label: 'Sin datos suficientes (Meta necesita al menos 500 impresiones)', pill: 'pill-neutral' }
};
function rankLabel(value) { return RANKING_META[value]?.short || '—'; }
function rankTitle(value) { return RANKING_META[value]?.label || 'Sin datos suficientes'; }
function rankPillClass(value) { return RANKING_META[value]?.pill || 'pill-neutral'; }

function responseLabel(minutes) {
  if (minutes == null) return '—';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function dateRangeLabel(campaign) {
  const start = campaign.startDate ? formatDate(campaign.startDate) : null;
  const end = campaign.endDate ? formatDate(campaign.endDate) : (campaign.status === 'activa' ? 'hoy' : null);
  if (start && end) return `${start} – ${end}`;
  if (start) return `desde ${start}`;
  return 'sin fechas';
}

function brandIconName(platform) {
  if (platform === 'instagram') return 'instagram';
  if (platform === 'facebook') return 'facebook';
  if (platform === 'whatsapp') return 'whatsapp';
  return 'meta';
}

function funnelBarWidth(funnel, stage) {
  const max = funnel[0]?.count || 1;
  const pct = Math.max((stage.count / max) * 100, stage.count > 0 ? 4 : 1.5);
  return `${pct}%`;
}

function dropoffLabel(prevStage, stage) {
  if (!prevStage.count) return '';
  return `${Math.round((stage.count / prevStage.count) * 100)}% avanza`;
}

const STATUS_META = {
  activa: { label: 'Activa', pill: 'pill-success' },
  pausada: { label: 'Pausada', pill: 'pill-warning' },
  finalizada: { label: 'Finalizada', pill: 'pill-neutral' }
};
function statusLabel(s) { return STATUS_META[s]?.label || s; }
function statusPillClass(s) { return STATUS_META[s]?.pill || 'pill-neutral'; }

const STAGE_META = {
  conversacion: { label: 'En conversación', pill: 'pill-neutral' },
  respondido: { label: 'Respondido', pill: 'pill-info' },
  calificado: { label: 'Calificado', pill: 'pill-info' },
  cita_agendada: { label: 'Cita agendada', pill: 'pill-warning' },
  ganado: { label: 'Ganado', pill: 'pill-success' },
  perdido: { label: 'Perdido', pill: 'pill-danger' }
};
function stageLabel(s) { return STAGE_META[s]?.label || s; }
function stagePillClass(s) { return STAGE_META[s]?.pill || 'pill-neutral'; }

function stepDotClass(lead, step, idx) {
  if (!step.isFinal) return 'is-done';
  if (lead.currentStage === 'ganado') return 'is-won';
  if (lead.currentStage === 'perdido') return 'is-lost';
  return 'is-current';
}

onMounted(() => {
  loadReport();
  loadMetaStatus();
});
</script>

<style scoped>
.campaigns-page {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.campaigns-subheading {
  max-width: 720px;
  margin-bottom: 0;
}
.campaigns-subheading code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--surface-2);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.campaigns-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.range-tabs {
  display: inline-flex;
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.2rem;
}
.range-tab {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.8rem;
  border-radius: 9999px;
  cursor: pointer;
}
.range-tab.active {
  background: var(--bg-card-solid);
  color: var(--text-main);
  box-shadow: var(--shadow-sm);
}

.new-campaign-btn { white-space: nowrap; }
.sync-btn { white-space: nowrap; width: auto; }

.state-banner {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  font-size: 0.88rem;
  color: var(--text-muted);
}
.state-banner code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  background: var(--surface-2);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}
.state-error { border-color: var(--accent-rose); color: var(--accent-rose); }
.state-ok { border-color: rgba(46, 125, 70, 0.4); color: var(--accent-emerald); }
.state-hint { border-style: dashed; }
.meta-connected { font-size: 0.8rem; padding: 0.65rem 1rem; }
.meta-connected .data-mono { opacity: 0.75; }

.meta-badge {
  display: inline-block;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #1877F2;
  background: rgba(24, 119, 242, 0.12);
  border: 1px solid rgba(24, 119, 242, 0.3);
  border-radius: 5px;
  padding: 0.1rem 0.35rem;
  margin-left: 0.4rem;
  vertical-align: middle;
}
.kpi-meta { border-color: rgba(24, 119, 242, 0.28); }
.metric-meta { background: rgba(24, 119, 242, 0.06); border-color: rgba(24, 119, 242, 0.2); }

/* KPIs */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
}
.kpi-tile {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1rem 1.15rem;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.kpi-label { font-size: 0.76rem; color: var(--text-muted); }
.kpi-value { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; color: var(--text-main); }
.kpi-sub { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); }

/* Campañas — tabla compacta con fila expandible */
.campaigns-table-section { display: flex; flex-direction: column; gap: 1rem; }

.table-toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.45rem 0.9rem;
  flex: 1 1 240px;
  min-width: 200px;
  max-width: 340px;
}
.search-icon { font-size: 0.85rem; opacity: 0.6; flex-shrink: 0; }
.search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.82rem;
  color: var(--text-main);
  width: 100%;
}
.search-clear {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.72rem;
  flex-shrink: 0;
}
.search-clear:hover { color: var(--accent-rose); }

.filter-select {
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-main);
  border-radius: 9999px;
  padding: 0.45rem 0.9rem;
  font-size: 0.8rem;
  font-family: inherit;
}

.table-total { font-size: 0.78rem; color: var(--text-muted); margin-left: auto; white-space: nowrap; }

.campaigns-table th.col-campaign { min-width: 260px; }
.campaigns-table th.col-actions, .campaigns-table td.col-actions { text-align: right; white-space: nowrap; }
.campaigns-table td.data-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

.campaign-row { cursor: pointer; }

.campaign-identity { display: flex; align-items: center; gap: 0.65rem; }
.campaign-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--surface-2);
}
.campaign-thumb-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
}
.campaign-identity-text { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.campaign-name { font-family: var(--font-heading); font-weight: 700; font-size: 0.9rem; color: var(--text-main); }
.campaign-objective {
  font-size: 0.72rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.campaign-meta { font-size: 0.76rem; color: var(--text-muted); font-family: var(--font-mono); }

.icon-btn {
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  border-radius: 8px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
}
.icon-btn:hover { background: var(--surface-3); }
.expand-btn { transition: transform 0.15s ease; }
.expand-btn.is-open { transform: rotate(180deg); }

.campaign-detail-row td { padding: 0; background: var(--surface-1); }
.campaign-detail {
  padding: 1.25rem 1.5rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

/* Paginación */
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
}
.page-btn {
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-main);
  border-radius: 8px;
  width: 30px;
  height: 30px;
  cursor: pointer;
  font-size: 0.9rem;
}
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-btn:not(:disabled):hover { background: var(--surface-3); }
.page-indicator { font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono); }
.page-size-select {
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-main);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  font-family: inherit;
}

/* Embudo */
.funnel { display: flex; flex-direction: column; gap: 0.55rem; }
.funnel-row {
  display: grid;
  grid-template-columns: minmax(150px, 240px) 1fr 84px;
  align-items: center;
  gap: 0.75rem;
}
.funnel-label { font-size: 0.78rem; color: var(--text-sub); text-align: right; }
.funnel-bar-track {
  position: relative;
  height: 24px;
  background: var(--surface-2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  margin-right: 3.5rem;
}
.funnel-bar-fill { height: 24px; background: var(--primary); border-radius: 4px; transition: width 0.4s ease; }
.funnel-bar-value {
  position: absolute;
  left: calc(100% + 0.5rem);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
}
.funnel-dropoff { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); text-align: left; }
.funnel-dropoff-spacer { visibility: hidden; }

/* Métricas — un bloque por origen (Meta Ads / CRM) */
.metrics-block {
  margin-top: 1.2rem;
  padding-top: 1.1rem;
  border-top: 1px solid var(--border-color);
}
.metrics-block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.75rem;
  margin-bottom: 0.75rem;
}
.metrics-block-title { font-size: 0.84rem; font-weight: 700; color: var(--text-main); margin: 0; }
.metrics-block-note { font-size: 0.72rem; color: var(--text-muted); }
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.6rem;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 0.5rem 0.65rem;
}
.metric-label { font-size: 0.68rem; color: var(--text-muted); }
.metric-value { font-size: 0.95rem; font-weight: 700; color: var(--text-main); font-variant-numeric: tabular-nums; }
.metric-sub { font-size: 0.64rem; color: var(--text-muted); line-height: 1.25; }

/* Tabla de rendimiento por anuncio — 23 columnas como el informe de Meta, con
   el nombre del anuncio fijo a la izquierda al desplazarse en horizontal. */
.ads-insights-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-card-solid);
}
.ads-insights-table { width: max-content; min-width: 100%; font-size: 0.74rem; }
.ads-insights-table th,
.ads-insights-table td { white-space: nowrap; padding: 0.45rem 0.65rem; vertical-align: top; }
.ads-insights-table th { font-size: 0.64rem; }
.ads-insights-table .col-ad-name {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--bg-card-solid);
  border-right: 1px solid var(--border-color);
  max-width: 220px;
  white-space: normal;
}
.ad-row-name { display: block; font-size: 0.76rem; color: var(--text-main); line-height: 1.3; }
.ad-row-sub { display: block; font-size: 0.64rem; color: var(--text-muted); font-family: var(--font-body); line-height: 1.25; }
.pill-xs { font-size: 0.66rem; padding: 0.05rem 0.4rem; }

/* Ad chips */
.ad-chips { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-top: 1rem; }
.ad-chips-label { font-size: 0.75rem; color: var(--text-muted); }
.ad-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  padding: 0.2rem 0.35rem 0.2rem 0.7rem;
  font-size: 0.74rem;
  color: var(--text-sub);
}
.ad-chip-x { border: none; background: transparent; cursor: pointer; color: var(--text-muted); font-size: 0.7rem; }
.ad-chip-x:hover { color: var(--accent-rose); }
.ad-chips-empty { font-size: 0.74rem; color: var(--text-muted); font-style: italic; }

.campaign-trace-btn { margin-top: 1.1rem; width: auto; padding: 0.5rem 1rem; font-size: 0.82rem; }

/* Trazabilidad */
.trace-panel { margin-top: 1.1rem; padding-top: 1.1rem; border-top: 1px solid var(--border-color); }
.trace-hint { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
.trace-leads { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
.trace-lead {
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 1rem 1.1rem;
}
.trace-lead-header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.5rem; margin-bottom: 0.85rem; }
.trace-lead-name { font-size: 0.88rem; color: var(--text-main); }
.trace-lead-topic { font-size: 0.76rem; color: var(--text-muted); flex-basis: 100%; }
.trace-timeline { list-style: none; display: flex; flex-direction: column; }
.trace-step { display: flex; align-items: flex-start; gap: 0.65rem; position: relative; padding-bottom: 0.9rem; }
.trace-step:not(.is-last)::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 14px;
  bottom: -2px;
  width: 2px;
  background: var(--border-color);
}
.trace-step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 2px;
  flex-shrink: 0;
  background: var(--surface-4);
  border: 2px solid var(--bg-card-solid);
  box-shadow: 0 0 0 1px var(--border-color);
}
.trace-step-dot.is-done { background: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.trace-step-dot.is-current { background: var(--accent-amber); box-shadow: 0 0 0 1px var(--accent-amber); }
.trace-step-dot.is-won { background: var(--accent-emerald); box-shadow: 0 0 0 1px var(--accent-emerald); }
.trace-step-dot.is-lost { background: var(--accent-rose); box-shadow: 0 0 0 1px var(--accent-rose); }
.trace-step-body { display: flex; flex-direction: column; gap: 0.1rem; }
.trace-step-label { font-size: 0.8rem; color: var(--text-main); }
.trace-step-time { font-size: 0.7rem; color: var(--text-muted); }

/* Sin clasificar */
.unclassified-section {
  background: var(--bg-card-solid);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.35rem 1.5rem;
}
.unclassified-heading { font-family: var(--font-heading); font-size: 0.98rem; font-weight: 700; color: var(--text-main); }
.unclassified-hint { font-size: 0.78rem; color: var(--text-muted); margin: 0.4rem 0 1rem; }
.unclassified-list { display: flex; flex-direction: column; gap: 0.65rem; }
.unclassified-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
}
.unclassified-main { display: flex; align-items: center; gap: 0.6rem; }
.unclassified-title { display: block; font-size: 0.85rem; color: var(--text-main); }
.unclassified-id { display: block; font-size: 0.68rem; color: var(--text-muted); }
.unclassified-stats { display: flex; gap: 0.75rem; font-size: 0.74rem; color: var(--text-sub); font-family: var(--font-mono); }
.unclassified-actions { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.assign-select, .cmp-modal input, .cmp-modal select, .cmp-modal textarea {
  border: 1px solid var(--border-color);
  background: var(--surface-1);
  color: var(--text-main);
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  font-family: inherit;
}
.btn-mini { padding: 0.35rem 0.7rem !important; font-size: 0.76rem !important; width: auto !important; }

.generated-note { font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); text-align: right; }

/* Modal */
.cmp-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.cmp-modal {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7);
}
.cmp-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}
.cmp-modal-head h3 { font-size: 1.05rem; font-weight: 700; color: var(--text-main); }
.cmp-modal-body { padding: 1.25rem; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; }
.fld { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.78rem; color: var(--text-muted); }
.fld-row { display: flex; gap: 0.75rem; }
.fld-row .fld { flex: 1; }
.fld-narrow { max-width: 90px; }
.fld-help { font-size: 0.68rem; color: var(--text-muted); }
.fld-help code { font-family: var(--font-mono); }
.cmp-modal-error { color: var(--accent-rose); font-size: 0.8rem; }
.cmp-modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.25rem; }

@media (max-width: 720px) {
  .campaigns-page { padding: 1rem; }
  .funnel-row { grid-template-columns: 1fr; gap: 0.3rem; }
  .funnel-label { text-align: left; }
  .funnel-bar-track { margin-right: 0; }
  .funnel-bar-value { position: static; margin-left: 0.5rem; }
  .fld-row { flex-direction: column; }
  .fld-narrow { max-width: none; }
}
</style>
