<template>
  <main class="container-fluid kanban-page-wrapper">
    <!-- Header y Acciones Principales -->
    <header class="kanban-header">
      <div class="header-titles">
        <h2 class="section-heading">
          <span class="heading-icon">📇</span> Funnel de Ventas — Kanban de Leads
        </h2>
        <p class="section-subheading">
          Gestiona el flujo comercial de candidatos. Arrastra leads entre columnas, reordena etapas con las flechas o crea nuevas etapas personalizadas.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-action-primary" @click="openCreateColumnModal">
          <span class="btn-icon">➕</span> Nueva Columna
        </button>
        <button class="btn-action-secondary" @click="fetchAll" :disabled="isLoading" title="Actualizar datos">
          <span :class="['btn-icon', { 'spin-animation': isLoading }]">🔄</span>
          {{ isLoading ? 'Cargando...' : 'Actualizar' }}
        </button>
        <button class="btn-action-ghost" @click="confirmResetColumns" title="Restablecer columnas originales">
          ⚙️ Restablecer
        </button>
      </div>
    </header>

    <!-- Banner de Métricas del Funnel -->
    <section class="funnel-stats-grid">
      <div class="stat-card">
        <div class="stat-icon-wrapper blue">📊</div>
        <div class="stat-info">
          <span class="stat-label">Total Leads</span>
          <span class="stat-value">{{ leads.length }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper green">🌟</div>
        <div class="stat-info">
          <span class="stat-label">Alta Viabilidad</span>
          <span class="stat-value">{{ highViabilityCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper amber">🚀</div>
        <div class="stat-info">
          <span class="stat-label">Proyectos Ganados</span>
          <span class="stat-value">{{ wonProjectsCount }}</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrapper purple">📈</div>
        <div class="stat-info">
          <span class="stat-label">Promedio Viabilidad</span>
          <span class="stat-value">{{ avgViabilityScore }}%</span>
        </div>
      </div>
    </section>

    <!-- Barra de Filtros y Control de Desplazamiento -->
    <div class="kanban-toolbar">
      <div class="search-filter-box">
        <span class="search-icon">🔍</span>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Buscar por tema, cliente, email o teléfono..."
        />
        <button v-if="searchQuery" class="clear-search-btn" @click="searchQuery = ''">✕</button>
      </div>

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

      <!-- Flechas de navegación horizontal del tablero -->
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
      <h4>⚠️ No se pudo cargar el funnel</h4>
      <p>{{ loadError }}</p>
    </div>

    <!-- Toast de Proyecto Creado -->
    <transition name="toast-slide">
      <div v-if="projectToast" class="project-created-banner">
        <div class="banner-content">
          <span class="banner-icon">🎉</span>
          <div>
            <strong>¡Proyecto creado automáticamente!</strong>
            <p class="banner-subtext">"{{ projectToast.topic }}" se ha registrado como nuevo proyecto.</p>
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
            'is-final-column': col.final,
            'is-drag-over': hoveredColumn === col.key
          }"
          :style="{ '--col-accent': col.color || '#105EFF' }"
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
              <span class="col-label" :title="col.label">{{ col.label }}</span>
              <span class="col-count-badge" :style="{ background: (col.color || '#105EFF') + '22', color: col.color || '#105EFF', borderColor: (col.color || '#105EFF') + '55' }">
                {{ (filteredLeadsByColumn[col.key] || []).length }}
              </span>
            </div>

            <!-- Controles de Flechas y Menú de Columna -->
            <div class="col-actions-group">
              <!-- Flecha Mover Izquierda -->
              <button
                class="col-arrow-btn"
                :disabled="colIndex === 0"
                @click.stop="moveColumnLeft(colIndex)"
                title="Mover columna a la izquierda"
              >
                ◀
              </button>

              <!-- Flecha Mover Derecha -->
              <button
                class="col-arrow-btn"
                :disabled="colIndex === columns.length - 1"
                @click.stop="moveColumnRight(colIndex)"
                title="Mover columna a la derecha"
              >
                ▶
              </button>

              <!-- Botón Editar Columna -->
              <button
                class="col-menu-btn"
                @click.stop="openEditColumnModal(col, colIndex)"
                title="Editar nombre, icono o color de esta columna"
              >
                ✏️
              </button>

              <!-- Botón Eliminar Columna (si hay más de 1 columna) -->
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

          <!-- Cuerpo de la Columna (Lista de Leads) -->
          <div class="kanban-column-body custom-scrollbar">
            <!-- Tarjetas de Leads -->
            <div
              v-for="lead in filteredLeadsByColumn[col.key]"
              :key="lead.id"
              class="kanban-lead-card"
              draggable="true"
              @dragstart="onDragStart(lead)"
              @dragend="onDragEnd"
              @click="selectedLead = lead"
            >
              <div class="card-header-line">
                <span class="lead-id-tag">#{{ lead.id }}</span>
                <span :class="['viability-pill', getLevelClass(lead.viability_level)]">
                  {{ lead.overall_viability_score ?? '—' }}%
                </span>
              </div>

              <h4 class="card-lead-topic" :title="lead.topic">{{ lead.topic }}</h4>

              <div class="card-lead-contact">
                <div class="contact-row" :title="lead.email">
                  <span class="icon">✉️</span>
                  <span class="truncate">{{ lead.email }}</span>
                </div>
                <div class="contact-row" :title="lead.phone">
                  <span class="icon">📱</span>
                  <span>{{ lead.phone }}</span>
                </div>
              </div>

              <div class="card-academic-badge">
                <span>🎓 {{ formatAcademic(lead.academic_level, lead.field_of_study) }}</span>
              </div>

              <div class="card-footer-line">
                <span v-if="lead.project_id" class="project-created-tag">
                  🚀 Proyecto #{{ lead.project_id }}
                </span>
                <span v-else class="lead-date-tag">
                  🕒 {{ formatDateShort(lead.created_at) }}
                </span>

                <!-- Accesos rápidos -->
                <div class="quick-contact-actions" @click.stop>
                  <a
                    v-if="lead.phone"
                    :href="'https://wa.me/' + normalizePhone(lead.phone)"
                    target="_blank"
                    rel="noopener"
                    class="quick-icon-btn whatsapp"
                    title="Enviar WhatsApp"
                  >
                    💬
                  </a>
                  <a
                    :href="'mailto:' + lead.email"
                    class="quick-icon-btn email"
                    title="Enviar Correo"
                  >
                    ✉️
                  </a>
                </div>
              </div>
            </div>

            <!-- Estado Vacío dentro de la Columna -->
            <div v-if="(filteredLeadsByColumn[col.key] || []).length === 0" class="column-empty-state">
              <span class="empty-icon">{{ searchQuery ? '🔍' : '📥' }}</span>
              <p class="empty-text">
                {{ searchQuery ? 'Sin coincidencias' : 'Arrastra leads aquí' }}
              </p>
            </div>
          </div>

          <!-- Pie de Columna (Indicador de Total) -->
          <div class="column-footer">
            <span>{{ (filteredLeadsByColumn[col.key] || []).length }} lead(s)</span>
            <span v-if="col.final" class="final-tag">🏆 Etapa Ganadora</span>
          </div>
        </div>

        <!-- Tarjeta Fantasma para Añadir Nueva Columna Rápido -->
        <div class="add-column-ghost-card" @click="openCreateColumnModal">
          <div class="ghost-content">
            <span class="ghost-plus">➕</span>
            <span class="ghost-text">Crear Nueva Etapa</span>
            <span class="ghost-hint">Añade una columna personalizada al funnel</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 1: Crear Nueva Columna                                      -->
    <!-- ================================================================= -->
    <div v-if="showCreateColModal" class="modal-overlay" @click.self="showCreateColModal = false">
      <div class="modal-content column-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">✨ Nueva Etapa del Funnel</h3>
          <button class="modal-close-btn" @click="showCreateColModal = false">✕</button>
        </div>
        <form @submit.prevent="saveNewColumn" class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre de la columna *</label>
            <input
              v-model="newColumnForm.label"
              type="text"
              class="form-input custom-input"
              placeholder="Ej: En Revisión Técnica, Propuesta Enviada, Cierre..."
              required
              autofocus
            />
          </div>

          <div class="form-group">
            <label class="form-label">Icono / Emoji</label>
            <div class="emoji-picker-grid">
              <button
                v-for="emoji in PRESET_EMOJIS"
                :key="emoji"
                type="button"
                class="emoji-choice-btn"
                :class="{ selected: newColumnForm.icon === emoji }"
                @click="newColumnForm.icon = emoji"
              >
                {{ emoji }}
              </button>
            </div>
            <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 0.8rem; color: var(--text-muted);">O escribe uno personalizado:</span>
              <input
                v-model="newColumnForm.icon"
                type="text"
                class="form-input custom-input"
                style="width: 70px; text-align: center; font-size: 1.1rem; padding: 0.3rem;"
                maxlength="4"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color de acento</label>
            <div class="color-picker-grid">
              <button
                v-for="color in PRESET_COLORS"
                :key="color.hex"
                type="button"
                class="color-choice-btn"
                :class="{ selected: newColumnForm.color === color.hex }"
                :style="{ background: color.hex }"
                :title="color.name"
                @click="newColumnForm.color = color.hex"
              ></button>
            </div>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="newColumnForm.final" type="checkbox" class="custom-checkbox" />
              <span>Marcar como <strong>Etapa Ganadora</strong> (al mover un lead aquí, crea automáticamente su proyecto)</span>
            </label>
          </div>

          <div class="modal-footer-actions">
            <button type="button" class="btn-action-ghost" @click="showCreateColModal = false">Cancelar</button>
            <button type="submit" class="btn-action-primary" :disabled="!newColumnForm.label.trim()">
              ➕ Crear Columna
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 2: Editar Columna Existente                                 -->
    <!-- ================================================================= -->
    <div v-if="showEditColModal && editingColumn" class="modal-overlay" @click.self="showEditColModal = false">
      <div class="modal-content column-modal-card">
        <div class="modal-header">
          <h3 class="modal-title">✏️ Editar Etapa: {{ editingColumn.label }}</h3>
          <button class="modal-close-btn" @click="showEditColModal = false">✕</button>
        </div>
        <form @submit.prevent="saveEditedColumn" class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre de la columna *</label>
            <input
              v-model="editColumnForm.label"
              type="text"
              class="form-input custom-input"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Icono / Emoji</label>
            <div class="emoji-picker-grid">
              <button
                v-for="emoji in PRESET_EMOJIS"
                :key="emoji"
                type="button"
                class="emoji-choice-btn"
                :class="{ selected: editColumnForm.icon === emoji }"
                @click="editColumnForm.icon = emoji"
              >
                {{ emoji }}
              </button>
            </div>
            <div style="margin-top: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-size: 0.8rem; color: var(--text-muted);">O escribe uno personalizado:</span>
              <input
                v-model="editColumnForm.icon"
                type="text"
                class="form-input custom-input"
                style="width: 70px; text-align: center; font-size: 1.1rem; padding: 0.3rem;"
                maxlength="4"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Color de acento</label>
            <div class="color-picker-grid">
              <button
                v-for="color in PRESET_COLORS"
                :key="color.hex"
                type="button"
                class="color-choice-btn"
                :class="{ selected: editColumnForm.color === color.hex }"
                :style="{ background: color.hex }"
                :title="color.name"
                @click="editColumnForm.color = color.hex"
              ></button>
            </div>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input v-model="editColumnForm.final" type="checkbox" class="custom-checkbox" />
              <span>Marcar como <strong>Etapa Ganadora</strong> (genera proyecto automático)</span>
            </label>
          </div>

          <div class="modal-footer-actions">
            <button type="button" class="btn-action-ghost" @click="showEditColModal = false">Cancelar</button>
            <button type="submit" class="btn-action-primary" :disabled="!editColumnForm.label.trim()">
              💾 Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 3: Eliminar Columna con Reasignación de Leads               -->
    <!-- ================================================================= -->
    <div v-if="showDeleteColModal && deletingColumn" class="modal-overlay" @click.self="showDeleteColModal = false">
      <div class="modal-content column-modal-card" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title" style="color: var(--accent-rose);">🗑️ Eliminar Columna</h3>
          <button class="modal-close-btn" @click="showDeleteColModal = false">✕</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-main); font-size: 0.95rem; margin-bottom: 1rem;">
            ¿Estás seguro de eliminar la etapa <strong>"{{ deletingColumn.icon }} {{ deletingColumn.label }}"</strong>?
          </p>

          <div v-if="getLeadsCountInColumn(deletingColumn.key) > 0" class="info-box" style="border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); margin-bottom: 1.25rem;">
            <p style="color: var(--accent-amber); font-size: 0.85rem; margin: 0 0 0.5rem 0;">
              ⚠️ Esta columna contiene <strong>{{ getLeadsCountInColumn(deletingColumn.key) }} lead(s)</strong>.
            </p>
            <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.3rem;">Reasignar estos leads a:</label>
            <select v-model="targetReassignColKey" class="form-select custom-select">
              <option
                v-for="col in availableTargetColumns"
                :key="col.key"
                :value="col.key"
              >
                {{ col.icon }} {{ col.label }}
              </option>
            </select>
          </div>

          <div class="modal-footer-actions">
            <button type="button" class="btn-action-ghost" @click="showDeleteColModal = false">Cancelar</button>
            <button type="button" class="btn-action-danger" @click="confirmDeleteColumn">
              Eliminar Columna
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- MODAL 4: Detalle del Lead y Acciones                              -->
    <!-- ================================================================= -->
    <div v-if="selectedLead" class="modal-overlay" @click.self="selectedLead = null">
      <div class="modal-content lead-detail-card">
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span class="lead-id-tag">Lead #{{ selectedLead.id }}</span>
            <span :class="['viability-pill', getLevelClass(selectedLead.viability_level)]">
              {{ selectedLead.overall_viability_score ?? '—' }}% Viabilidad
            </span>
          </div>
          <button class="modal-close-btn" @click="selectedLead = null">✕</button>
        </div>

        <div class="modal-body">
          <h3 class="modal-lead-topic">{{ selectedLead.topic }}</h3>

          <div class="lead-info-grid">
            <div class="info-card-panel">
              <h5 class="panel-subtitle">👤 Contacto</h5>
              <div class="info-item">
                <span class="info-label">Email:</span>
                <span class="info-value selectable">{{ selectedLead.email }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Celular:</span>
                <span class="info-value selectable">{{ selectedLead.phone }}</span>
              </div>
            </div>

            <div class="info-card-panel">
              <h5 class="panel-subtitle">🎓 Datos Académicos</h5>
              <div class="info-item">
                <span class="info-label">Nivel:</span>
                <span class="info-value">{{ selectedLead.academic_level }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Carrera:</span>
                <span class="info-value">{{ selectedLead.field_of_study }}</span>
              </div>
            </div>
          </div>

          <div v-if="selectedLead.additional_notes" class="lead-notes-box">
            <h5 class="panel-subtitle">📝 Notas Adicionales</h5>
            <p>{{ selectedLead.additional_notes }}</p>
          </div>

          <div v-if="selectedLead.project_id" class="lead-project-badge-box">
            <span style="font-size: 1.2rem;">🚀</span>
            <div>
              <strong>Proyecto Activo #{{ selectedLead.project_id }}</strong>
              <p style="margin: 0; font-size: 0.8rem; color: var(--text-muted);">
                Estado del proyecto: {{ selectedLead.project_status }}
              </p>
            </div>
            <router-link :to="`/admin/projects/${selectedLead.project_id}`" class="btn-action-secondary" style="font-size: 0.78rem; padding: 0.35rem 0.8rem; margin-left: auto; text-decoration: none;">
              Abrir Proyecto
            </router-link>
          </div>

          <!-- Selector de Estado del Funnel -->
          <div class="form-group" style="margin-top: 1.25rem;">
            <label class="form-label">Mover etapa en el Funnel</label>
            <select
              :value="selectedLead.status"
              class="form-select custom-select"
              @change="moveLeadToStatus(selectedLead, $event.target.value)"
            >
              <option v-for="col in columns" :key="col.key" :value="col.key">
                {{ col.icon }} {{ col.label }}
              </option>
            </select>
          </div>

          <!-- Botones de Contacto y Cotización -->
          <div class="lead-action-buttons">
            <a
              :href="'mailto:' + selectedLead.email"
              class="btn-action-secondary"
              style="text-decoration: none;"
            >
              ✉️ Enviar Correo
            </a>
            <a
              :href="'https://wa.me/' + normalizePhone(selectedLead.phone)"
              target="_blank"
              rel="noopener"
              class="btn-action-secondary"
              style="text-decoration: none;"
            >
              💬 WhatsApp
            </a>
            <button
              v-if="!showQuoteForm"
              type="button"
              class="btn-action-primary"
              @click="showQuoteForm = true"
            >
              💰 Generar Cotización
            </button>
          </div>

          <!-- Formulario de Cotización Integrado -->
          <transition name="fade">
            <form v-if="showQuoteForm" class="quote-form-section" @submit.prevent="submitQuote">
              <h4 class="quote-heading">💰 Nueva Cotización Comercial</h4>
              <div class="form-group">
                <label class="form-label">Monto (S/.) *</label>
                <input
                  v-model="quoteAmount"
                  type="number"
                  min="1"
                  step="0.01"
                  class="form-input custom-input"
                  placeholder="Ej: 1500"
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label">Notas y Alcance del Servicio</label>
                <textarea
                  v-model="quoteNotes"
                  class="form-textarea custom-input"
                  rows="3"
                  placeholder="Ej: Incluye asesoría metodológica completa, validación de instrumentos y levantamiento de observaciones..."
                ></textarea>
              </div>
              <div style="display: flex; gap: 0.6rem; justify-content: flex-end;">
                <button type="button" class="btn-action-ghost" @click="showQuoteForm = false">Cancelar</button>
                <button type="submit" class="btn-action-primary" :disabled="quoteSubmitting">
                  {{ quoteSubmitting ? 'Enviando...' : 'Enviar Cotización' }}
                </button>
              </div>
            </form>
          </transition>

          <div v-if="quoteSuccess" class="info-box" style="margin-top: 1rem; border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.08);">
            <p style="color: var(--accent-emerald); margin: 0; font-size: 0.88rem;">
              ✅ Cotización de <strong>{{ formatCurrency(quoteSuccess.amount, quoteSuccess.currency) }}</strong> enviada con éxito a <strong>{{ selectedLead.email }}</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { apiFetch } from '../apiClient.js';

const STORAGE_KEY = 'minirag_kanban_columns_v2';

// Columnas predeterminadas del sistema
const DEFAULT_COLUMNS = [
  { key: 'nuevo', label: 'Nuevo', icon: '🆕', color: '#105EFF', final: false },
  { key: 'contactado', label: 'Contactado', icon: '📞', color: '#8B5CF6', final: false },
  { key: 'en_negociacion', label: 'En Negociación', icon: '🤝', color: '#F59E0B', final: false },
  { key: 'ganado', label: 'Ganado', icon: '🏆', color: '#10B981', final: true },
  { key: 'perdido', label: 'Perdido', icon: '❌', color: '#F43F5E', final: false }
];

// Presets para selector de colores y emojis
const PRESET_EMOJIS = ['🆕', '📞', '🤝', '🏆', '❌', '🎯', '🚀', '💬', '📋', '⏳', '💡', '💰', '📊', '🔍', '⭐', '⚡'];

const PRESET_COLORS = [
  { name: 'Azul', hex: '#105EFF' },
  { name: 'Violeta', hex: '#8B5CF6' },
  { name: 'Ámbar', hex: '#F59E0B' },
  { name: 'Esmeralda', hex: '#10B981' },
  { name: 'Rosa', hex: '#F43F5E' },
  { name: 'Cian', hex: '#06B6D4' },
  { name: 'Índigo', hex: '#6366F1' },
  { name: 'Naranja', hex: '#F97316' }
];

const VIABILITY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'alta', label: '🌟 Alta' },
  { id: 'media', label: '⚖️ Media' },
  { id: 'baja', label: '🔻 Baja' }
];

// Estado de Columnas Dinámicas
const columns = ref(loadStoredColumns());
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
const selectedViabilityFilter = ref('all');

// Modales de Gestión de Columnas
const showCreateColModal = ref(false);
const newColumnForm = reactive({
  label: '',
  icon: '🎯',
  color: '#105EFF',
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
const targetReassignColKey = ref('nuevo');

// Cotización
const showQuoteForm = ref(false);
const quoteAmount = ref('');
const quoteNotes = ref('');
const quoteSubmitting = ref(false);
const quoteSuccess = ref(null);

// Guardar columnas en localStorage cuando cambien
watch(columns, (newCols) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newCols));
  } catch (e) {
    console.error('Error al guardar columnas en storage:', e);
  }
}, { deep: true });

