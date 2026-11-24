// KUMAI OS · mensajes de WhatsApp
// Texto base: Manual_Marca_KUMAI §3.3 (voz directa, sin signos de admiración, sin racimos de emoji).
import { dinero, fechaLarga, sumarDias, diaSemana } from './util.js';
import { textoLinea, totalPedido, pagado, saldo, normalizarTelefono } from './modelo.js';

export function mensajeConfirmacion(p, recetasPorId) {
  const l = ['Pedido confirmado. Folio ' + p.folio + '.'];
  for (const x of p.lineas) l.push(`${textoLinea(x, recetasPorId)} — ${dinero(x.cantidad * x.precioUnit)}`);
  if (Number(p.envio) > 0) l.push(`Envío — ${dinero(p.envio)}`);
  if (Number(p.descuento) > 0) l.push(`Descuento — ${dinero(-p.descuento)}`);
  const pg = pagado(p), total = totalPedido(p);
  if ((p.lineas.length > 1 || p.envio || p.descuento) || pg > 0) {
    let t = `Total: ${dinero(total)}.`;
    if (pg > 0 && saldo(p) > 0) t += ` Anticipo recibido: ${dinero(pg)}. Resta: ${dinero(saldo(p))}.`;
    else if (pg > 0) t += ' Pagado.';
    l.push(t);
  }
  l.push(`Entrega: ${fechaLarga(p.fechaEntrega)}${p.horaEntrega ? ', ' + p.horaEntrega : ''}.`);
  l.push(`Se arma el ${diaSemana(sumarDias(p.fechaEntrega, -1))} y pasa la noche en frío. Cualquier ajuste, me dices.`);
  return l.join('\n');
}

export function mensajeRecordatorio(p, recetasPorId) {
  const que = p.lineas.length === 1 ? textoLinea(p.lineas[0], recetasPorId) : 'tu pedido';
  return `Hoy${p.horaEntrega ? ' a las ' + p.horaEntrega : ''} está listo: ${que}. Sale directo del frío.`;
}

export function mensajeSaldo(p) {
  return `Pedido ${p.folio}: queda un saldo de ${dinero(saldo(p))}. Me avisas cuando lo tengas y te confirmo.`;
}

/** Enlace wa.me con el texto ya escrito. Sin teléfono abre WhatsApp para elegir contacto. */
export function enlaceWhatsApp(telefono, texto) {
  const d = normalizarTelefono(telefono);
  const num = d.length === 10 ? '52' + d : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
