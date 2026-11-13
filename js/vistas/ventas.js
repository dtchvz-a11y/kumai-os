// KUMAI OS · Ventas y demanda: tableros, clientes y eventos
import { esc, dinero, sumarDias, fechaCorta, fechaLarga, clonar } from '../util.js';
import { costoReceta } from '../costeo.js';
import * as an from '../analisis.js';
import { totalPedido } from '../modelo.js';

const estado = app => app.ui.ven || (app.ui.ven = { sub: 'tableros', semanas: 4 });
const datos = app => ({ pedidos: app.base.lista('pedidos'), cortes: app.base.lista('cortes') });
const barras = (filas, valor, etiqueta, pie) => {
  const max = Math.max(1, ...filas.map(valor));
  return filas.map(f => `<div class="barra"><div class="entre"><span>${esc(etiqueta(f))}</span><b>${esc(pie(f))}</b></div><i style="width:${Math.max(2, Math.round(valor(f) / max * 100))}%"></i></div>`).join('');
};

export function render(app) {
  const u = estado(app);
  let h = `<h2 class="viewtitle">Ventas</h2>
    <div class="seg">${[['tableros', 'Tableros'], ['clientes', 'Clientes'], ['eventos', 'Eventos']].map(([k, t]) => `<button class="${u.sub === k ? 'on' : ''}" data-accion="ventas.sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
  return h + (u.sub === 'tableros' ? tablerosHtml(app, u) : u.sub === 'clientes' ? clientesHtml(app) : eventosHtml(app));
}

function tablerosHtml(app, u) {
  const hoy = app.hoy(), R = app.recetasPorId(), d = datos(app);
  const desde = u.semanas ? sumarDias(hoy, -7 * u.semanas + 1) : null;
  const t = an.tableros(d, desde, hoy), nom = id => (R.get(id) ? R.get(id).nombre : 'Sabor eliminado');
  let h = `<div class="chips">${[[4, '4 semanas'], [12, '12 semanas'], [0, 'Todo']].map(([n, x]) => `<button class="chip ${u.semanas === n ? 'on' : ''}" data-accion="ventas.periodo" data-n="${n}">${x}</button>`).join('')}</div>`;
  if (!t.total.rebanadas) return h + `<div class="empty"><div class="big">Sin ventas en este periodo</div>Aquí aparecen los pedidos por fecha de entrega y las ventas de mostrador. Los datos de prueba no cuentan.</div>`;
  h += `<div class="grid2"><div class="stat"><div class="n">${t.total.rebanadas}</div><div class="l">Rebanadas vendidas</div></div><div class="stat"><div class="n">${dinero(Math.round(t.total.ingreso))}</div><div class="l">Venta · ${dinero(Math.round(t.total.ingreso / t.total.rebanadas))} por rebanada</div></div></div>`;
  // rotación y venta esperada
  const oper = app.sabores().filter(r => r.menu === 'operativo'), rot = an.rotacion(d, oper, hoy);
  if (rot.candidatos.length) h += `<div class="alert"><div><b>Rotación:</b> ${rot.candidatos.map(nom).map(esc).join(', ')} quedó dos veces o más en último lugar en los últimos ${rot.fines} fines de semana. Según la regla del recetario, le toca salir del menú operativo.</div></div>`;
  const cfg = app.cfg(), sug = an.ventaEsperadaSugerida(d.cortes, (cfg.mostrador || {}).minimoMoldes || {}, hoy);
  if (sug.pct !== null && sug.pct !== (cfg.mostrador || {}).ventaEsperadaPct) h += `<div class="alert soft"><div><b>Venta esperada de mostrador:</b> en ${sug.dias} días con datos vendiste en promedio el ${sug.pct}% del mínimo. El plan supone ${(cfg.mostrador || {}).ventaEsperadaPct}%.
    <div><button class="chip" style="margin-top:8px;background:var(--crema)" data-accion="ventas.usarVenta" data-pct="${sug.pct}">Usar ${sug.pct}% en el plan</button></div></div></div>`;
  h += `<div class="taskday"><h3>Por sabor</h3>${barras(t.porSabor, f => f.rebanadas, f => nom(f.clave), f => `${f.rebanadas} · ${dinero(Math.round(f.ingreso))}`)}</div>
    <div class="taskday"><h3>Por canal</h3>${barras(t.porCanal, f => f.ingreso, f => f.clave, f => `${dinero(Math.round(f.ingreso))} · ${Math.round(f.ingreso / t.total.ingreso * 100)}%`)}</div>
    <div class="taskday"><h3>Por día de la semana</h3>${barras(t.porDia, f => f.rebanadas, f => f.nombre, f => `${f.rebanadas} reb`)}</div>
    <div class="taskday"><h3>Por semana</h3>${barras(t.porSemana, f => f.ingreso, f => 'Semana del ' + fechaCorta(f.clave).slice(4), f => `${f.rebanadas} reb · ${dinero(Math.round(f.ingreso))}`)}</div>`;
  const st = an.sellThrough(d.cortes, desde, hoy);
  h += `<div class="taskday"><h3>Sell-through de mostrador</h3>${st.length ? `<table class="tabla"><tr><th>Sabor</th><th class="r">Vendidas</th><th class="r">Sobraron</th><th class="r">%</th></tr>
    ${st.map(x => `<tr><td>${esc(nom(x.recetaId))}<small>${x.dias} ${x.dias === 1 ? 'día' : 'días'} con corte</small></td><td class="r">${x.vendidas} de ${x.disponibles}</td><td class="r">${x.sobrantes}</td><td class="r"><b>${x.pct === null ? '—' : x.pct + '%'}</b></td></tr>`).join('')}</table>
    <div class="mini">Vendidas entre disponibles, de los días en que hubo corte. Para que sea confiable, haz el conteo al cierre cada día de venta.</div>` : '<div class="mini" style="padding:12px 0">Todavía no hay cortes de mostrador. Se generan con "Vender 1" o con el conteo al cierre, en Producción.</div>'}</div>`;
  return h;
}