watch(selectedLead, () => {
  showQuoteForm.value = false;
  quoteAmount.value = '';
  quoteNotes.value = '';
  quoteSuccess.value = null;
});

function loadStoredColumns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('No se pudieron recuperar las columnas almacenadas:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
}

// Estadísticas de Resumen
const highViabilityCount = computed(() => {
  return leads.value.filter(l => (l.viability_level || '').toLowerCase().includes('alta')).length;
});

const wonProjectsCount = computed(() => {
  return leads.value.filter(l => l.project_id || l.status === 'ganado').length;
});

const avgViabilityScore = computed(() => {
  const scored = leads.value.filter(l => typeof l.overall_viability_score === 'number');
  if (scored.length === 0) return 0;
  const sum = scored.reduce((acc, curr) => acc + curr.overall_viability_score, 0);
  return Math.round(sum / scored.length);
});

// Leads filtrados agrupados por columna
const filteredLeadsByColumn = computed(() => {
  const grouped = {};
  for (const col of columns.value) {
    grouped[col.key] = [];
  }

  const query = searchQuery.value.trim().toLowerCase();

  for (const lead of leads.value) {
    // Filtro por texto
    if (query) {
      const matchTopic = (lead.topic || '').toLowerCase().includes(query);
      const matchEmail = (lead.email || '').toLowerCase().includes(query);
      const matchPhone = (lead.phone || '').toLowerCase().includes(query);
      const matchField = (lead.field_of_study || '').toLowerCase().includes(query);
      if (!matchTopic && !matchEmail && !matchPhone && !matchField) continue;
    }

    // Filtro por nivel de viabilidad
    if (selectedViabilityFilter.value !== 'all') {
      const lvl = (lead.viability_level || '').toLowerCase();
      if (selectedViabilityFilter.value === 'alta' && !lvl.includes('alta')) continue;
      if (selectedViabilityFilter.value === 'media' && !lvl.includes('media')) continue;
      if (selectedViabilityFilter.value === 'baja' && !lvl.includes('baja')) continue;
    }

    // Ubicar en columna correspondiente
    if (grouped[lead.status]) {
      grouped[lead.status].push(lead);
    } else {
      // Si el estado no coincide con ninguna columna activa, asignar a la primera columna
      const firstKey = columns.value[0]?.key || 'nuevo';
      if (!grouped[firstKey]) grouped[firstKey] = [];
      grouped[firstKey].push(lead);
    }
  }

  return grouped;
});

