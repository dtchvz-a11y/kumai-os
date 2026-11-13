// KUMAI OS · Hoy: lo urgente de todos los módulos en una pantalla
import { esc, dinero, sumarDias, fechaCorta, diasEntre } from '../util.js';
import { pedidoAbierto, pedidoActivo, saldo, moldesPedido, lunesDe } from '../modelo.js';
import { ticketHtml, moldesTxt } from './pedidos.js';
import { filaTarea, alertasHtml } from './produccion.js';
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

  let h = `<h2 class="viewtitle">Hoy</h2>
    <div class="grid2">
      <div class="stat"><div class="n">${deHoy.length}</div><div class="l">Entregas hoy</div></div>
      <div class="stat"><div class="n">${dinero(porCobrar.reduce((s, p) => s + saldo(p), 0))}</div><div class="l">Por cobrar · ${porCobrar.length} ${porCobrar.length === 1 ? 'pedido' : 'pedidos'}</div></div>
      <div class="stat"><div class="n">${moldesSemana}</div><div class="l">Moldes pedidos esta semana${meta ? ' · meta ' + meta : ''}</div></div>
      <div class="stat"><div class="n">${abiertos.length}</div><div class="l">Pedidos abiertos</div></div>
    </div>`;

  // Plan del motor: avisos, sabores de la semana por elegir y lo que toca producir hoy.
  const pl = app.plan(14), cfg = app.cfg();
  h += alertasHtml(pl) + recordatoriosHtml(app);
  const dia = deYmd(hoy).getDay();
  if (dia === 0 || dia >= 5) {
    const prox = sumarDias(lunes, 7), oper = app.sabores().filter(r => r.menu === 'operativo');
    if (!saboresDeSemana(cfg.semanas || {}, prox, oper).elegida) h += `<div class="alert ${dia === 0 ? '' : 'soft'}" data-accion="app.ir" data-vista="produccion" style="cursor:pointer"><div><b>Sabores de la próxima semana:</b> ${dia === 0 ? 'hoy es el último día para elegirlos' : 'elígelos a más tardar el domingo'}. Si no, se repiten los de esta semana.</div></div>`;
  }
  const deHoyTareas = pl.tareas.filter(t => t.fecha === hoy);
  const vit = stockVitrina(app.base, hoy).reduce((s, x) => s + x.hoy, 0);
  if (deHoyTareas.length || pl.dias[0].objetivo) {
    h += `<div class="taskday"><h3>Producción de hoy · ${horas(pl.dias[0].usadoMin)} h${pl.dias[0].objetivo ? ` · vitrina ${vit} de ${pl.dias[0].objetivo}` : ''}</h3>${deHoyTareas.map(t => filaTarea(app, t)).join('') || '<div class="mini" style="padding:12px 0">Nada que producir hoy.</div>'}</div>`;
  }

  // Lotes vivos: crema (7 días) y soletas (30 días).
  const lotes = app.base.lista('lotes').filter(l => l.disponible > 0 && l.tipo !== 'producto');
  for (const l of lotes) {
    const quedan = diasEntre(hoy, l.caducidad);
    const que = l.tipo === 'crema' ? `${l.disponible} ${l.disponible === 1 ? 'bote' : 'botes'} de crema base` : `${l.disponible} soletas`;
    if (quedan < 0) h += `<div class="alert"><div><b>Caducó:</b> ${esc(que)} del ${esc(fechaCorta(l.fechaProduccion))}. No se usa.</div></div>`;
    else if (quedan <= (l.tipo === 'crema' ? 2 : 5)) h += `<div class="alert soft"><div><b>Por caducar:</b> ${esc(que)} del ${esc(fechaCorta(l.fechaProduccion))}. ${quedan === 0 ? 'Último día.' : `Quedan ${quedan} ${quedan === 1 ? 'día' : 'días'}.`}</div></div>`;
  }
  if (atrasados.length) h += `<div class="alert"><div><b>${atrasados.length} ${atrasados.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'}:</b> ya pasó su fecha y no están marcados como entregados.</div></div>`;

  const bloque = (titulo, lista) => (lista.length ? `<div class="taskday"><h3>${titulo}</h3>${lista.map(p => ticketHtml(app, p)).join('')}</div>` : '');
  h += bloque('Atrasados', atrasados);
  h += bloque(`Hoy · ${moldesTxt(r1(deHoy.reduce((s, p) => s + moldesPedido(p), 0)))}`, deHoy);
  h += bloque(`Mañana · ${moldesTxt(r1(deManana.reduce((s, p) => s + moldesPedido(p), 0)))}`, deManana);
  if (!pedidos.length) h += `<div class="empty"><div class="big">Sin pedidos todavía</div>Toca el botón + para capturar el primero. Si quieres ver la app con datos, en Ajustes puedes cargar una semana de prueba de 10 o 35 moldes.</div>`;
  else if (!deHoy.length && !deManana.length && !atrasados.length) h += `<div class="empty">Nada que entregar hoy ni mañana.</div>`;

  // Próximos 7 días: cuántos moldes hay que tener listos cada día.
  let filas = '';
  for (let i = 2; i <= 8; i++) {
    const f = sumarDias(hoy, i); const del = abiertos.filter(p => p.fechaEntrega === f);
    if (del.length) filas += `<div class="insumorow"><span>${esc(fechaCorta(f))} · ${del.length} ${del.length === 1 ? 'pedido' : 'pedidos'}</span><span class="folio">${moldesTxt(r1(del.reduce((s, p) => s + moldesPedido(p), 0)))}</span></div>`;
  }
  if (filas) h += `<div class="cintillo">Los siguientes días</div>${filas}`;

  if (lotes.length) {
    h += `<div class="cintillo">Lotes vivos</div>` + lotes.map(l => {
      const dia = diasEntre(l.fechaProduccion, hoy) + 1;
      return `<div class="insumorow"><span>${l.tipo === 'crema' ? 'Crema base' : 'Soletas'} · ${esc(fechaCorta(l.fechaProduccion))}${l.tipo === 'crema' ? ` · día ${dia} de 7${dia >= 3 && dia <= 7 ? ' · re-batir' : ''}` : ''}</span><span class="folio">${l.disponible} ${l.tipo === 'crema' ? (l.disponible === 1 ? 'bote' : 'botes') : 'pzas'}</span></div>`;
    }).join('');
  }
  return h;
}

export const acciones = {};