function clientesHtml(app) {
  const c = an.clientesAnalisis(app.base.lista('clientes'), app.base.lista('pedidos'), app.hoy());
  if (!c.total) return `<div class="empty"><div class="big">Sin clientes todavía</div>Se crean solos al capturar pedidos.</div>`;
  const fila = (f, extra) => `<div class="recrow"><div class="crece"><b>${esc(f.cliente.nombre)}</b><span>${f.pedidos} ${f.pedidos === 1 ? 'pedido' : 'pedidos'} · ${dinero(Math.round(f.gastado))} · última ${esc(fechaCorta(f.ultimaCompra))}${f.cliente.telefono ? ` · <a href="https://wa.me/52${esc(f.cliente.telefono)}" target="_blank" rel="noopener">${esc(f.cliente.telefono)}</a>` : ''}</span></div><div class="der"><span class="num">${extra(f)}</span></div></div>`;
  return `<div class="grid2"><div class="stat"><div class="n">${c.total}</div><div class="l">Clientes con pedido</div></div><div class="stat"><div class="n">${c.recompraPct}%</div><div class="l">Han vuelto a comprar</div></div></div>
    <div class="taskday"><h3>Recurrentes · ${c.recurrentes.length}</h3>${c.recurrentes.map(f => fila(f, x => x.pedidos + '×')).join('') || '<div class="mini" style="padding:12px 0">Nadie ha repetido todavía.</div>'}</div>
    <div class="taskday"><h3>Para reactivar · ${c.reactivar.length}</h3>${c.reactivar.map(f => fila(f, x => x.diasSinComprar + ' d')).join('') || '<div class="mini" style="padding:12px 0">Nadie lleva más de 30 días sin comprar.</div>'}</div>
    <div class="mini">Para reactivar: más de 30 días desde su última compra, ordenados por lo que han gastado. Rappi y mostrador no cuentan como clientes.</div>`;
}

function costoRebanadaDe(app) { const ctx = app.ctx(), R = app.recetasPorId(); return id => (R.get(id) ? costoReceta(R.get(id), ctx).rebanadaConBuffer : 0); }
function eventosHtml(app) {
  const evs = app.base.lista('eventos').sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio)), em = an.embudoEventos(evs), d = datos(app), costo = costoRebanadaDe(app);
  let h = `<div class="acciones"><button class="secondary" data-accion="ventas.evento" data-id="">Nuevo evento</button></div>`;
  if (!evs.length) return h + `<div class="empty"><div class="big">Sin eventos</div>Anota aquí FICO13, el Andador y los pedidos de evento: estatus, costo de participación y cuántos moldes llevar.</div>`;
  h += `<div class="grid2"><div class="stat"><div class="n">${em.cotizado}</div><div class="l">Cotizados</div></div><div class="stat"><div class="n">${em.confirmado + em.anticipo}</div><div class="l">Confirmados o con anticipo</div></div>
    <div class="stat"><div class="n">${em.entregado + em.cerrado}</div><div class="l">Entregados o cerrados</div></div><div class="stat"><div class="n">${em.conversionPct ?? '—'}%</div><div class="l">De cotizado a ganado · ${em.cancelado} cancelados</div></div></div>`;
  h += evs.map(e => { const r = an.resultadoEvento(e, d, costo); return `<div class="ticket" data-accion="ventas.verEvento" data-id="${esc(e.id)}"><div class="row1"><span class="folio">${esc(e.nombre)}</span><span class="tag ${e.estatus === 'cancelado' ? '' : 'OP'}">${esc(e.estatus)}</span></div>
    <div class="detalle">${esc(fechaCorta(e.fechaInicio))}${e.fechaFin && e.fechaFin !== e.fechaInicio ? ' a ' + esc(fechaCorta(e.fechaFin)) : ''} · ${esc(an.TIPOS_EVENTO[e.tipo] || '')}${e.sede ? ' · ' + esc(e.sede) : ''}</div>
    <div class="foot"><span>Venta ${dinero(Math.round(r.ingreso))} · costo ${dinero(Math.round(r.participacion + r.costoProducto))}</span><span>${r.ingreso ? 'Utilidad ' + dinero(Math.round(r.utilidad)) : `${(e.plan || []).reduce((s, l) => s + l.moldes, 0)} moldes planeados`}</span></div></div>`; }).join('');
  return h;
}