// Columnas disponibles para reasignar (excluyendo la que se va a borrar)
const availableTargetColumns = computed(() => {
  if (!deletingColumn.value) return columns.value;
  return columns.value.filter(c => c.key !== deletingColumn.value.key);
});

// Mover columnas con flechas (Izquierda / Derecha)
function moveColumnLeft(index) {
  if (index <= 0) return;
  const temp = columns.value[index];
  columns.value[index] = columns.value[index - 1];
  columns.value[index - 1] = temp;
  columns.value = [...columns.value];
}

function moveColumnRight(index) {
  if (index >= columns.value.length - 1) return;
  const temp = columns.value[index];
  columns.value[index] = columns.value[index + 1];
  columns.value[index + 1] = temp;
  columns.value = [...columns.value];
}

// Desplazar el tablero horizontalmente
function scrollBoard(direction) {
  if (!kanbanBoardRef.value) return;
  const scrollAmount = 340;
  kanbanBoardRef.value.scrollBy({
    left: direction === 'left' ? -scrollAmount : scrollAmount,
    behavior: 'smooth'
  });
}

// Gestión de Creación de Columnas
function openCreateColumnModal() {
  newColumnForm.label = '';
  newColumnForm.icon = '🎯';
  newColumnForm.color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)].hex;
  newColumnForm.final = false;
  showCreateColModal.value = true;
}

