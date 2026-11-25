// KUMAI OS · Hoy: lo urgente de todos los módulos en una pantalla
import { esc, dinero, sumarDias, fechaCorta, diasEntre } from '../util.js';
import { pedidoAbierto, pedidoActivo, saldo, moldesPedido, lunesDe } from '../modelo.js';
import { ticketHtml, moldesTxt } from './pedidos.js';
import { filaTarea, alertasHtml, siguienteHtml, vitrinaHtml } from './produccion.js';
import { saboresDeSemana, horas } from '../motor.js';
import { stockVitrina } from '../operacion.js';
import { deYmd } from '../util.js';
import { recordatoriosHtml } from './dinero.js';

const r1 = n => Math.round(n * 10) / 10;

export function render(app) {
  const hoy = app.hoy(), manana = sumarDias(hoy, 1);
  const pedidos = app.base.lista('pedidos');
  const abiertos = pedidos.filter(pedidoAbierto);
  const deHoy = abiertos.filter(p => p.fechaEntrega === hoy), deManana = abiertos.filter(p => p.fechaEntrega === manana);
  const atrasados = abiertos.filter(p => p.fechaEntrega < hoy);
  const porCobrar = pedidos.filter(p => pedidoActivo(p) && saldo(p) > 0);
  const lunes = lunesDe(hoy), domingo = sumarDias(lunes, 6);
  const semana = pedidos.filter(p => pedidoActivo(p) && p.fechaEntrega >= lunes && p.fechaEntrega <= domingo);
  const moldesSemana = r1(semana.reduce((s, p) => s + moldesPedido(p), 0));
  const meta = (app.cfg().metas || {}).moldesSemana;

  const pl = app.plan(14), cfg = app.cfg();
  const cobrar = porCobrar.reduce((s, p) => s + saldo(p), 0);
  const stats = `<div class="grid3">
      <div class="stat"><div class="n acento">${deHoy.length}</div><div class="l">${deHoy.length === 1 ? 'Entrega hoy' : 'Entregas hoy'}</div></div>
      <div class="stat"><div class="n">${dinero(cobrar)}</div><div class="l">Por cobrar · ${porCobrar.length}</div></div>
      <div class="stat"><div class="n">${moldesSemana}${meta ? `<small>/${meta}</small>` : ''}</div><div class="l">Moldes semana</div></div>
    </div>`;

  // Avisos: motor, fiscales, sabores por elegir, lotes por caducar y atrasados.
  let avisos = recordatoriosHtml(app);
  const dia = deYmd(hoy).getDay();
  if (dia === 0 || dia >= 5) {
    const prox = sumarDias(lunes, 7), oper = app.sabores().filter(r => r.menu === 'operativo');
    if (!saboresDeSemana(cfg.semanas || {}, prox, oper).elegida) avisos += `<div class="alert ${dia === 0 ? '' : 'soft'}" data-accion="app.ir" data-vista="produccion" style="cursor:pointer"><div><b>Sabores de la próxima semana:</b> ${dia === 0 ? 'hoy es el último día para elegirlos' : 'elígelos a más tardar el domingo'}. Si no, se repiten los de esta semana.</div></div>`;
  }
  const lotes = app.base.lista('lotes').filter(l => l.disponible > 0 && l.tipo !== 'producto');
  for (const l of lotes) {
    const quedan = diasEntre(hoy, l.caducidad);
    const que = l.tipo === 'crema' ? `${l.disponible} ${l.disponible === 1 ? 'bote' : 'botes'} de crema base` : `${l.disponible} soletas`;
    if (quedan < 0) avisos += `<div class="alert"><div><b>Caducó:</b> ${esc(que)} del ${esc(fechaCorta(l.fechaProduccion))}. No se usa.</div></div>`;
    else if (quedan <= (l.tipo === 'crema' ? 2 : 5)) avisos += `<div class="alert soft"><div><b>Por caducar:</b> ${esc(que)} del ${esc(fechaCorta(l.fechaProduccion))}. ${quedan === 0 ? 'Último día.' : `Quedan ${quedan} ${quedan === 1 ? 'día' : 'días'}.`}</div></div>`;
  }
  if (atrasados.length) avisos += `<div class="alert"><div><b>${atrasados.length} ${atrasados.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'}:</b> ya pasó su fecha y no están marcados como entregados.</div></div>`;

  // Producción de hoy (si no hay "lo siguiente" hoy, se ve aquí el mínimo de vitrina).
  const deHoyTareas = pl.tareas.filter(t => t.fecha === hoy);
  const vit = stockVitrina(app.base, hoy).reduce((s, x) => s + x.hoy, 0);
  let produccion = '';
  if (deHoyTareas.length > 1) produccion = `<div class="taskday"><h3>Producción de hoy · ${horas(pl.dias[0].usadoMin)} h${pl.dias[0].objetivo ? ` · vitrina ${vit} de ${pl.dias[0].objetivo}` : ''}</h3>${deHoyTareas.map(t => filaTarea(app, t)).join('')}</div>`;

  // Entregas.
  const bloque = (titulo, lista) => (lista.length ? `<div class="taskday"><h3>${titulo}</h3>${lista.map(p => ticketHtml(app, p)).join('')}</div>` : '');
  let entregas = bloque('Atrasados', atrasados)
    + bloque(`Hoy · ${moldesTxt(r1(deHoy.reduce((s, p) => s + moldesPedido(p), 0)))}`, deHoy)
    + bloque(`Mañana · ${moldesTxt(r1(deManana.reduce((s, p) => s + moldesPedido(p), 0)))}`, deManana);
  if (!pedidos.length) entregas += `<div class="empty"><div class="big">Sin pedidos todavía</div>Toca el botón + para capturar el primero. Si quieres ver la app con datos, en Ajustes puedes cargar una semana de prueba de 10 o 35 moldes.</div>`;
  else if (!deHoy.length && !deManana.length && !atrasados.length) entregas += `<div class="empty">Nada que entregar hoy ni mañana.</div>`;

  // Próximos 7 días y lotes vivos.
  let filas = '';
  for (let i = 2; i <= 8; i++) {
    const f = sumarDias(hoy, i); const del = abiertos.filter(p => p.fechaEntrega === f);
    if (del.length) filas += `<div class="insumorow"><span>${esc(fechaCorta(f))} · ${del.length} ${del.length === 1 ? 'pedido' : 'pedidos'}</span><span class="folio">${moldesTxt(r1(del.reduce((s, p) => s + moldesPedido(p), 0)))}</span></div>`;
  }
  let despues = filas ? `<div class="taskday"><h3>Los siguientes días</h3>${filas}</div>` : '';
  if (lotes.length) {
    despues += `<div class="taskday"><h3>Lotes vivos</h3>` + lotes.map(l => {
      const d = diasEntre(l.fechaProduccion, hoy) + 1;
      return `<div class="insumorow"><span>${l.tipo === 'crema' ? 'Crema base' : 'Soletas'} · ${esc(fechaCorta(l.fechaProduccion))}${l.tipo === 'crema' ? ` · día ${d} de 7${d >= 3 && d <= 7 ? ' · re-batir' : ''}` : ''}</span><span class="folio">${l.disponible} ${l.tipo === 'crema' ? (l.disponible === 1 ? 'bote' : 'botes') : 'pzas'}</span></div>`;
    }).join('') + '</div>';
  }
  const hayVitrina = stockVitrina(app.base, hoy).length || pl.dias[0].objetivo;

  return `<h2 class="viewtitle">Hoy</h2>
    <div class="cols"><div class="col-a">
      <div class="o1">${siguienteHtml(app, pl, { verPlan: true })}</div>
      <div class="o2">${stats}</div>
      <div class="o3">${alertasHtml(pl, avisos)}</div>
      <div class="o5">${entregas}${produccion}</div>
    </div><div class="col-b">
      <div class="o4">${hayVitrina ? vitrinaHtml(app, pl, { completa: false }) : ''}</div>
      <div class="o6">${despues}</div>
    </div></div>`;
}

export const acciones = {};
