<template>
  <main class="container-fluid kanban-page-wrapper">
    <!-- Header y Acciones Principales -->
    <header class="kanban-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">🎯</span> Setter Funnel — Triaje & Conversaciones
        </h2>
        <p class="section-subheading">
          Gestiona el flujo de prospección y agendamiento. En la primera etapa visualiza a todos los leads con <strong>conversación abierta</strong> desde <strong>WhatsApp, Facebook o Instagram</strong>, califícalos y transfiérelos a citas o cierre.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-primary" @click="openCreateColumnModal">
          <span class="btn-icon">➕</span> Nueva Etapa
        </button>
        <button class="btn-action-secondary" @click="fetchAll" :disabled="isLoading" title="Actualizar datos">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span>
          {{ isLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
        <button class="btn-action-ghost" @click="confirmResetColumns" title="Restablecer etapas predeterminadas de Setter">
          ⚙️ Restablecer
        </button>
      </div>
    </header>

    <!-- Banner de Métricas del Setter Funnel -->
    <section class="funnel-stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper blue">💬</div>
        <div class="stat-info">
          <span class="stat-label">Total Conversaciones</span>
          <span class="stat-value">{{ totalConversationsCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper green">💚</div>
        <div class="stat-info">
          <span class="stat-label">Leads WhatsApp</span>
          <span class="stat-value">{{ whatsappCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper purple">📸 / 📘</div>
        <div class="stat-info">
          <span class="stat-label">Meta (IG / FB)</span>
          <span class="stat-value">{{ igFbCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper amber">📅</div>
        <div class="stat-info">
          <span class="stat-label">Citas Agendadas</span>
          <span class="stat-value">{{ scheduledAppointmentsCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper cyan">🎯</div>
        <div class="stat-info">
          <span class="stat-label">Tasa Calificación</span>
          <span class="stat-value">{{ qualificationRate }}%</span>
        </div>
      </div>
    </section>

    <!-- Barra de Filtros, Canales, Búsqueda y Paginación -->
    <div class="kanban-toolbar">
      <div class="search-filter-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Buscar por cliente, #ID, teléfono, tema, universidad..."
        />
        <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''" title="Limpiar búsqueda">✕</button>
      </div>

      <!-- Filtro por Canal de Origen (WhatsApp, Facebook, Instagram) -->
      <div class="channel-filter-group">
        <button
          class="channel-pill"
          :class="{ active: selectedChannelFilter === 'all' }"
          @click="selectedChannelFilter = 'all'"
        >
          🌐 Todos ({{ totalLeadsCount }})
        </button>
        <button
          class="channel-pill whatsapp-pill"
          :class="{ active: selectedChannelFilter === 'whatsapp' }"
          @click="selectedChannelFilter = 'whatsapp'"
        >
          💚 WhatsApp ({{ whatsappCount }})
        </button>
        <button
          class="channel-pill fb-pill"
          :class="{ active: selectedChannelFilter === 'facebook' }"
          @click="selectedChannelFilter = 'facebook'"
        >
          📘 Facebook ({{ fbCount }})
        </button>
        <button
          class="channel-pill ig-pill"
          :class="{ active: selectedChannelFilter === 'instagram' }"
          @click="selectedChannelFilter = 'instagram'"
        >
          📸 Instagram ({{ igCount }})
        </button>
      </div>

      <!-- Filtros por Viabilidad -->
      <div class="filter-pills">
        <button
          v-for="pill in VIABILITY_FILTERS"
          :key="pill.id"
          class="filter-pill"
          :class="{ active: selectedViabilityFilter === pill.id }"
          @click="selectedViabilityFilter = pill.id"
        >
          {{ pill.label }}
        </button>
      </div>

      <!-- Control de Tarjetas por Columna -->
      <div class="items-per-page-box">
        <span class="toolbar-label">Por pág:</span>
        <select v-model="itemsPerPage" class="items-select" title="Límite de tarjetas por columna">
          <option :value="5">5 leads</option>
          <option :value="8">8 leads</option>
          <option :value="12">12 leads</option>
          <option value="all">Ver todos</option>
        </select>
      </div>

      <!-- Flechas de desplazamiento horizontal del tablero -->
      <div class="board-nav-arrows">
        <button
          class="board-nav-btn"
          @click="scrollBoard('left')"
          title="Desplazar tablero a la izquierda"
        >
          ◀
        </button>
        <span class="board-nav-hint">{{ columns.length }} etapas</span>
        <button
          class="board-nav-btn"
          @click="scrollBoard('right')"
          title="Desplazar tablero a la derecha"
        >
          ▶
        </button>
      </div>
    </div>

    <!-- Mensajes de Error y Alertas -->
    <div v-if="loadError" class="info-box alert-box">
      <h4>⚠️ No se pudo cargar el Setter Funnel</h4>
      <p>{{ loadError }}</p>
    </div>

    <!-- Toast de Proyecto Creado Automáticamente al Ganar -->
    <transition name="toast-slide">
      <div v-if="projectToast" class="project-created-banner">
        <div class="banner-content">
          <span class="banner-icon">🎉</span>
          <div>
            <strong>¡Lead Convertido & Proyecto Creado!</strong>
            <p class="banner-subtext">"{{ projectToast.topic }}" se ha registrado en Gestión de Proyectos.</p>
          </div>
        </div>
        <div class="banner-actions">
          <router-link to="/admin/projects" class="banner-btn primary">Ver en Proyectos</router-link>
          <button class="banner-btn secondary" @click="projectToast = null">✕</button>
        </div>
      </div>
    </transition>

    <!-- Tablero Kanban Dinámico con Scroll Suave -->
    <div class="kanban-viewport custom-scrollbar" ref="kanbanBoardRef">
      <div class="kanban-columns-container">
        <!-- Columna de Kanban -->
        <div
          v-for="(col, colIndex) in columns"
          :key="col.key"
          class="kanban-column"
          :class="{
            'is-first-setter-col': colIndex === 0,
            'is-final-column': col.final,
            'is-drag-over': hoveredColumn === col.key
          }"
          :style="{ '--col-accent': col.color || '#56624A' }"
          @dragover.prevent="hoveredColumn = col.key"
          @dragleave="onColumnDragLeave(col.key)"
          @drop="onDrop(col.key)"
        >
          <!-- Barra superior de acento de color -->
          <div class="column-top-accent"></div>

          <!-- Cabecera de Columna con Controles de Flechas y Opciones -->
          <div class="kanban-column-header">
            <div class="col-title-group">
              <span class="col-icon">{{ col.icon || '📌' }}</span>
              <div class="col-title-texts">
                <span class="col-label" :title="col.label">{{ col.label }}</span>
                <span v-if="colIndex === 0" class="col-setter-badge">💬 Chats WhatsApp / FB / IG</span>
              </div>
              <span
                class="col-count-badge"
                :style="{ background: (col.color || '#56624A') + '22', color: col.color || '#56624A', borderColor: (col.color || '#56624A') + '55' }"
              >
                {{ (filteredLeadsByColumn[col.key] || []).length }}
              </span>
            </div>

            <!-- Controles de Flechas y Menú de Columna -->
            <div class="col-actions-group">
              <button
                class="col-arrow-btn"
                :disabled="colIndex === 0"
                @click.stop="moveColumnLeft(colIndex)"
                title="Mover columna a la izquierda"
              >
                ◀
              </button>
              <button
                class="col-arrow-btn"
                :disabled="colIndex === columns.length - 1"
                @click.stop="moveColumnRight(colIndex)"
                title="Mover columna a la derecha"
              >
                ▶
              </button>
              <button
                class="col-menu-btn"
                @click.stop="openEditColumnModal(col, colIndex)"
                title="Editar nombre, icono o color"
              >
                ✏️
              </button>
              <button
                v-if="columns.length > 1"
                class="col-menu-btn delete-btn"
                @click.stop="openDeleteColumnModal(col, colIndex)"
                title="Eliminar columna"
              >
                🗑️
              </button>
            </div>
          </div>

          <!-- Cuerpo de la Columna (Lista de Leads Paginada) -->
          <div class="kanban-column-body custom-scrollbar">
            <!-- Tarjetas de Leads Paginadas -->
            <div
              v-for="lead in paginatedLeadsByColumn[col.key]"
              :key="lead.id"
              class="kanban-lead-card"
              :class="{
                'is-being-dragged': draggedLead?.id === lead.id,
                'channel-whatsapp-border': getLeadChannelInfo(lead).type === 'whatsapp',
                'channel-fb-border': getLeadChannelInfo(lead).type === 'facebook',
                'channel-ig-border': getLeadChannelInfo(lead).type === 'instagram'
              }"
              draggable="true"
              @dragstart="onDragStart(lead)"
              @dragend="onDragEnd"
              @click="selectedLead = lead"
            >
              <!-- Línea superior: ID, Canal de Origen y Viabilidad -->
              <div class="card-header-line">
                <span class="lead-id-tag">#{{ lead.id }}</span>

                <!-- Badge del Canal de Origen (WhatsApp / Facebook / Instagram) -->
                <span
                  class="channel-tag-badge"
                  :class="getLeadChannelInfo(lead).cssClass"
                  :title="'Origen: ' + (lead.source || getLeadChannelInfo(lead).label)"
                >
                  <span class="channel-tag-icon">{{ getLeadChannelInfo(lead).icon }}</span>
                  <span class="channel-tag-text">{{ getLeadChannelInfo(lead).label }}</span>
                </span>

                <span :class="['viability-pill', getLevelClass(lead.viability_level)]">
                  {{ lead.overall_viability_score ?? '—' }}%
                </span>
              </div>

              <!-- Nombre Completo del Prospecto -->
              <div class="card-lead-name-box">
                <span class="lead-name-icon">👤</span>
                <h4 class="card-lead-name" :title="getLeadFullName(lead)">
                  {{ getLeadFullName(lead) }}
                </h4>
              </div>

              <!-- Tema o Necesidad de Tesis -->
              <p
                v-if="lead.topic && lead.topic.trim() && lead.topic.trim().toLowerCase() !== (lead.full_name || '').trim().toLowerCase()"
                class="card-lead-topic"
                :title="lead.topic"
              >
                <span class="topic-icon">📄</span> {{ lead.topic }}
              </p>

              <!-- Información de Contacto -->
              <div class="card-lead-contact">
                <div class="contact-row" :title="lead.phone">
                  <span class="icon">📱</span>
                  <span>{{ lead.phone || 'Sin número' }}</span>
                </div>
                <div v-if="lead.email" class="contact-row" :title="lead.email">
                  <span class="icon">✉️</span>
                  <span class="truncate">{{ lead.email }}</span>
                </div>
              </div>

              <!-- Badge Académico -->
              <div class="card-academic-badge" v-if="lead.field_of_study || lead.academic_level">
                <span>🎓 {{ formatAcademic(lead.academic_level, lead.field_of_study) }}</span>
              </div>

              <!-- Footer de la tarjeta -->
              <div class="card-footer-line">
                <div class="footer-meta">
                  <span v-if="lead.assigned_to" class="setter-assigned-pill" :title="'Setter/Asesor: ' + lead.assigned_to">
                    👤 {{ lead.assigned_to }}
                  </span>
                  <span v-else class="lead-date-tag">
                    🕒 {{ formatDateShort(lead.created_at) }}
                  </span>
                </div>

                <!-- Accesos rápidos para el Setter -->
                <div class="quick-contact-actions" @click.stop>
                  <a
                    v-if="lead.phone"
                    :href="'https://wa.me/' + normalizePhone(lead.phone)"
                    target="_blank"
                    rel="noopener"
                    class="quick-icon-btn whatsapp"
                    title="Chatear por WhatsApp"
                  >
                    💬
                  </a>
                  <a
                    v-if="lead.email"
                    :href="'mailto:' + lead.email"
                    class="quick-icon-btn email"
                    title="Enviar Correo"
                  >
                    ✉️
                  </a>
                  <button
                    class="quick-icon-btn detail"
                    @click.stop="selectedLead = lead"
                    title="Ver ficha completa"
                  >
                    👁️
                  </button>
                </div>
              </div>
            </div>

            <!-- Silueta de Destino al Arrastrar -->
            <div
              v-if="draggedLead && hoveredColumn === col.key && draggedLead.status !== col.key"
              class="kanban-drop-silhouette"
            >
              <div class="silhouette-header-line">
                <span class="silhouette-id">#{{ draggedLead.id }}</span>
                <span class="silhouette-badge">✨ Soltar aquí</span>
                <span :class="['viability-pill', getLevelClass(draggedLead.viability_level)]">
                  {{ draggedLead.overall_viability_score ?? '—' }}%
                </span>
              </div>
              <h4 class="silhouette-topic">{{ getLeadFullName(draggedLead) }}</h4>
              <div class="silhouette-footer-line">
                <span>📥 Se moverá a <strong>{{ col.label }}</strong></span>
              </div>
            </div>

            <!-- Estado Vacío en la Columna -->
            <div v-if="(filteredLeadsByColumn[col.key] || []).length === 0 && (!draggedLead || hoveredColumn !== col.key)" class="column-empty-state">
              <span class="empty-icon">{{ searchQuery ? '🔍' : (colIndex === 0 ? '💬' : '📥') }}</span>
              <p class="empty-text">
                {{ searchQuery ? 'Sin coincidencias' : (colIndex === 0 ? 'No hay nuevos chats' : 'Arrastra leads aquí') }}
              </p>
              <button v-if="searchQuery" class="clear-search-link" @click="searchQuery = ''">
                Limpiar búsqueda
              </button>
            </div>
          </div>

          <!-- Barra de Paginación por Columna -->
          <div v-if="getColumnTotalPages(col.key) > 1" class="column-pagination-bar">
            <button
              class="col-page-btn nav-extreme-btn"
              :disabled="getColumnPage(col.key) <= 1"
              @click.stop="setColumnPage(col.key, 1)"
              title="Ir al inicio (Pág. 1)"
            >
              ⏮
            </button>
            <button
              class="col-page-btn"
              :disabled="getColumnPage(col.key) <= 1"
              @click.stop="prevColumnPage(col.key)"
              title="Página anterior"
            >
              ◀
            </button>
            <div class="page-pills">
              <template v-for="(p, idx) in getVisibleColumnPages(col.key)" :key="idx">
                <button
                  v-if="p !== '...'"
                  class="page-pill"
                  :class="{ active: p === getColumnPage(col.key) }"
                  @click.stop="setColumnPage(col.key, p)"
                  :title="'Ir a página ' + p"
                >
                  {{ p }}
                </button>
                <button
                  v-else
                  class="page-pill ellipsis-pill"
                  @click.stop="jumpColumnPages(col.key, idx === 1 ? -5 : 5)"
                  :title="idx === 1 ? 'Retroceder 5 páginas' : 'Avanzar 5 páginas'"
                >
                  …
                </button>
              </template>
            </div>
            <button
              class="col-page-btn"
              :disabled="getColumnPage(col.key) >= getColumnTotalPages(col.key)"
              @click.stop="nextColumnPage(col.key)"
              title="Página siguiente"
            >
              ▶
            </button>
            <button
              class="col-page-btn nav-extreme-btn"
              :disabled="getColumnPage(col.key) >= getColumnTotalPages(col.key)"
              @click.stop="setColumnPage(col.key, getColumnTotalPages(col.key))"
              title="Ir a la última página"
            >
              ⏭
            </button>
          </div>

          <!-- Pie de Columna -->
          <div class="column-footer">
            <div class="footer-left-info">
              <span class="footer-count">{{ getColumnRangeText(col.key) }}</span>
              <button
                v-if="getColumnPage(col.key) > 1"
                class="footer-start-btn"
                @click.stop="setColumnPage(col.key, 1)"
                title="Volver a la página 1"
              >
                ⏮ Inicio
              </button>
            </div>
            <span v-if="col.final" class="final-tag">🏆 Cierre Exitoso</span>
          </div>
        </div>

        <!-- Tarjeta Fantasma para Añadir Nueva Columna Rápido -->
        <div class="add-column-ghost-card" @click="openCreateColumnModal">
          <div class="ghost-content">
            <span class="ghost-plus">➕</span>
            <span class="ghost-text">Crear Nueva Etapa</span>
            <span class="ghost-hint">Añade una etapa al Setter Funnel</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 1: Crear Nueva Columna / Etapa                              -->
    <!-- ================================================================= -->
    <div v-if="showCreateColModal" class="modal-overlay" @click.self="showCreateColModal = false">
      <div class="modal-content column-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">✨ Nueva Etapa del Setter Funnel</h3>
          <button class="modal-close-btn" @click="showCreateColModal = false">✕</button>
        </div>
        <form @submit.prevent="saveNewColumn" class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre de la etapa *</label>
            <input
              v-model="newColumnForm.label"
              type="text"
              class="form-input custom-input"
              placeholder="Ej: Diagnóstico Inicial, Confirmar Cita, Seguimiento..."
              required
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label">Icono Representativo</label>
            <div class="emoji-picker-grid">
              <button
                v-for="emoji in PRESET_EMOJIS"
                :key="emoji"
                type="button"
                class="emoji-option-btn"
                :class="{ active: newColumnForm.icon === emoji }"
                @click="newColumnForm.icon = emoji"
              >
                {{ emoji }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color de la Etapa</label>
            <div class="color-picker-grid">
              <button
                v-for="c in PRESET_COLORS"
                :key="c.hex"
                type="button"
                class="color-option-btn"
                :class="{ active: newColumnForm.color === c.hex }"
                :style="{ backgroundColor: c.hex }"
                :title="c.name"
                @click="newColumnForm.color = c.hex"
              >
                <span v-if="newColumnForm.color === c.hex" class="check-icon">✓</span>
              </button>
            </div>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="newColumnForm.final" class="custom-checkbox" />
              <span>Marcar como <strong>Etapa de Cierre Ganado</strong> (crea proyecto automático)</span>
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-action-ghost" @click="showCreateColModal = false">Cancelar</button>
            <button type="submit" class="btn-action-primary">Crear Etapa</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 2: Editar Etapa Existente                                  -->
    <!-- ================================================================= -->
    <div v-if="showEditColModal" class="modal-overlay" @click.self="showEditColModal = false">
      <div class="modal-content column-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">✏️ Editar Etapa</h3>
          <button class="modal-close-btn" @click="showEditColModal = false">✕</button>
        </div>
        <form @submit.prevent="saveEditedColumn" class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre de la etapa *</label>
            <input
              v-model="editColumnForm.label"
              type="text"
              class="form-input custom-input"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Icono</label>
            <div class="emoji-picker-grid">
              <button
                v-for="emoji in PRESET_EMOJIS"
                :key="emoji"
                type="button"
                class="emoji-option-btn"
                :class="{ active: editColumnForm.icon === emoji }"
                @click="editColumnForm.icon = emoji"
              >
                {{ emoji }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="color-picker-grid">
              <button
                v-for="c in PRESET_COLORS"
                :key="c.hex"
                type="button"
                class="color-option-btn"
                :class="{ active: editColumnForm.color === c.hex }"
                :style="{ backgroundColor: c.hex }"
                :title="c.name"
                @click="editColumnForm.color = c.hex"
              >
                <span v-if="editColumnForm.color === c.hex" class="check-icon">✓</span>
              </button>
            </div>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editColumnForm.final" class="custom-checkbox" />
              <span>Marcar como <strong>Etapa de Cierre Ganado</strong></span>
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-action-ghost" @click="showEditColModal = false">Cancelar</button>
            <button type="submit" class="btn-action-primary">Guardar Cambios</button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 3: Eliminar Columna y Reasignar Leads                       -->
    <!-- ================================================================= -->
    <div v-if="showDeleteColModal" class="modal-overlay" @click.self="showDeleteColModal = false">
      <div class="modal-content column-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">🗑️ Eliminar Etapa</h3>
          <button class="modal-close-btn" @click="showDeleteColModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-desc">
            ¿Estás seguro de eliminar la etapa <strong>"{{ deletingColumn?.label }}"</strong>?
          </p>
          <div class="form-group" v-if="availableTargetColumns.length > 0">
            <label class="form-label">Reasignar sus leads a:</label>
            <select v-model="targetReassignColKey" class="form-select custom-select">
              <option v-for="c in availableTargetColumns" :key="c.key" :value="c.key">
                {{ c.icon }} {{ c.label }}
              </option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn-action-ghost" @click="showDeleteColModal = false">Cancelar</button>
            <button class="btn-action-danger" @click="confirmDeleteColumn">Eliminar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 4: Ficha Completa del Lead / Setter Drawer                  -->
    <!-- ================================================================= -->
    <div v-if="selectedLead" class="modal-overlay" @click.self="selectedLead = null">
      <div class="modal-content lead-modal-card">
        <div class="modal-header">
          <div class="lead-modal-title-group">
            <span class="lead-modal-id">#{{ selectedLead.id }}</span>
            <div>
              <h3 class="lead-modal-name">{{ getLeadFullName(selectedLead) }}</h3>
              <p class="lead-modal-subtext">
                Canal: <strong :class="getLeadChannelInfo(selectedLead).cssClass">{{ getLeadChannelInfo(selectedLead).icon }} {{ selectedLead.source || getLeadChannelInfo(selectedLead).label }}</strong>
                · Registrado: {{ formatDate(selectedLead.created_at) }}
              </p>
            </div>
          </div>
          <button class="modal-close-btn" @click="selectedLead = null">✕</button>
        </div>

        <div class="modal-body custom-scrollbar">
          <!-- Banner de Contacto Rápido -->
          <div class="setter-quick-bar">
            <div class="quick-contact-pills">
              <a
                v-if="selectedLead.phone"
                :href="'https://wa.me/' + normalizePhone(selectedLead.phone)"
                target="_blank"
                rel="noopener"
                class="setter-btn whatsapp-solid"
              >
                💬 Abrir Chat de WhatsApp ({{ selectedLead.phone }})
              </a>
              <a
                v-if="selectedLead.email"
                :href="'mailto:' + selectedLead.email"
                class="setter-btn email-solid"
              >
                ✉️ Enviar Correo ({{ selectedLead.email }})
              </a>
            </div>

            <!-- Selector Rápido de Estado en el Setter Funnel -->
            <div class="stage-selector-box">
              <label class="form-label">Mover etapa en Setter Funnel:</label>
              <select
                :value="selectedLead.status"
                @change="updateLeadStatusFromSelect(selectedLead.id, $event.target.value)"
                class="form-select custom-select stage-select"
              >
                <option v-for="c in columns" :key="c.key" :value="c.key">
                  {{ c.icon }} {{ c.label }} {{ c.final ? ' (🏆 Cierre)' : '' }}
                </option>
              </select>
            </div>
          </div>

          <!-- Grid de Datos del Lead -->
          <div class="lead-details-grid">
            <div class="detail-item">
              <span class="detail-label">🎓 Grado Académico:</span>
              <span class="detail-value">{{ selectedLead.academic_level || 'No especificado' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">📚 Carrera / Especialidad:</span>
              <span class="detail-value">{{ selectedLead.field_of_study || 'No especificado' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">🏛️ Universidad:</span>
              <span class="detail-value">{{ selectedLead.university || 'No especificada' }}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">📍 Ubicación:</span>
              <span class="detail-value">{{ [selectedLead.department, selectedLead.province].filter(Boolean).join(', ') || 'No registrada' }}</span>
            </div>
            <div class="detail-item full-width">
              <span class="detail-label">📄 Tema / Consulta Principal:</span>
              <span class="detail-value highlight-topic">{{ selectedLead.topic || 'Sin tema detallado' }}</span>
            </div>
            <div class="detail-item full-width" v-if="selectedLead.additional_notes">
              <span class="detail-label">📝 Notas / Diagnóstico del Setter:</span>
              <p class="detail-notes-box">{{ selectedLead.additional_notes }}</p>
            </div>
          </div>

          <!-- Reporte de Viabilidad SUNEDU / CONCYTEC -->
          <div class="viability-section-card" v-if="selectedLead.overall_viability_score != null">
            <h4 class="section-subtitle">📊 Puntuación de Viabilidad Comercial</h4>
            <div class="viability-gauge-row">
              <div class="viability-badge-big" :class="getLevelClass(selectedLead.viability_level)">
                <span class="viability-score-num">{{ selectedLead.overall_viability_score }}%</span>
                <span class="viability-level-text">Viabilidad {{ selectedLead.viability_level || 'Calculada' }}</span>
              </div>
              <p class="viability-hint">
                Calculado mediante el motor de IA de viabilidad metodológica y temática de tesis.
              </p>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-action-ghost" @click="selectedLead = null">Cerrar</button>
          <router-link to="/admin/leads" class="btn-action-secondary">
            Ver en Funnel General 📇
          </router-link>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

// Etapas predeterminadas especializadas para Setter Funnel
const DEFAULT_SETTER_COLUMNS = [
  {
    key: 'conversacion_abierta',
    label: 'Conversación Abierta',
    icon: '💬',
    color: '#2C8C99',
    final: false,
    position: 0
  },
  {
    key: 'calificando',
    label: 'En Calificación',
    icon: '🎯',
    color: '#6F8125',
    final: false,
    position: 1
  },
  {
    key: 'congelado',
    label: 'Congelado',
    icon: '🧊',
    color: '#8D9199',
    final: false,
    position: 2
  },
  {
    key: 'cita_agendada',
    label: 'Cita Agendada',
    icon: '📅',
    color: '#C9922E',
    final: false,
    position: 3
  },
  {
    key: 'transferido_closer',
    label: 'Transferido a Closer',
    icon: '🤝',
    color: '#56624A',
    final: false,
    position: 4
  },
  {
    key: 'ganado',
    label: 'Ganado / Cerrado',
    icon: '🏆',
    color: '#2F7D5A',
    final: true,
    position: 5
  },
  {
    key: 'descartado',
    label: 'No Califica / Sin Resp.',
    icon: '🚫',
    color: '#B23A45',
    final: false,
    position: 6
  }
];

const PRESET_EMOJIS = ['💬', '🎯', '📅', '🤝', '🏆', '🚫', '💚', '📘', '📸', '📞', '🆕', '📋', '⏳', '⭐', '⚡', '💰'];

const PRESET_COLORS = [
  { name: 'Cian', hex: '#2C8C99' },
  { name: 'Violeta', hex: '#4C3F91' },
  { name: 'Ámbar', hex: '#C9922E' },
  { name: 'Azul', hex: '#56624A' },
  { name: 'Esmeralda', hex: '#2F7D5A' },
  { name: 'Rosa', hex: '#B23A45' },
  { name: 'Índigo', hex: '#5560B0' },
  { name: 'Naranja', hex: '#BF5A2A' }
];

const VIABILITY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'alta', label: '🌟 Alta' },
  { id: 'media', label: '⚖️ Media' },
  { id: 'baja', label: '🔻 Baja' }
];

// Estado de Columnas
const columns = ref([]);
const kanbanBoardRef = ref(null);

// Estado de Leads
const leads = ref([]);
const selectedLead = ref(null);
const isLoading = ref(false);
const loadError = ref('');
const draggedLead = ref(null);
const hoveredColumn = ref(null);
const projectToast = ref(null);

// Filtros y Búsqueda
const searchQuery = ref('');
const selectedChannelFilter = ref('all');
const selectedViabilityFilter = ref('all');

// Paginación por Columna
const columnPages = reactive({});
const itemsPerPage = ref(8);

function getColumnPage(colKey) {
  return columnPages[colKey] || 1;
}

function getColumnTotalPages(colKey) {
  const list = filteredLeadsByColumn.value[colKey] || [];
  if (itemsPerPage.value === 'all') return 1;
  return Math.ceil(list.length / Number(itemsPerPage.value)) || 1;
}

function setColumnPage(colKey, page) {
  const total = getColumnTotalPages(colKey);
  columnPages[colKey] = Math.max(1, Math.min(page, total));
}

function prevColumnPage(colKey) {
  setColumnPage(colKey, getColumnPage(colKey) - 1);
}

function nextColumnPage(colKey) {
  setColumnPage(colKey, getColumnPage(colKey) + 1);
}

function jumpColumnPages(colKey, delta) {
  const current = getColumnPage(colKey);
  const total = getColumnTotalPages(colKey);
  setColumnPage(colKey, Math.max(1, Math.min(total, current + delta)));
}

function getVisibleColumnPages(colKey) {
  const total = getColumnTotalPages(colKey);
  const current = getColumnPage(colKey);
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, '...', total];
  } else if (current >= total - 2) {
    return [1, '...', total - 3, total - 2, total - 1, total];
  } else {
    return [1, '...', current - 1, current, current + 1, '...', total];
  }
}

function getColumnRangeText(colKey) {
  const total = (filteredLeadsByColumn.value[colKey] || []).length;
  if (total === 0) return '0 leads';
  if (itemsPerPage.value === 'all') return `${total} lead(s)`;
  const page = getColumnPage(colKey);
  const totalPages = getColumnTotalPages(colKey);
  const start = (page - 1) * Number(itemsPerPage.value) + 1;
  const end = Math.min(page * Number(itemsPerPage.value), total);
  return `Pág. ${page}/${totalPages} (${start}-${end} de ${total})`;
}

// Modales
const showCreateColModal = ref(false);
const newColumnForm = reactive({
  label: '',
  icon: '🎯',
  color: '#2C8C99',
  final: false
});

const showEditColModal = ref(false);
const editingColumn = ref(null);
const editColumnForm = reactive({
  label: '',
  icon: '',
  color: '',
  final: false
});

const showDeleteColModal = ref(false);
const deletingColumn = ref(null);
const targetReassignColKey = ref('conversacion_abierta');

// Helper para detectar el canal del lead
function getLeadChannelInfo(lead) {
  const source = (lead.source || '').toLowerCase();
  const notes = (lead.additional_notes || '').toLowerCase();
  const topic = (lead.topic || '').toLowerCase();

  if (source.includes('whatsapp') || topic.includes('whatsapp') || notes.includes('whatsapp')) {
    return {
      type: 'whatsapp',
      label: lead.source || 'WhatsApp',
      icon: '💚',
      cssClass: 'channel-whatsapp'
    };
  }
  if (source.includes('instagram') || source.includes('ig') || topic.includes('instagram') || notes.includes('instagram')) {
    return {
      type: 'instagram',
      label: lead.source || 'Instagram',
      icon: '📸',
      cssClass: 'channel-instagram'
    };
  }
  if (source.includes('facebook') || source.includes('fb') || topic.includes('facebook') || notes.includes('facebook')) {
    return {
      type: 'facebook',
      label: lead.source || 'Facebook',
      icon: '📘',
      cssClass: 'channel-facebook'
    };
  }
  if (source.includes('meta') || notes.includes('meta')) {
    return {
      type: 'facebook',
      label: lead.source || 'Meta Ads',
      icon: '🌐',
      cssClass: 'channel-facebook'
    };
  }
  return {
    type: 'chat',
    label: lead.source || 'Directo',
    icon: '💬',
    cssClass: 'channel-direct'
  };
}

// Comprobación si un lead proviene de WhatsApp, Facebook o Instagram
function isConversationLead(lead) {
  const ch = getLeadChannelInfo(lead).type;
  return ch === 'whatsapp' || ch === 'facebook' || ch === 'instagram' || ch === 'chat';
}

// Estadísticas de Resumen
const totalLeadsCount = computed(() => leads.value.length);

const totalConversationsCount = computed(() => {
  return leads.value.filter(isConversationLead).length;
});

const whatsappCount = computed(() => {
  return leads.value.filter(l => getLeadChannelInfo(l).type === 'whatsapp').length;
});

const fbCount = computed(() => {
  return leads.value.filter(l => getLeadChannelInfo(l).type === 'facebook').length;
});

const igCount = computed(() => {
  return leads.value.filter(l => getLeadChannelInfo(l).type === 'instagram').length;
});

const igFbCount = computed(() => fbCount.value + igCount.value);

const scheduledAppointmentsCount = computed(() => {
  return leads.value.filter(l => l.status === 'cita_agendada').length;
});

const qualificationRate = computed(() => {
  if (leads.value.length === 0) return 0;
  const qualified = leads.value.filter(l =>
    l.status !== 'conversacion_abierta' &&
    l.status !== 'nuevo' &&
    l.status !== 'descartado' &&
    l.status !== 'perdido'
  ).length;
  return Math.round((qualified / leads.value.length) * 100);
});

// Agrupación y Mapeo de Leads en Columnas del Setter Funnel
const filteredLeadsByColumn = computed(() => {
  const grouped = {};
  for (const col of columns.value) {
    grouped[col.key] = [];
  }

  const query = searchQuery.value.trim().toLowerCase();
  const channelFilter = selectedChannelFilter.value;
  const firstColKey = columns.value[0]?.key || 'conversacion_abierta';

  for (const lead of leads.value) {
    const channelInfo = getLeadChannelInfo(lead);

    // Filtro por Canal de Origen
    if (channelFilter !== 'all' && channelInfo.type !== channelFilter) {
      continue;
    }

    // Filtro por texto de búsqueda
    if (query) {
      const cleanId = query.replace(/^#/, '');
      const matchId = String(lead.id || '').includes(cleanId);
      const matchName = (lead.full_name || '').toLowerCase().includes(query);
      const matchTopic = (lead.topic || '').toLowerCase().includes(query);
      const matchEmail = (lead.email || '').toLowerCase().includes(query);
      const matchPhone = (lead.phone || '').toLowerCase().includes(query);
      const matchField = (lead.field_of_study || '').toLowerCase().includes(query);
      const matchUniversity = (lead.university || '').toLowerCase().includes(query);
      const matchChannel = (lead.source || '').toLowerCase().includes(query);
      const matchAssigned = (lead.assigned_to || '').toLowerCase().includes(query);

      if (!matchId && !matchName && !matchTopic && !matchEmail && !matchPhone && !matchField && !matchUniversity && !matchChannel && !matchAssigned) {
        continue;
      }
    }

    // Filtro por nivel de viabilidad
    if (selectedViabilityFilter.value !== 'all') {
      const lvl = (lead.viability_level || '').toLowerCase();
      if (selectedViabilityFilter.value === 'alta' && !lvl.includes('alta')) continue;
      if (selectedViabilityFilter.value === 'media' && !lvl.includes('media')) continue;
      if (selectedViabilityFilter.value === 'baja' && !lvl.includes('baja')) continue;
    }

    // Determinación de la Columna
    // Si el estado es 'conversacion_abierta' o 'nuevo' o similar etapa inicial, se ubica en la primera columna
    const status = lead.status || 'nuevo';
    if (grouped[status]) {
      grouped[status].push(lead);
    } else if (status === 'nuevo' || status === 'inbox' || status === 'abierto') {
      // Leads nuevos de WhatsApp/Facebook/Instagram caen en la 1ra columna (Conversación Abierta)
      if (grouped[firstColKey]) {
        grouped[firstColKey].push(lead);
      }
    } else if (status === 'contactado' && grouped['calificando']) {
      grouped['calificando'].push(lead);
    } else if (status === 'en_negociacion' && grouped['transferido_closer']) {
      grouped['transferido_closer'].push(lead);
    } else if (status === 'perdido' && grouped['descartado']) {
      grouped['descartado'].push(lead);
    } else {
      // Si no coincide, ubicar en la primera columna
      if (grouped[firstColKey]) {
        grouped[firstColKey].push(lead);
      }
    }
  }

  return grouped;
});

// Leads paginados por columna
const paginatedLeadsByColumn = computed(() => {
  const result = {};
  for (const col of columns.value) {
    const list = filteredLeadsByColumn.value[col.key] || [];
    if (itemsPerPage.value === 'all') {
      result[col.key] = list;
    } else {
      const page = getColumnPage(col.key);
      const limit = Number(itemsPerPage.value);
      const start = (page - 1) * limit;
      const end = start + limit;
      result[col.key] = list.slice(start, end);
    }
  }
  return result;
});

// Reajuste de páginas al cambiar filtros
watch([filteredLeadsByColumn, itemsPerPage], () => {
  for (const col of columns.value) {
    const totalPages = getColumnTotalPages(col.key);
    const currentPage = getColumnPage(col.key);
    if (currentPage > totalPages) {
      columnPages[col.key] = Math.max(1, totalPages);
    }
  }
}, { deep: true });

const availableTargetColumns = computed(() => {
  if (!deletingColumn.value) return columns.value;
  return columns.value.filter(c => c.key !== deletingColumn.value.key);
});

// Mover columnas
function moveColumnLeft(index) {
  if (index <= 0) return;
  const newCols = [...columns.value];
  const [removed] = newCols.splice(index, 1);
  newCols.splice(index - 1, 0, removed);
  columns.value = newCols;
  persistSetterColumns();
}

function moveColumnRight(index) {
  if (index >= columns.value.length - 1) return;
  const newCols = [...columns.value];
  const [removed] = newCols.splice(index, 1);
  newCols.splice(index + 1, 0, removed);
  columns.value = newCols;
  persistSetterColumns();
}

function scrollBoard(direction) {
  if (!kanbanBoardRef.value) return;
  const scrollAmount = 350;
  kanbanBoardRef.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth'
  });
}

// Drag and Drop
function onDragStart(lead) {
  draggedLead.value = lead;
}

function onDragEnd() {
  draggedLead.value = null;
  hoveredColumn.value = null;
}

function onColumnDragLeave(colKey) {
  if (hoveredColumn.value === colKey) {
    hoveredColumn.value = null;
  }
}

async function onDrop(targetColKey) {
  if (!draggedLead.value) return;
  const leadToMove = draggedLead.value;
  const oldStatus = leadToMove.status;
  draggedLead.value = null;
  hoveredColumn.value = null;

  if (oldStatus === targetColKey) return;

  // Actualización optimista en UI
  leadToMove.status = targetColKey;

  try {
    const res = await apiFetch(`/api/leads/${leadToMove.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: targetColKey })
    });
    if (!res.ok) {
      throw new Error('Error al actualizar estado');
    }
    const data = await res.json();
    if (data.project) {
      projectToast.value = {
        id: data.project.id,
        topic: data.project.topic || leadToMove.topic
      };
    }
  } catch (err) {
    console.error('Error al mover lead:', err);
    leadToMove.status = oldStatus;
    alert('No se pudo guardar el cambio de etapa.');
  }
}

async function updateLeadStatusFromSelect(leadId, newStatus) {
  const lead = leads.value.find(l => l.id === leadId);
  if (!lead) return;
  const oldStatus = lead.status;
  lead.status = newStatus;

  try {
    const res = await apiFetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Error al actualizar');
    const data = await res.json();
    if (data.project) {
      projectToast.value = {
        id: data.project.id,
        topic: data.project.topic || lead.topic
      };
    }
  } catch (err) {
    console.error('Error al actualizar status:', err);
    lead.status = oldStatus;
    alert('No se pudo actualizar el estado del lead.');
  }
}

// Modal Gestión de Columnas
function openCreateColumnModal() {
  newColumnForm.label = '';
  newColumnForm.icon = '🎯';
  newColumnForm.color = '#2C8C99';
  newColumnForm.final = false;
  showCreateColModal.value = true;
}

function saveNewColumn() {
  if (!newColumnForm.label.trim()) return;
  const key = 'setter_col_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 5);
  columns.value.push({
    key,
    label: newColumnForm.label.trim(),
    icon: newColumnForm.icon || '📌',
    color: newColumnForm.color || '#2C8C99',
    final: Boolean(newColumnForm.final),
    position: columns.value.length
  });
  persistSetterColumns();
  showCreateColModal.value = false;
}

function openEditColumnModal(col) {
  editingColumn.value = col;
  editColumnForm.label = col.label;
  editColumnForm.icon = col.icon || '📌';
  editColumnForm.color = col.color || '#2C8C99';
  editColumnForm.final = Boolean(col.final);
  showEditColModal.value = true;
}

function saveEditedColumn() {
  if (!editingColumn.value || !editColumnForm.label.trim()) return;
  const col = columns.value.find(c => c.key === editingColumn.value.key);
  if (col) {
    col.label = editColumnForm.label.trim();
    col.icon = editColumnForm.icon;
    col.color = editColumnForm.color;
    col.final = Boolean(editColumnForm.final);
  }
  persistSetterColumns();
  showEditColModal.value = false;
}

function openDeleteColumnModal(col) {
  deletingColumn.value = col;
  const remaining = columns.value.filter(c => c.key !== col.key);
  targetReassignColKey.value = remaining[0]?.key || 'conversacion_abierta';
  showDeleteColModal.value = true;
}

async function confirmDeleteColumn() {
  if (!deletingColumn.value) return;
  const colKey = deletingColumn.value.key;
  const targetKey = targetReassignColKey.value;

  // Reasignar leads que estaban en la columna eliminada
  for (const lead of leads.value) {
    if (lead.status === colKey) {
      lead.status = targetKey;
      apiFetch(`/api/leads/${lead.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetKey })
      }).catch(console.error);
    }
  }

  columns.value = columns.value.filter(c => c.key !== colKey);
  persistSetterColumns();
  showDeleteColModal.value = false;
  deletingColumn.value = null;
}

function confirmResetColumns() {
  if (!confirm('¿Restablecer las etapas de Setter Funnel a su configuración original?')) return;
  columns.value = JSON.parse(JSON.stringify(DEFAULT_SETTER_COLUMNS));
  persistSetterColumns();
}

function persistSetterColumns() {
  try {
    localStorage.setItem('setter_funnel_columns_v2', JSON.stringify(columns.value));
  } catch (e) {
    console.warn('No se pudo guardar columnas en localStorage:', e);
  }
}

function loadSetterColumns() {
  try {
    const saved = localStorage.getItem('setter_funnel_columns_v2');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        columns.value = parsed;
        return;
      }
    }
  } catch (e) {
    console.warn('Error al cargar columnas guardadas:', e);
  }
  columns.value = JSON.parse(JSON.stringify(DEFAULT_SETTER_COLUMNS));
}

// Fetch Leads & Data
async function fetchAll() {
  isLoading.value = true;
  loadError.value = '';
  try {
    const res = await apiFetch('/api/leads');
    if (!res.ok) throw new Error('Error al obtener leads del servidor');
    const data = await res.json();
    leads.value = Array.isArray(data.leads) ? data.leads : (Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('Error al cargar leads:', err);
    loadError.value = err.message || 'Error de conexión con el servidor.';
  } finally {
    isLoading.value = false;
  }
}

// Helpers de formateo
function getLeadFullName(lead) {
  if (lead.full_name && lead.full_name.trim()) return lead.full_name.trim();
  if (lead.name && lead.name.trim()) return lead.name.trim();
  if (lead.phone) return `Contacto (${lead.phone})`;
  return `Lead #${lead.id}`;
}

function getLevelClass(level) {
  const lvl = (level || '').toLowerCase();
  if (lvl.includes('alta')) return 'viability-high';
  if (lvl.includes('media')) return 'viability-medium';
  if (lvl.includes('baja')) return 'viability-low';
  return 'viability-unknown';
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function formatAcademic(level, field) {
  const parts = [];
  if (level) parts.push(level);
  if (field) parts.push(field);
  return parts.join(' — ') || 'Académico General';
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'Reciente';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Reciente';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

onMounted(() => {
  loadSetterColumns();
  fetchAll();
});
</script>

<style scoped>
/* Contenedor Principal de la Página */
.kanban-page-wrapper {
  padding: 1.5rem 2rem;
  max-width: 100%;
  box-sizing: border-box;
}

/* Header */
.kanban-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.header-titles {
  max-width: 760px;
}

.section-heading {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
  letter-spacing: -0.02em;
}

.heading-icon {
  font-size: 2rem;
}

.section-subheading {
  font-size: 0.95rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Botones */
.btn-action-primary {
  background: linear-gradient(135deg, #2C8C99 0%, #56624A 100%);
  color: #FFFFFF;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.25s ease;
  box-shadow: 0 4px 14px rgba(158, 186, 75, 0.35);
}

.btn-action-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(158, 186, 75, 0.45);
}

.btn-action-secondary {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 0.65rem 1.15rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.btn-action-secondary:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--surface-4);
}

.btn-action-ghost {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  padding: 0.65rem 1rem;
  border-radius: 12px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action-ghost:hover {
  color: var(--text-main);
  background: var(--surface-2);
}

.btn-action-danger {
  background: var(--accent-rose);
  color: #fff;
  border: none;
  padding: 0.65rem 1.25rem;
  border-radius: 12px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.spin-animation {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Banner de Métricas */
.funnel-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 1.15rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.4);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: var(--surface-4);
}

.stat-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  flex-shrink: 0;
}

.stat-icon-wrapper.blue { background: rgba(111, 129, 37, 0.15); color: #56624A; }
.stat-icon-wrapper.green { background: rgba(46, 125, 70, 0.15); color: #2F7D5A; }
.stat-icon-wrapper.purple { background: rgba(111, 129, 37, 0.15); color: #6F8125; }
.stat-icon-wrapper.amber { background: rgba(201, 146, 46, 0.15); color: #C9922E; }
.stat-icon-wrapper.cyan { background: rgba(158, 186, 75, 0.15); color: #2C8C99; }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text-main);
  line-height: 1.2;
}

/* Toolbar */
.kanban-toolbar {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 0.85rem 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  backdrop-filter: blur(12px);
}

.search-filter-box {
  display: flex;
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.45rem 0.85rem;
  flex: 1;
  min-width: 240px;
  gap: 0.5rem;
}

.search-input {
  background: transparent;
  border: none;
  color: var(--text-main);
  font-size: 0.88rem;
  width: 100%;
  outline: none;
}

.clear-search-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
}

/* Filtros por Canales */
.channel-filter-group {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.channel-pill {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 0.45rem 0.85rem;
  border-radius: 20px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.channel-pill:hover {
  background: var(--surface-3);
  color: var(--text-main);
}

.channel-pill.active {
  background: rgba(158, 186, 75, 0.2);
  border-color: #2C8C99;
  color: #5AAEB8;
}

.channel-pill.whatsapp-pill.active {
  background: rgba(46, 125, 70, 0.22);
  border-color: #2F7D5A;
  color: var(--accent-emerald);
}

.channel-pill.fb-pill.active {
  background: rgba(111, 129, 37, 0.22);
  border-color: #56624A;
  color: var(--accent-cyan);
}

.channel-pill.ig-pill.active {
  background: rgba(138, 63, 40, 0.22);
  border-color: #8A3F28;
  color: var(--accent-pink);
}

/* Filtros por Viabilidad */
.filter-pills {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.filter-pill {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  padding: 0.4rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-pill.active {
  background: var(--surface-4);
  border-color: var(--surface-5);
  color: var(--text-main);
}

.items-per-page-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.items-select {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  border-radius: 8px;
  padding: 0.35rem 0.6rem;
  font-size: 0.82rem;
  outline: none;
}

.board-nav-arrows {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.board-nav-btn {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.board-nav-btn:hover {
  background: var(--surface-4);
}

.board-nav-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* Toast de Proyecto Creado */
.project-created-banner {
  background: linear-gradient(135deg, rgba(46, 125, 70, 0.2) 0%, rgba(158, 186, 75, 0.2) 100%);
  border: 1px solid #2F7D5A;
  border-radius: 14px;
  padding: 0.9rem 1.25rem;
  margin-bottom: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  box-shadow: 0 10px 30px -10px rgba(46, 125, 70, 0.4);
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.banner-icon {
  font-size: 1.6rem;
}

.banner-subtext {
  font-size: 0.85rem;
  color: var(--text-sub);
  margin: 0;
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.banner-btn.primary {
  background: #2F7D5A;
  color: #fff;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
}

.banner-btn.secondary {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1rem;
}

/* Tablero Kanban */
.kanban-viewport {
  width: 100%;
  overflow-x: auto;
  padding-bottom: 1.5rem;
}

.kanban-columns-container {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
  min-width: min-content;
}

/* Columna Kanban */
.kanban-column {
  width: 320px;
  min-width: 320px;
  max-width: 320px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 30px -15px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(14px);
  position: relative;
  overflow: hidden;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.kanban-column.is-first-setter-col {
  border-color: rgba(158, 186, 75, 0.4);
  background: linear-gradient(180deg, rgba(158, 186, 75, 0.06) 0%, var(--bg-card) 20%);
}

.kanban-column.is-drag-over {
  border-color: var(--col-accent);
  transform: scale(1.01);
  box-shadow: 0 0 25px rgba(158, 186, 75, 0.35);
}

.column-top-accent {
  height: 4px;
  width: 100%;
  background: var(--col-accent);
}

.kanban-column-header {
  padding: 1rem 1.15rem 0.85rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.col-title-group {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  flex: 1;
  overflow: hidden;
}

.col-icon {
  font-size: 1.25rem;
  line-height: 1.2;
}

.col-title-texts {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-setter-badge {
  font-size: 0.68rem;
  color: #5AAEB8;
  font-weight: 600;
  margin-top: 1px;
}

.col-count-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 12px;
  border: 1px solid;
  flex-shrink: 0;
}

.col-actions-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.col-arrow-btn, .col-menu-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.72rem;
  transition: all 0.15s ease;
}

.col-arrow-btn:hover:not(:disabled), .col-menu-btn:hover {
  color: var(--text-main);
  background: var(--surface-3);
}

.col-arrow-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.col-menu-btn.delete-btn:hover {
  color: var(--accent-rose);
  background: rgba(200, 85, 50, 0.15);
}

/* Cuerpo de la Columna y Tarjetas */
.kanban-column-body {
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 280px;
  max-height: 620px;
  overflow-y: auto;
}

.kanban-lead-card {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.kanban-lead-card:hover {
  transform: translateY(-2px);
  border-color: var(--surface-4);
  box-shadow: var(--shadow-md);
}

.kanban-lead-card.channel-whatsapp-border {
  border-left: 3px solid #2F7D5A;
}

.kanban-lead-card.channel-fb-border {
  border-left: 3px solid #56624A;
}

.kanban-lead-card.channel-ig-border {
  border-left: 3px solid #8A3F28;
}

.kanban-lead-card.is-being-dragged {
  opacity: 0.4;
  transform: scale(0.96);
}

.card-header-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.lead-id-tag {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* Badge de Canal en la tarjeta */
.channel-tag-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-size: 0.72rem;
  font-weight: 600;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-tag-badge.channel-whatsapp {
  background: rgba(46, 125, 70, 0.16);
  color: var(--accent-emerald);
  border: 1px solid rgba(46, 125, 70, 0.35);
}

.channel-tag-badge.channel-facebook {
  background: rgba(107, 122, 94, 0.16);
  color: var(--accent-cyan);
  border: 1px solid rgba(107, 122, 94, 0.35);
}

.channel-tag-badge.channel-instagram {
  background: rgba(138, 63, 40, 0.16);
  color: var(--accent-pink);
  border: 1px solid rgba(138, 63, 40, 0.35);
}

.channel-tag-badge.channel-direct {
  background: var(--surface-2);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}

.viability-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 8px;
}

.viability-high { background: rgba(46, 125, 70, 0.18); color: var(--accent-emerald); }
.viability-medium { background: rgba(201, 146, 46, 0.18); color: var(--accent-amber); }
.viability-low { background: rgba(200, 85, 50, 0.18); color: var(--accent-rose); }
.viability-unknown { background: var(--surface-2); color: var(--text-muted); }

.card-lead-name-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.lead-name-icon {
  font-size: 0.85rem;
  opacity: 0.7;
}

.card-lead-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.3;
  margin: 0;
}

.card-lead-topic {
  font-size: 0.8rem;
  color: var(--text-sub);
  line-height: 1.35;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-lead-contact {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.card-academic-badge {
  background: var(--surface-1);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  color: var(--accent-silver);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-footer-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.25rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--surface-2);
}

.footer-meta {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.setter-assigned-pill {
  background: rgba(158, 186, 75, 0.12);
  color: #5AAEB8;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  font-weight: 600;
}

.quick-contact-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.quick-icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  text-decoration: none;
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-icon-btn.whatsapp:hover {
  background: #2F7D5A;
  border-color: #2F7D5A;
  color: #fff;
}

.quick-icon-btn.email:hover {
  background: #56624A;
  border-color: #56624A;
  color: #fff;
}

.quick-icon-btn.detail:hover {
  background: var(--surface-4);
}

/* Silueta Drop Preview */
.kanban-drop-silhouette {
  border: 2px dashed #2C8C99;
  background: rgba(158, 186, 75, 0.08);
  border-radius: 14px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.silhouette-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.silhouette-badge {
  font-size: 0.75rem;
  color: #5AAEB8;
  font-weight: 700;
}

.silhouette-topic {
  font-size: 0.85rem;
  color: var(--text-main);
}

.silhouette-footer-line {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Estado Vacío de Columna */
.column-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 1rem;
  text-align: center;
  color: var(--text-muted);
}

.column-empty-state .empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.6;
}

.column-empty-state .empty-text {
  font-size: 0.85rem;
  margin: 0;
}

.clear-search-link {
  background: transparent;
  border: none;
  color: #2C8C99;
  font-size: 0.8rem;
  margin-top: 0.5rem;
  cursor: pointer;
  text-decoration: underline;
}

/* Paginación de Columna */
.column-pagination-bar {
  padding: 0.5rem 0.85rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  background: var(--surface-1);
}

.col-page-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 0.72rem;
  cursor: pointer;
}

.col-page-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text-main);
}

.col-page-btn:disabled {
  opacity: 0.25;
}

.page-pills {
  display: flex;
  gap: 0.2rem;
}

.page-pill {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  min-width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.page-pill.active {
  background: #2C8C99;
  color: #fff;
}

.column-footer {
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--surface-1);
}

.footer-left-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.footer-start-btn {
  background: transparent;
  border: none;
  color: #2C8C99;
  cursor: pointer;
  font-size: 0.72rem;
}

.final-tag {
  background: rgba(46, 125, 70, 0.15);
  color: var(--accent-emerald);
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  font-weight: 600;
}

/* Tarjeta Fantasma Añadir Etapa */
.add-column-ghost-card {
  width: 280px;
  min-width: 280px;
  border: 2px dashed var(--surface-4);
  border-radius: 18px;
  padding: 2rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--surface-1);
}

.add-column-ghost-card:hover {
  border-color: #2C8C99;
  background: rgba(158, 186, 75, 0.05);
}

.ghost-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
}

.ghost-plus {
  font-size: 1.8rem;
}

.ghost-text {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-main);
}

.ghost-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* Modales */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

:root[data-theme="dark"] .modal-overlay {
  background: rgba(0, 0, 0, 0.75);
}

.modal-content {
  background: var(--bg-card-solid);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.8);
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.column-modal-card {
  max-width: 480px;
}

.lead-modal-card {
  max-width: 700px;
}

.modal-header {
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 8px;
}

.modal-close-btn:hover {
  background: var(--surface-3);
  color: var(--text-main);
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-sub);
}

.custom-input, .custom-select {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  border-radius: 10px;
  padding: 0.65rem 0.9rem;
  font-size: 0.9rem;
  outline: none;
}

.custom-input:focus, .custom-select:focus {
  border-color: #2C8C99;
}

.emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.4rem;
}

.emoji-option-btn {
  background: var(--surface-2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 0.4rem;
  font-size: 1.2rem;
  cursor: pointer;
}

.emoji-option-btn.active {
  background: rgba(158, 186, 75, 0.2);
  border-color: #2C8C99;
}

.color-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.4rem;
}

.color-option-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
}

.color-option-btn.active {
  border-color: var(--bg-card-solid);
  box-shadow: 0 0 0 2px var(--primary);
  transform: scale(1.08);
}

.checkbox-group {
  margin-top: 0.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.88rem;
  color: var(--text-main);
  cursor: pointer;
}

/* Modal Lead Detail */
.lead-modal-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.lead-modal-id {
  font-size: 1.1rem;
  font-weight: 800;
  color: #2C8C99;
  background: rgba(158, 186, 75, 0.15);
  padding: 0.2rem 0.6rem;
  border-radius: 8px;
}

.lead-modal-name {
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--text-main);
  margin: 0;
}

.lead-modal-subtext {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}

.setter-quick-bar {
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.quick-contact-pills {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.setter-btn {
  padding: 0.6rem 1.1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: all 0.2s ease;
}

.setter-btn.whatsapp-solid {
  background: #2F7D5A;
  color: #fff;
}

.setter-btn.whatsapp-solid:hover {
  background: #1F5A3F;
}

.setter-btn.email-solid {
  background: #56624A;
  color: #fff;
}

.setter-btn.email-solid:hover {
  background: #1F4E77;
}

.stage-selector-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.stage-select {
  flex: 1;
  min-width: 220px;
}

.lead-details-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.85rem;
}

.detail-item {
  background: var(--surface-1);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.detail-item.full-width {
  grid-column: span 2;
}

.detail-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
}

.detail-value {
  font-size: 0.9rem;
  color: var(--text-main);
  font-weight: 500;
}

.highlight-topic {
  color: #5AAEB8;
  font-weight: 600;
}

.detail-notes-box {
  background: var(--surface-1);
  padding: 0.6rem;
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-sub);
  margin: 0;
  line-height: 1.4;
}

.viability-section-card {
  background: rgba(111, 129, 37, 0.06);
  border: 1px solid rgba(111, 129, 37, 0.25);
  border-radius: 12px;
  padding: 1rem;
}

.section-subtitle {
  font-size: 0.95rem;
  font-weight: 700;
  color: #56624A;
  margin: 0 0 0.6rem;
}

.viability-gauge-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.viability-badge-big {
  padding: 0.5rem 1rem;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.viability-score-num {
  font-size: 1.6rem;
  font-weight: 800;
}

.viability-level-text {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.viability-hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin: 0;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* Scrollbar personalizado */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--surface-4);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--surface-5);
}

@media (max-width: 768px) {
  .kanban-page-wrapper {
    padding: 1rem;
  }
  .lead-details-grid {
    grid-template-columns: 1fr;
  }
  .detail-item.full-width {
    grid-column: span 1;
  }
}
</style>