function saveNewColumn() {
  const trimmed = newColumnForm.label.trim();
  if (!trimmed) return;

  const slugKey = 'col_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 5);

  columns.value.push({
    key: slugKey,
    label: trimmed,
    icon: newColumnForm.icon || '📌',
    color: newColumnForm.color || '#105EFF',
    final: Boolean(newColumnForm.final)
  });

  showCreateColModal.value = false;

  // Auto-scroll al final del tablero
  setTimeout(() => {
    if (kanbanBoardRef.value) {
      kanbanBoardRef.value.scrollTo({
        left: kanbanBoardRef.value.scrollWidth,
        behavior: 'smooth'
      });
    }
  }, 100);
}

// Gestión de Edición de Columnas
function openEditColumnModal(col, index) {
  editingColumn.value = col;
  editColumnForm.label = col.label;
  editColumnForm.icon = col.icon || '📌';
  editColumnForm.color = col.color || '#105EFF';
  editColumnForm.final = Boolean(col.final);
  showEditColModal.value = true;
}

function saveEditedColumn() {
  if (!editingColumn.value || !editColumnForm.label.trim()) return;
  
  editingColumn.value.label = editColumnForm.label.trim();
  editingColumn.value.icon = editColumnForm.icon || '📌';
  editingColumn.value.color = editColumnForm.color || '#105EFF';
  editingColumn.value.final = Boolean(editColumnForm.final);

  columns.value = [...columns.value];
  showEditColModal.value = false;
  editingColumn.value = null;
}