function formEvento(app) {
  const e = app.ui.evento, oper = app.sabores();
  const plan = new Map((e.plan || []).map(l => [l.recetaId, l.moldes]));
  return `<h3>${e.id ? 'Editar evento' : 'Nuevo evento'}</h3>
    <label for="eNom">Nombre</label><input id="eNom" value="${esc(e.nombre || '')}" placeholder="Estación Navideña FICO13">
    <label for="eSede">Sede</label><input id="eSede" value="${esc(e.sede || '')}">
    <div class="dos"><div><label for="eIni">Empieza</label><input id="eIni" type="date" value="${esc(e.fechaInicio || app.hoy())}"></div><div><label for="eFin">Termina</label><input id="eFin" type="date" value="${esc(e.fechaFin || e.fechaInicio || app.hoy())}"></div></div>
    <div class="dos"><div><label for="eTipo">Tipo</label><select id="eTipo">${Object.entries(an.TIPOS_EVENTO).map(([k, t]) => `<option value="${k}" ${e.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label for="eEst">Estatus</label><select id="eEst">${an.ESTATUS_EVENTO.map(s => `<option ${e.estatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
    <label for="eCosto">Costo de participación $</label><input id="eCosto" type="number" inputmode="decimal" min="0" value="${e.costoParticipacion ?? ''}" placeholder="0">
    <label>Moldes a llevar, por sabor</label>
    ${oper.filter(r => r.menu === 'operativo' || plan.has(r.id)).map(r => `<div class="stockfila"><div><b>${esc(r.nombre)}</b><span>${r.menu === 'operativo' ? 'operativo' : 'reserva'}</span></div><input type="number" inputmode="numeric" min="0" placeholder="0" data-plan="${esc(r.id)}" value="${plan.get(r.id) || ''}"></div>`).join('')}
    <div class="smallnote">Con estatus "confirmado" o "anticipo", estos moldes entran al plan de producción para el primer día del evento, con la prioridad de un pedido.</div>
    <label for="eNotas">Notas</label><textarea id="eNotas">${esc(e.notas || '')}</textarea>
    <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="ventas.guardarEvento">Guardar</button></div>`;
}
function detalleEvento(app, e) {
  const r = an.resultadoEvento(e, datos(app), costoRebanadaDe(app)), R = app.recetasPorId();
  const ligados = app.base.lista('pedidos').filter(p => p.eventoId === e.id);
  const gasto = app.base.lista('gastos').find(g => g.eventoId === e.id);
  return `<h3>${esc(e.nombre)}</h3><div class="mini">${esc(fechaLarga(e.fechaInicio))}${e.fechaFin && e.fechaFin !== e.fechaInicio ? ' a ' + esc(fechaLarga(e.fechaFin)) : ''} · ${esc(an.TIPOS_EVENTO[e.tipo] || '')}${e.sede ? ' · ' + esc(e.sede) : ''}</div>
    <label>Estatus</label><div class="chips">${an.ESTATUS_EVENTO.map(s => `<button class="chip ${e.estatus === s ? 'on' : ''}" data-accion="ventas.estatusEvento" data-id="${esc(e.id)}" data-estatus="${s}">${s}</button>`).join('')}</div>
    <table class="tabla"><tr><td>Venta<small>${r.pedidos} ${r.pedidos === 1 ? 'pedido ligado' : 'pedidos ligados'} y ventas de mostrador con este punto de venta · ${r.rebanadas} rebanadas</small></td><td class="r">${dinero(Math.round(r.ingreso))}</td></tr>
      <tr><td>Costo de participación</td><td class="r">${dinero(-r.participacion)}</td></tr><tr><td>Costo del producto<small>ingredientes con buffer</small></td><td class="r">${dinero(-Math.round(r.costoProducto))}</td></tr>
      <tr class="total"><td>Utilidad del evento</td><td class="r">${dinero(Math.round(r.utilidad))}</td></tr></table>
    ${(e.plan || []).length ? `<div class="cintillo">Moldes a llevar</div>${e.plan.map(l => `<div class="insumorow"><span>${esc(R.get(l.recetaId) ? R.get(l.recetaId).nombre : '?')}</span><span class="folio">${l.moldes}</span></div>`).join('')}` : ''}
    ${ligados.length ? `<div class="cintillo">Pedidos ligados</div>${ligados.map(p => `<div class="insumorow"><span>${esc(p.folio)} · ${esc(p.clienteNombre || '')}</span><span class="folio">${dinero(totalPedido(p))}</span></div>`).join('')}` : ''}
    ${e.notas ? `<div class="mini" style="margin-top:10px">Notas: ${esc(e.notas)}</div>` : ''}
    <div class="smallnote">Para sumar ventas de puesto: en Producción elige este evento como punto de venta y usa "Vender 1" o el conteo al cierre. Para un pedido: captúralo con canal Evento y elige este evento.</div>
    <div class="acciones">${r.participacion > 0 ? (gasto ? '<div class="mini">El costo de participación ya está en Dinero como gasto.</div>' : `<button class="secondary" data-accion="ventas.gastoEvento" data-id="${esc(e.id)}">Anotar el costo de participación como gasto</button>`) : ''}
      <div class="acciones h" style="margin-top:0"><button class="secondary" data-accion="ventas.evento" data-id="${esc(e.id)}">Editar</button><button class="peligro" data-accion="ventas.borrarEvento" data-id="${esc(e.id)}">Eliminar</button></div>
      <button class="ghost" data-accion="app.cerrarModal">Cerrar</button></div>`;
}
const ver = (app, id) => { const e = app.base.get('eventos', id); if (e && !e.deleted) app.modal(detalleEvento(app, e)); else app.cerrarModal(); };

export const acciones = {
  sub: (app, d) => { estado(app).sub = d.sub; app.render(); },
  periodo: (app, d) => { estado(app).semanas = Number(d.n); app.render(); },
  async usarVenta(app, d) { const cfg = app.cfg(); await app.base.guardar('config', { ...cfg, mostrador: { ...cfg.mostrador, ventaEsperadaPct: Number(d.pct) } }); app.render(); app.toast(`El plan ahora supone ${d.pct}% de venta diaria`); },
  evento(app, d) { app.ui.evento = d.id ? clonar(app.base.get('eventos', d.id)) : { tipo: 'puesto', estatus: 'cotizado', plan: [] }; app.modal(formEvento(app)); },
  verEvento: (app, d) => ver(app, d.id),
  async guardarEvento(app) {
    const v = id => document.getElementById(id).value, e = app.ui.evento;
    if (!v('eNom').trim()) return app.toast('Falta el nombre');
    if (v('eFin') < v('eIni')) return app.toast('La fecha final es antes que la inicial');
    const plan = [...document.querySelectorAll('[data-plan]')].map(i => ({ recetaId: i.dataset.plan, moldes: Math.max(0, Math.round(Number(i.value) || 0)) })).filter(l => l.moldes > 0);
    const g = await app.base.guardar('eventos', { ...e, nombre: v('eNom').trim(), sede: v('eSede').trim(), fechaInicio: v('eIni'), fechaFin: v('eFin'), tipo: v('eTipo'), estatus: v('eEst'), costoParticipacion: Number(v('eCosto')) || 0, plan, notas: v('eNotas').trim() });
    app.ui.evento = null; app.render(); ver(app, g.id); app.toast('Evento guardado');
  },
  async estatusEvento(app, d) { await app.base.guardar('eventos', { ...app.base.get('eventos', d.id), estatus: d.estatus }); app.render(); ver(app, d.id); },
  async gastoEvento(app, d) {
    const e = app.base.get('eventos', d.id);
    await app.base.guardar('gastos', { fecha: app.hoy(), categoria: 'Eventos', concepto: 'Participación · ' + e.nombre, proveedor: e.sede || '', monto: Number(e.costoParticipacion) || 0, deducible: false, conFactura: false, comprobante: '', eventoId: e.id });
    app.render(); ver(app, d.id); app.toast('Gasto anotado en Dinero');
  },
  async borrarEvento(app, d) { await app.base.borrar('eventos', d.id); app.cerrarModal(); app.render(); app.toast('Evento eliminado'); },
};
