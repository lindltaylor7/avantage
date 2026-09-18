/**
 * Tipos de contrato iniciales. Solo los usa la migración
 * 20261008000000_create_contract_templates_tables.js para cargarlos en la
 * base de datos; desde ahí se editan y se crean otros en Contratos → "Tipos
 * de contrato". Cambiar este archivo NO modifica los tipos ya cargados.
 *
 * Marcadores disponibles en `intro`, `closing` y en las cláusulas (se
 * reemplazan al generar el documento, ver backend/services/contractDocument.js):
 *   {{empresa}} {{ruc}} {{domicilio_empresa}} {{representante}}
 *   {{cliente}} {{dni}} {{domicilio}} {{correo}} {{telefono}}
 *   {{servicio}} {{monto}} {{ciudad}} {{fecha}}
 *
 * ⚠️ Los textos son un punto de partida y deben ser revisados por el área
 * legal antes de usarse con clientes.
 */
export const CONTRACT_TEMPLATES = {
  cliente: {
    label: 'Contrato de cliente (locación de servicios)',
    title: 'CONTRATO DE LOCACIÓN DE SERVICIOS',
    intro:
      'Conste por el presente documento el Contrato de Locación de Servicios que celebran, de una parte, ' +
      '{{empresa}}, con RUC N.º {{ruc}}, con domicilio en {{domicilio_empresa}}, debidamente representada por ' +
      '{{representante}}, a quien en adelante se denominará EL LOCADOR; y, de la otra parte, {{cliente}}, ' +
      'identificado(a) con DNI N.º {{dni}}, con domicilio en {{domicilio}}, a quien en adelante se denominará ' +
      'EL CLIENTE; en los términos y condiciones siguientes:',
    clauses: [
      {
        title: 'OBJETO DEL CONTRATO',
        body:
          'Por el presente contrato, EL LOCADOR se obliga a prestar a favor de EL CLIENTE el siguiente servicio: ' +
          '{{servicio}}.\n\nEl servicio se prestará de manera autónoma, sin subordinación, conforme a lo dispuesto en ' +
          'los artículos 1764 y siguientes del Código Civil.'
      },
      {
        title: 'OBLIGACIONES DEL LOCADOR',
        body:
          'EL LOCADOR se obliga a: (a) prestar el servicio con diligencia, en los plazos acordados con EL CLIENTE; ' +
          '(b) informar a EL CLIENTE sobre el avance del servicio; (c) atender las observaciones razonables que ' +
          'EL CLIENTE formule dentro del alcance contratado; y (d) guardar reserva sobre la información de EL CLIENTE.'
      },
      {
        title: 'OBLIGACIONES DEL CLIENTE',
        body:
          'EL CLIENTE se obliga a: (a) proporcionar oportunamente la información y documentación necesarias para la ' +
          'prestación del servicio; (b) pagar la contraprestación en la forma y plazos pactados; y (c) comunicar ' +
          'por escrito cualquier cambio en el alcance del servicio.'
      },
      {
        title: 'CONTRAPRESTACIÓN Y FORMA DE PAGO',
        body:
          'Como contraprestación por el servicio, EL CLIENTE pagará a EL LOCADOR la suma total de {{monto}}.\n\n' +
          'El pago podrá realizarse en cuotas, según el cronograma acordado entre las partes, mediante depósito o ' +
          'transferencia a las cuentas que EL LOCADOR indique. El incumplimiento en el pago faculta a EL LOCADOR a ' +
          'suspender la prestación del servicio hasta su regularización.'
      },
      {
        title: 'PLAZO',
        body:
          'El presente contrato entra en vigencia a partir de su suscripción y se mantendrá vigente hasta la ' +
          'culminación del servicio contratado, conforme al cronograma acordado entre las partes.'
      },
      {
        title: 'CONFIDENCIALIDAD Y DATOS PERSONALES',
        body:
          'Las partes se obligan a mantener en reserva toda información a la que accedan con motivo del presente ' +
          'contrato. EL LOCADOR tratará los datos personales de EL CLIENTE únicamente para la ejecución de este ' +
          'contrato, conforme a la Ley N.º 29733, Ley de Protección de Datos Personales, y su reglamento.'
      },
      {
        title: 'RESOLUCIÓN DEL CONTRATO',
        body:
          'Cualquiera de las partes podrá resolver el presente contrato por incumplimiento de las obligaciones de la ' +
          'otra, previa comunicación escrita otorgando un plazo de quince (15) días calendario para subsanarlo, ' +
          'conforme al artículo 1429 del Código Civil. Los montos correspondientes a servicios ya prestados no serán ' +
          'materia de devolución.'
      },
      {
        title: 'DOMICILIO Y COMUNICACIONES',
        body:
          'Las partes señalan como sus domicilios los indicados en la introducción del presente contrato. Asimismo, ' +
          'aceptan como válidas las comunicaciones cursadas por correo electrónico ({{correo}}) o por WhatsApp al ' +
          'número {{telefono}}.'
      },
      {
        title: 'SOLUCIÓN DE CONTROVERSIAS',
        body:
          'Cualquier controversia derivada del presente contrato será resuelta, en primer término, mediante trato ' +
          'directo entre las partes. De no llegarse a un acuerdo, las partes se someten a la competencia de los jueces ' +
          'y tribunales de {{ciudad}}.'
      }
    ],
    closing:
      'Las partes declaran haber leído el presente contrato y, encontrándolo conforme a su voluntad, lo suscriben ' +
      'en señal de conformidad en la ciudad de {{ciudad}}, el {{fecha}}.'
  }
};