// Gestión de Eliminación de Columnas
function openDeleteColumnModal(col, index) {
  deletingColumn.value = col;
  const remaining = columns.value.filter(c => c.key !== col.key);
  targetReassignColKey.value = remaining[0]?.key || 'nuevo';
  showDeleteColModal.value = true;
}

function getLeadsCountInColumn(colKey) {
  return leads.value.filter(l => l.status === colKey).length;
}

async function confirmDeleteColumn() {
  if (!deletingColumn.value) return;
  const colKey = deletingColumn.value.key;
  const targetKey = targetReassignColKey.value;

  // Reasignar leads que estén en esta columna
  const leadsToMove = leads.value.filter(l => l.status === colKey);
  for (const lead of leadsToMove) {
    await moveLeadToStatus(lead, targetKey);
  }

  // Eliminar columna de la lista
  columns.value = columns.value.filter(c => c.key !== colKey);
  showDeleteColModal.value = false;
  deletingColumn.value = null;
}

function confirmResetColumns() {
  if (confirm('¿Restablecer las columnas del funnel a su configuración original?')) {
    columns.value = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
  }
}

// Drag & Drop
function onDragStart(lead) {
  draggedLead.value = lead;
}

function onDragEnd() {
  hoveredColumn.value = null;
  draggedLead.value = null;
}

