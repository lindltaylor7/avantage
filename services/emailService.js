import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Servicio para formatear y enviar el informe de viabilidad de tesis por correo electrónico
 */
export class EmailService {
  constructor() {
    this.transporter = null;
    this.initPromise = this.initializeTransporter();
  }

  /**
   * Configura el transportador de correo (SMTP real o Ethereal Mail automático)
   */
  async initializeTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      });
      console.log('✅ Nodemailer configurado con servidor SMTP:', host);
      return { isEthereal: false };
    } else {
      // Crear cuenta de pruebas instantánea en Ethereal
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('ℹ️ Nodemailer usando cuenta de prueba Ethereal:', testAccount.user);
        return { isEthereal: true, user: testAccount.user };
      } catch (err) {
        console.warn('⚠️ No se pudo inicializar Ethereal Mail, los correos se simularán localmente:', err.message);
        return { isEthereal: true, simulated: true };
      }
    }
  }

  /**
   * Genera el contenido HTML del reporte de tesis
   */
  buildHtmlReport(reportData) {
    const { topic, academicLevel, fieldOfStudy, timestamp, embeddingInfo, priorityAlignments, evaluation } = reportData;
    const dateFormatted = new Date(timestamp).toLocaleDateString('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const scoreColor = evaluation.overallViabilityScore >= 80 ? '#10B981' : (evaluation.overallViabilityScore >= 65 ? '#F59E0B' : '#EF4444');

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFC; color: #0F172A; margin: 0; padding: 20px; }
        .container { max-width: 680px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 10px 25px rgba(0,0,0,0.06); color: #0F172A; }
        .header { background: linear-gradient(135deg, #105EFF 0%, #1B1B1B 100%); padding: 32px 24px; text-align: center; color: #FFFFFF; }
        .header h1 { margin: 0; font-size: 24px; letter-spacing: -0.5px; color: #FFFFFF !important; }
        .header p { margin: 6px 0 0 0; color: #FFFFFF !important; opacity: 0.95; font-size: 14px; }
        .badge { display: inline-block; padding: 6px 16px; border-radius: 9999px; background: rgba(255,255,255,0.25); font-weight: bold; font-size: 13px; margin-top: 10px; text-transform: uppercase; color: #FFFFFF !important; }
        .content { padding: 28px 24px; color: #0F172A; background-color: #FFFFFF; }
        .card { background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A; }
        .score-box { text-align: center; padding: 22px; background-color: #F8FAFC; border-radius: 12px; border: 3px solid ${scoreColor}; margin-bottom: 24px; color: #0F172A; }
        .score-number { font-size: 52px; font-weight: 800; color: ${scoreColor} !important; line-height: 1; }
        .score-label { font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #334155 !important; margin-top: 8px; font-weight: 700; }
        .section-title { font-size: 17px; font-weight: 700; color: #105EFF !important; margin-top: 0; margin-bottom: 12px; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px; }
        ul { margin: 0; padding-left: 20px; color: #0F172A; }
        li { margin-bottom: 8px; line-height: 1.5; font-size: 14px; color: #0F172A !important; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #64748B !important; border-top: 1px solid #E2E8F0; background-color: #F8FAFC; }
      </style>
    </head>
    <body style="background-color: #F8FAFC; color: #0F172A; margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <div class="container" style="max-width: 680px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; color: #0F172A;">
        
        <!-- Header -->
        <div class="header" style="background: linear-gradient(135deg, #105EFF 0%, #1B1B1B 100%); padding: 32px 24px; text-align: center; color: #FFFFFF;">
          <h1 style="margin: 0; font-size: 24px; color: #FFFFFF !important; font-weight: 700;">Reporte de Viabilidad de Tesis</h1>
          <p style="margin: 6px 0 0 0; color: #FFFFFF !important; font-size: 14px;">Evaluación Automatizada para Universidades del Perú (SUNEDU / CONCYTEC)</p>
          <div class="badge" style="display: inline-block; padding: 6px 16px; border-radius: 9999px; background: rgba(255,255,255,0.25); font-weight: bold; font-size: 13px; margin-top: 10px; color: #FFFFFF !important;">
            NIVEL: ${academicLevel.toUpperCase()}
          </div>
        </div>

        <div class="content" style="padding: 28px 24px; background-color: #FFFFFF; color: #0F172A;">
          
          <!-- Puntuación Global -->
          <div class="score-box" style="text-align: center; padding: 22px; background-color: #F8FAFC; border-radius: 12px; border: 3px solid ${scoreColor}; margin-bottom: 24px; color: #0F172A;">
            <div class="score-number" style="font-size: 52px; font-weight: 800; color: ${scoreColor} !important; line-height: 1;">${evaluation.overallViabilityScore}%</div>
            <div class="score-label" style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: #334155 !important; margin-top: 8px; font-weight: 700;">ÍNDICE DE VIABILIDAD (${evaluation.viabilityLevel.toUpperCase()})</div>
          </div>

          <!-- Tema Evaluado -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">📌 Tema Evaluado</h3>
            <p style="font-size: 16px; font-weight: 700; color: #0F172A !important; margin: 0; line-height: 1.4;">"${topic}"</p>
            <p style="font-size: 13px; color: #475569 !important; margin-top: 8px;"><strong style="color: #0F172A !important;">Carrera / Campo:</strong> ${fieldOfStudy} | <strong style="color: #0F172A !important;">Fecha:</strong> ${dateFormatted}</p>
          </div>

          <!-- Desglose por Dimensiones -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">📊 Desglose de Evaluación (Dimensiones)</h3>
            <div style="margin-bottom: 10px; color: #0F172A !important; font-size: 14px; line-height: 1.9;">
              <strong style="color: #105EFF !important;">Rigor Metodológico:</strong> <span style="color: #0F172A !important; font-weight: 700;">${evaluation.dimensionScores.rigorMethodological}%</span><br/>
              <strong style="color: #105EFF !important;">Novedad y Aporte Académico:</strong> <span style="color: #0F172A !important; font-weight: 700;">${evaluation.dimensionScores.noveltyAcademic}%</span><br/>
              <strong style="color: #105EFF !important;">Pertinencia Nacional en Perú:</strong> <span style="color: #0F172A !important; font-weight: 700;">${evaluation.dimensionScores.peruRelevance}%</span><br/>
              <strong style="color: #105EFF !important;">Disponibilidad de Datos:</strong> <span style="color: #0F172A !important; font-weight: 700;">${evaluation.dimensionScores.dataAvailability}%</span>
            </div>
          </div>

          <!-- Pertinencia Nacional -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">🇵🇪 Pertinencia y Contexto Nacional</h3>
            <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #0F172A !important;">${evaluation.peruContextRelevance}</p>
            <p style="font-size: 13px; color: #105EFF !important; margin-top: 10px;"><strong style="color: #0F172A !important;">Línea CONCYTEC prioritaria:</strong> <span style="color: #105EFF !important; font-weight: 700;">${evaluation.keyConcytecLine}</span></p>
          </div>

          <!-- Fortalezas -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">✨ Fortalezas Principales</h3>
            <ul style="color: #0F172A !important; margin: 0; padding-left: 20px;">
              ${evaluation.strengths.map(s => `<li style="color: #0F172A !important; font-size: 14px; margin-bottom: 8px; line-height: 1.5;"><strong style="color: #059669 !important;">✓</strong> ${s}</li>`).join('')}
            </ul>
          </div>

          <!-- Riesgos -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">⚠️ Riesgos y Limitaciones</h3>
            <ul style="color: #0F172A !important; margin: 0; padding-left: 20px;">
              ${evaluation.risksAndLimitations.map(r => `<li style="color: #0F172A !important; font-size: 14px; margin-bottom: 8px; line-height: 1.5;"><strong style="color: #DC2626 !important;">!</strong> ${r}</li>`).join('')}
            </ul>
          </div>

          <!-- Delimitación -->
          <div class="card" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #1E3A8A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #1D4ED8 !important; margin: 0 0 12px 0; border-bottom: 2px solid #BFDBFE; padding-bottom: 6px;">💡 Delimitación Recomendada para Jurado</h3>
            <p style="font-size: 15px; font-style: italic; color: #1E3A8A !important; margin: 0; font-weight: 600; line-height: 1.5;">${evaluation.recommendedDelimitation}</p>
            <div style="margin-top: 12px; font-size: 13px; color: #1E40AF !important; line-height: 1.7;">
              <strong style="color: #1E3A8A !important;">Enfoque sugerido:</strong> ${evaluation.suggestedMethodology.approach}<br/>
              <strong style="color: #1E3A8A !important;">Diseño:</strong> ${evaluation.suggestedMethodology.design}<br/>
              <strong style="color: #1E3A8A !important;">Ámbito / Muestra:</strong> ${evaluation.suggestedMethodology.sampleOrDataTarget}
            </div>
          </div>

          <!-- Vector Embedding -->
          <div class="card" style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px; color: #0F172A;">
            <h3 class="section-title" style="font-size: 17px; font-weight: 700; color: #105EFF !important; margin: 0 0 12px 0; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">🧠 Análisis de Embedding Vectorial (Ollama)</h3>
            <p style="font-size: 13px; margin: 0; color: #334155 !important; line-height: 1.7;">
              <strong style="color: #0F172A !important;">Modelo de Embedding:</strong> ${embeddingInfo.model} (${embeddingInfo.source})<br/>
              <strong style="color: #0F172A !important;">Dimensiones de Vector:</strong> ${embeddingInfo.dimension} dimensiones<br/>
              <strong style="color: #0F172A !important;">Top Alineación:</strong> <span style="color: #059669 !important; font-weight: 700;">${priorityAlignments[0].priorityArea} (${priorityAlignments[0].alignmentPercentage}% coincidencia)</span>
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer" style="text-align: center; padding: 20px; font-size: 12px; color: #64748B !important; border-top: 1px solid #E2E8F0; background-color: #F8FAFC;">
          <p style="margin: 0; color: #64748B !important;">Generado automáticamente mediante Node.js, Ollama Cloud Engine y Nodemailer.</p>
          <p style="margin: 4px 0 0 0; color: #64748B !important;">Avantage Group — Plataforma de Viabilidad de Tesis © ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  /**
   * Genera el contenido HTML de una cotización enviada a un lead
   */
  buildHtmlQuote({ topic, amount, currency, notes }) {
    const dateFormatted = new Date().toLocaleDateString('es-PE', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const amountFormatted = new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(amount);

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="background-color: #F8FAFC; color: #0F172A; margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; color: #0F172A;">
        <div style="background: linear-gradient(135deg, #105EFF 0%, #1B1B1B 100%); padding: 32px 24px; text-align: center; color: #FFFFFF;">
          <h1 style="margin: 0; font-size: 22px; color: #FFFFFF !important; font-weight: 700;">Cotización de Servicio</h1>
          <p style="margin: 6px 0 0 0; color: #FFFFFF !important; font-size: 14px;">Asesoría y Desarrollo de Tesis — Perú</p>
        </div>
        <div style="padding: 28px 24px; background-color: #FFFFFF; color: #0F172A;">
          <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
            <h3 style="font-size: 16px; font-weight: 700; color: #105EFF !important; margin: 0 0 10px 0;">📌 Proyecto</h3>
            <p style="font-size: 15px; font-weight: 600; color: #0F172A !important; margin: 0; line-height: 1.4;">"${topic}"</p>
            <p style="font-size: 13px; color: #475569 !important; margin-top: 8px;">Fecha de cotización: ${dateFormatted}</p>
          </div>
          <div style="text-align: center; padding: 22px; background-color: #F8FAFC; border-radius: 12px; border: 3px solid #10B981; margin-bottom: 20px;">
            <div style="font-size: 40px; font-weight: 800; color: #10B981 !important; line-height: 1;">${amountFormatted}</div>
            <div style="font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #334155 !important; margin-top: 6px; font-weight: 700;">Monto Cotizado</div>
          </div>
          ${notes ? `
          <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 12px; padding: 18px; margin-bottom: 20px;">
            <h3 style="font-size: 16px; font-weight: 700; color: #105EFF !important; margin: 0 0 10px 0;">📝 Detalle</h3>
            <p style="font-size: 14px; color: #0F172A !important; margin: 0; line-height: 1.6; white-space: pre-line;">${notes}</p>
          </div>` : ''}
          <p style="font-size: 12px; color: #64748B !important; text-align: center;">Esta cotización es referencial y válida por 15 días calendario.</p>
        </div>
        <div style="text-align: center; padding: 20px; font-size: 12px; color: #64748B !important; border-top: 1px solid #E2E8F0; background-color: #F8FAFC;">
          <p style="margin: 0; color: #64748B !important;">Avantage Group © ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  /**
   * Envía la cotización al lead por correo electrónico
   */
  async sendQuoteEmail(recipientEmail, quoteData) {
    await this.initPromise;

    const fromAddress = process.env.SMTP_FROM || '"Avantage Group" <tesis@avantagegroup.pe>';
    const htmlContent = this.buildHtmlQuote(quoteData);

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: `💰 Cotización: "${quoteData.topic.substring(0, 50)}..."`,
      html: htmlContent
    };

    try {
      if (this.transporter) {
        const info = await this.transporter.sendMail(mailOptions);
        const previewUrl = nodemailer.getTestMessageUrl(info) || null;

        return {
          success: true,
          messageId: info.messageId,
          recipient: recipientEmail,
          previewUrl,
          htmlContent,
          mode: previewUrl ? 'Ethereal Mail (Prueba activa)' : 'Servidor SMTP Directo'
        };
      }
    } catch (error) {
      console.error('Error al enviar cotización:', error);
      return {
        success: false,
        error: error.message,
        htmlContent,
        mode: 'Simulación (Fallback)'
      };
    }
  }

  /**
   * Envía el correo al destinatario
   */
  async sendReportEmail(recipientEmail, reportData) {
    await this.initPromise;

    const fromAddress = process.env.SMTP_FROM || '"Avantage Group" <tesis@avantagegroup.pe>';
    const htmlContent = this.buildHtmlReport(reportData);

    const mailOptions = {
      from: fromAddress,
      to: recipientEmail,
      subject: `🎓 Reporte de Viabilidad de Tesis: "${reportData.topic.substring(0, 50)}..."`,
      html: htmlContent
    };

    try {
      if (this.transporter) {
        const info = await this.transporter.sendMail(mailOptions);
        const previewUrl = nodemailer.getTestMessageUrl(info) || null;

        return {
          success: true,
          messageId: info.messageId,
          recipient: recipientEmail,
          previewUrl,
          htmlContent,
          mode: previewUrl ? 'Ethereal Mail (Prueba activa)' : 'Servidor SMTP Directo'
        };
      }
    } catch (error) {
      console.error('Error al enviar correo:', error);
      return {
        success: false,
        error: error.message,
        htmlContent,
        mode: 'Simulación (Fallback)'
      };
    }
  }
}