function onColumnDragLeave(colKey) {
  if (hoveredColumn.value === colKey) hoveredColumn.value = null;
}

function onDrop(columnKey) {
  hoveredColumn.value = null;
  const lead = draggedLead.value;
  draggedLead.value = null;
  if (!lead || lead.status === columnKey) return;
  moveLeadToStatus(lead, columnKey);
}

// Servicios API
async function fetchLeads() {
  const response = await apiFetch('/api/leads');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Error al obtener los leads.');
  leads.value = data.leads || [];
}

async function fetchAll() {
  isLoading.value = true;
  loadError.value = '';
  try {
    await fetchLeads();
  } catch (err) {
    loadError.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function moveLeadToStatus(lead, newStatus) {
  const previousStatus = lead.status;
  lead.status = newStatus;
  try {
    const response = await apiFetch(`/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al actualizar el estado.');

    lead.status = data.lead.status;
    if (data.project) {
      lead.project_id = data.project.id;
      lead.project_status = data.project.status;
      projectToast.value = data.project;
      setTimeout(() => {
        if (projectToast.value?.id === data.project.id) projectToast.value = null;
      }, 7000);
    }
  } catch (err) {
    lead.status = previousStatus;
    alert('No se pudo mover el lead: ' + err.message);
  }
}

async function submitQuote() {
  if (!selectedLead.value || !quoteAmount.value) return;
  quoteSubmitting.value = true;
  try {
    const response = await apiFetch(`/api/leads/${selectedLead.value.id}/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(quoteAmount.value), notes: quoteNotes.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Error al generar la cotización.');
    quoteSuccess.value = data.quote;
    showQuoteForm.value = false;
  } catch (err) {
    alert('No se pudo generar la cotización: ' + err.message);
  } finally {
    quoteSubmitting.value = false;
  }
}

// Formateadores y Utilitarios
function formatCurrency(amount, currency) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: currency || 'PEN' }).format(amount);
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function formatAcademic(level, field) {
  const shortLevel = (level || '').includes('Pregrado') ? 'Pregrado' : (level || '').includes('Maestría') ? 'Maestría' : 'Doctorado';
  const shortField = (field || '').split(' ')[0] || 'General';
  return `${shortLevel} · ${shortField}`;
}

function getLevelClass(level) {
  const l = (level || '').toLowerCase();
  if (l.includes('media-alta')) return 'level-media-alta';
  if (l.includes('alta')) return 'level-alta';
  if (l.includes('media')) return 'level-media';
  return 'level-baja';
}

onMounted(() => {
  fetchAll();
});
</script>

<style scoped>
.kanban-page-wrapper {
  padding: 1.75rem 2rem 3rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

/* Header */
.kanban-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 1.25rem;
}

.heading-icon {
  display: inline-block;
  transform: translateY(-2px);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

/* Botones con estilo moderno */
.btn-action-primary {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 0.6rem 1.15rem;
  font-size: 0.86rem;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 14px rgba(16, 94, 255, 0.35);
  transition: all 0.2s ease;
}

.btn-action-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(16, 94, 255, 0.5);
  filter: brightness(1.1);
}

.btn-action-secondary {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0.6rem 1.05rem;
  font-size: 0.86rem;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.btn-action-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.btn-action-ghost {
  background: transparent;
  color: var(--text-muted);
  border: 1px dashed var(--border-color);
  border-radius: 10px;
  padding: 0.55rem 0.9rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action-ghost:hover {
  color: var(--text-main);
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.04);
}

.btn-action-danger {
  background: linear-gradient(135deg, #F43F5E, #BE123C);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.6rem 1.15rem;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action-danger:hover {
  filter: brightness(1.1);
}

.spin-animation {
  display: inline-block;
  animation: spin 1s linear infinite;
}

/* Grid de Métricas */
.funnel-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 1rem;
}

.stat-card {
  background: var(--bg-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

.stat-icon-wrapper {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
}

.stat-icon-wrapper.blue { background: rgba(16, 94, 255, 0.15); border: 1px solid rgba(16, 94, 255, 0.3); }
.stat-icon-wrapper.green { background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); }
.stat-icon-wrapper.amber { background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); }
.stat-icon-wrapper.purple { background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.3); }

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.76rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--text-main);
  font-family: var(--font-heading);
}

/* Toolbar de Filtros y Desplazamiento */
.kanban-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  background: rgba(20, 20, 24, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  padding: 0.75rem 1rem;
}

.search-filter-box {
  position: relative;
  flex: 1;
  min-width: 260px;
  max-width: 440px;
}

.search-icon {
  position: absolute;
  left: 0.85rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.85rem;
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 2.25rem;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-main);
  font-size: 0.84rem;
  outline: none;
  transition: border-color 0.2s ease;
}

.search-input:focus {
  border-color: var(--primary);
}

.clear-search-btn {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.8rem;
}

.filter-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  color: var(--text-muted);
  padding: 0.3rem 0.75rem;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.filter-pill.active {
  background: rgba(16, 94, 255, 0.2);
  border-color: var(--primary);
  color: #ffffff;
  font-weight: 600;
}

.board-nav-arrows {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.board-nav-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.2s ease;
}

.board-nav-btn:hover {
  background: var(--primary);
  border-color: var(--primary);
  transform: scale(1.05);
}

.board-nav-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Tablero Kanban Viewport & Columnas */
.kanban-viewport {
  overflow-x: auto;
  padding-bottom: 1.25rem;
  margin-top: 0.5rem;
}

.kanban-columns-container {
  display: flex;
  gap: 1.15rem;
  align-items: flex-start;
  min-width: min-content;
}

/* Columna Individual */
.kanban-column {
  flex: 0 0 310px;
  width: 310px;
  max-width: 330px;
  background: rgba(22, 22, 26, 0.85);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  max-height: 720px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.kanban-column:hover {
  border-color: rgba(255, 255, 255, 0.18);
}

.kanban-column.is-final-column {
  border-color: rgba(16, 185, 129, 0.35);
}

.kanban-column.is-drag-over {
  border-color: var(--col-accent);
  background: rgba(16, 94, 255, 0.08);
  box-shadow: 0 0 20px var(--col-accent) 44;
  transform: translateY(-2px);
}

/* Barra superior de acento */
.column-top-accent {
  height: 4px;
  width: 100%;
  background: var(--col-accent);
  box-shadow: 0 0 10px var(--col-accent);
}

/* Cabecera de la Columna */
.kanban-column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 0.95rem;
  border-bottom: 1px solid var(--border-color);
  background: rgba(0, 0, 0, 0.25);
  gap: 0.5rem;
}

.col-title-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1;
  min-width: 0;
}

.col-icon {
  font-size: 1rem;
}

.col-label {
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text-main);
  font-family: var(--font-heading);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-count-badge {
  font-size: 0.7rem;
  font-weight: 700;
  border-radius: 9999px;
  padding: 0.15rem 0.5rem;
  border: 1px solid;
}

.col-actions-group {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.col-arrow-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.col-arrow-btn:hover:not(:disabled) {
  background: var(--col-accent);
  color: #ffffff;
  border-color: var(--col-accent);
}

.col-arrow-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.col-menu-btn {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.col-menu-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-main);
}

.col-menu-btn.delete-btn:hover {
  background: rgba(244, 63, 94, 0.2);
  color: var(--accent-rose);
}

/* Cuerpo de la Columna */
.kanban-column-body {
  flex: 1;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow-y: auto;
  min-height: 280px;
  max-height: 580px;
}

/* Tarjeta de Lead */
.kanban-lead-card {
  background: rgba(30, 30, 36, 0.85);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem;
  cursor: grab;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.kanban-lead-card:hover {
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
}

.kanban-lead-card:active {
  cursor: grabbing;
}

.card-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lead-id-tag {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.05);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.viability-pill {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid;
}

.level-alta {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.4);
  color: var(--accent-emerald);
}

.level-media-alta {
  background: rgba(76, 134, 255, 0.15);
  border-color: rgba(76, 134, 255, 0.4);
  color: var(--accent-cyan);
}

.level-media {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.4);
  color: var(--accent-amber);
}

.level-baja {
  background: rgba(154, 157, 163, 0.15);
  border-color: rgba(154, 157, 163, 0.4);
  color: var(--text-muted);
}

.card-lead-topic {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-main);
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
  font-size: 0.73rem;
  color: var(--text-muted);
}

.contact-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-academic-badge {
  font-size: 0.7rem;
  color: var(--text-sub);
  background: rgba(255, 255, 255, 0.04);
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
  width: fit-content;
}

.card-footer-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.35rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  margin-top: 0.2rem;
}

.project-created-tag {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--accent-emerald);
}

.lead-date-tag {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.quick-contact-actions {
  display: flex;
  gap: 0.3rem;
}

.quick-icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  transition: all 0.15s ease;
}

.quick-icon-btn:hover {
  transform: scale(1.1);
}

.quick-icon-btn.whatsapp:hover {
  background: rgba(37, 211, 102, 0.2);
  border-color: #25D366;
}

.quick-icon-btn.email:hover {
  background: rgba(16, 94, 255, 0.2);
  border-color: var(--primary);
}

/* Estado Vacío de Columna */
.column-empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  border: 1px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.6;
}

.empty-text {
  font-size: 0.76rem;
  margin: 0;
}

/* Pie de Columna */
.column-footer {
  padding: 0.5rem 0.85rem;
  border-top: 1px solid var(--border-color);
  font-size: 0.72rem;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0, 0, 0, 0.15);
}

.final-tag {
  color: var(--accent-emerald);
  font-weight: 600;
}

/* Tarjeta Fantasma: Añadir Nueva Columna */
.add-column-ghost-card {
  flex: 0 0 260px;
  width: 260px;
  min-height: 200px;
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.25s ease;
}

.add-column-ghost-card:hover {
  border-color: var(--primary);
  background: rgba(16, 94, 255, 0.06);
  transform: translateY(-2px);
}

.ghost-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
  padding: 1.5rem;
}

.ghost-plus {
  font-size: 1.8rem;
}

.ghost-text {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-main);
}

.ghost-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Modales */
.column-modal-card {
  max-width: 520px;
}

.lead-detail-card {
  max-width: 580px;
}

.modal-title {
  font-family: var(--font-heading);
  font-size: 1.1rem;
  color: var(--text-main);
  margin: 0;
}

.modal-close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.modal-close-btn:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.1);
}

.custom-input, .custom-select {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-main);
}

.custom-input:focus, .custom-select:focus {
  border-color: var(--primary);
}

.emoji-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.emoji-choice-btn {
  height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.emoji-choice-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: scale(1.1);
}

.emoji-choice-btn.selected {
  background: rgba(16, 94, 255, 0.25);
  border-color: var(--primary);
  box-shadow: 0 0 8px rgba(16, 94, 255, 0.5);
}

.color-picker-grid {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.4rem;
}

.color-choice-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-choice-btn:hover {
  transform: scale(1.15);
}

.color-choice-btn.selected {
  border-color: #ffffff;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.6);
  transform: scale(1.1);
}

.checkbox-group {
  margin-top: 1rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.84rem;
  color: var(--text-sub);
  cursor: pointer;
}

.custom-checkbox {
  width: 18px;
  height: 18px;
  accent-color: var(--primary);
}

.modal-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

/* Detalle del Lead en Modal */
.modal-lead-topic {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.4;
  margin: 0 0 1.25rem 0;
}

.lead-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.info-card-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem;
}

.panel-subtitle {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 0.5rem 0;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  margin-bottom: 0.4rem;
  font-size: 0.82rem;
}

.info-label {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.info-value {
  color: var(--text-main);
}

.info-value.selectable {
  user-select: all;
}

.lead-notes-box {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 0.85rem;
  margin-bottom: 1rem;
  font-size: 0.84rem;
  color: var(--text-sub);
}

.lead-project-badge-box {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 12px;
  padding: 0.85rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.lead-action-buttons {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.quote-form-section {
  margin-top: 1.25rem;
  padding: 1rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
}

.quote-heading {
  font-size: 0.95rem;
  color: var(--text-main);
  margin: 0 0 0.85rem 0;
}

/* Banner de Proyecto Creado Toast */
.project-created-banner {
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.45);
  border-radius: 12px;
  padding: 0.85rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.banner-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.banner-icon {
  font-size: 1.4rem;
}

.banner-subtext {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-sub);
}

.banner-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.banner-btn.primary {
  background: var(--accent-emerald);
  color: #0b2e21;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.78rem;
  padding: 0.4rem 0.85rem;
  border-radius: 8px;
}

.banner-btn.secondary {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
}

/* Transiciones */
.toast-slide-enter-active, .toast-slide-leave-active {
  transition: all 0.3s ease;
}
.toast-slide-enter-from, .toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .kanban-page-wrapper {
    padding: 1rem;
  }
  .lead-info-grid {
    grid-template-columns: 1fr;
  }
  .kanban-column {
    flex: 0 0 280px;
    width: 280px;
  }
}
</style>
