// KUMAI OS · Pedidos: captura rápida, lista, calendario, pagos y mensaje de WhatsApp
import { esc, dinero, ymd, sumarDias, fechaCorta, fechaLarga, fechaHumana, deYmd } from '../util.js';
import {
  CANALES, ESTATUS, ESTATUS_ETIQUETA, PRESENTACIONES, siguienteFolio, totalPedido, totalLineas, pagado, saldo, estadoPago,
  moldesPedido, pedidoActivo, pedidoAbierto, textoLinea, normalizarTelefono,
} from '../modelo.js';
import { mensajeConfirmacion, mensajeRecordatorio, mensajeSaldo, enlaceWhatsApp } from '../plantillas.js';
import { cabePedido } from '../motor.js';
import { entregarPedido } from '../operacion.js';

const PAGO_ETIQUETA = { pagado: 'Pagado', parcial: 'Anticipo', pendiente: 'Por cobrar' };
const moldesTxt = n => (Number.isInteger(n) ? n : n.toFixed(1)) + (n === 1 ? ' molde' : ' moldes');
const ordenar = ps => ps.sort((a, b) => (a.fechaEntrega + (a.horaEntrega || '')).localeCompare(b.fechaEntrega + (b.horaEntrega || '')) || a.folio.localeCompare(b.folio));

export function ticketHtml(app, p) {
  const rec = app.recetasPorId();
  const ep = estadoPago(p);
  return `<div class="ticket" data-accion="pedidos.ver" data-id="${esc(p.id)}">
    <div class="row1"><span class="folio">${esc(p.folio)}</span>
      <span><span class="tag ${esc(p.canal)}">${esc(p.canal)}</span>${p.prueba ? ' <span class="tag prueba">Prueba</span>' : ''}</span></div>
    <div class="cliente">${esc(p.clienteNombre || 'Sin nombre')}</div>
    <div class="detalle">${p.lineas.map(l => esc(textoLinea(l, rec))).join(' · ')}</div>
    <div class="foot"><span>${esc(fechaCorta(p.fechaEntrega))}${p.horaEntrega ? ' · ' + esc(p.horaEntrega) : ''} · <span class="estado est-${p.estatus}">${ESTATUS_ETIQUETA[p.estatus]}</span></span>
      <span>${dinero(totalPedido(p))} <span class="pago-pill pago-${ep}">${PAGO_ETIQUETA[ep]}</span></span></div>
  </div>`;
}

function estado(app) {
  return app.ui.ped || (app.ui.ped = { modo: 'lista', filtro: 'abiertos', mes: app.hoy().slice(0, 7), dia: null });
}

export function render(app) {
  const u = estado(app);
  const todos = app.base.lista('pedidos');
  let h = `<h2 class="viewtitle">Pedidos</h2>
    <div class="seg"><button class="${u.modo === 'lista' ? 'on' : ''}" data-accion="pedidos.modo" data-modo="lista">Lista</button>
    <button class="${u.modo === 'cal' ? 'on' : ''}" data-accion="pedidos.modo" data-modo="cal">Calendario</button></div>`;
  if (!todos.length) {
    return h + `<div class="empty"><div class="big">Todavía no hay pedidos</div>Toca el botón + para capturar el primero. Cliente, canal, sabores, fecha y anticipo: menos de 30 segundos.</div>`;
  }
  if (u.modo === 'lista') {
    h += `<div class="chips">${[['abiertos', 'Abiertos'], ['entregados', 'Entregados'], ['todos', 'Todos']].map(([k, t]) =>
      `<button class="chip ${u.filtro === k ? 'on' : ''}" data-accion="pedidos.filtro" data-filtro="${k}">${t}</button>`).join('')}</div>`;
    let lista = todos.filter(p => (u.filtro === 'abiertos' ? pedidoAbierto(p) : u.filtro === 'entregados' ? p.estatus === 'entregado' : true));
    ordenar(lista);
    if (u.filtro !== 'abiertos') lista.reverse();
    if (!lista.length) return h + `<div class="empty">Nada en esta vista.</div>`;
    h += porDia(app, lista);
  } else {
    h += calendario(app, u, todos.filter(pedidoActivo));
  }
  return h;
}

function porDia(app, lista) {
  const hoy = app.hoy(); let h = '', dia = null, abierto = false;
  for (const p of lista) {
    if (p.fechaEntrega !== dia) {
      if (abierto) h += '</div>';
      dia = p.fechaEntrega; abierto = true;
      const delDia = lista.filter(x => x.fechaEntrega === dia && pedidoActivo(x));
      const m = delDia.reduce((s, x) => s + moldesPedido(x), 0);
      h += `<div class="taskday"><h3>${esc(fechaHumana(dia, hoy))}${dia < hoy ? ' · atrasado' : ''} · ${moldesTxt(Math.round(m * 10) / 10)}</h3>`;
    }
    h += ticketHtml(app, p);
  }
  return h + (abierto ? '</div>' : '');
}

function calendario(app, u, activos) {
  const [y, m] = u.mes.split('-').map(Number);
  const primero = new Date(y, m - 1, 1);
  const inicio = sumarDias(ymd(primero), -((primero.getDay() + 6) % 7));
  const nombreMes = primero.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const hoy = app.hoy();
  let h = `<div class="calhead"><button data-accion="pedidos.mes" data-paso="-1" aria-label="Mes anterior">‹</button><b>${esc(nombreMes)}</b><button data-accion="pedidos.mes" data-paso="1" aria-label="Mes siguiente">›</button></div>
    <div class="cal">${['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(d => `<div class="dh">${d}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const f = sumarDias(inicio, i);
    if (i >= 35 && f.slice(0, 7) !== u.mes) break;
    const del = activos.filter(p => p.fechaEntrega === f);
    const mol = del.reduce((s, p) => s + moldesPedido(p), 0);
    h += `<button class="${f.slice(0, 7) !== u.mes ? 'fuera' : ''} ${f === hoy ? 'hoy' : ''} ${f === u.dia ? 'sel' : ''}" data-accion="pedidos.dia" data-dia="${f}">
      <span class="d">${deYmd(f).getDate()}</span>${del.length ? `<span class="n">${del.length}</span><span class="m">${Math.round(mol * 10) / 10} mol</span>` : ''}</button>`;
  }
  h += '</div>';
  if (u.dia) {
    const del = ordenar(activos.filter(p => p.fechaEntrega === u.dia));
    h += `<div class="cintillo">${esc(fechaLarga(u.dia))}</div>` + (del.length ? del.map(p => ticketHtml(app, p)).join('') : `<div class="mini">Sin pedidos este día.</div>`)
      + `<div class="acciones"><button class="secondary" data-accion="pedidos.nuevo" data-fecha="${u.dia}">Nuevo pedido para este día</button></div>`;
  } else h += `<div class="mini" style="margin-top:10px">Toca un día para ver sus pedidos. El número grande son pedidos; abajo, moldes.</div>`;
  return h;
}

// ---------- formulario de captura ----------
function formHtml(app) {
  const f = app.ui.form, hoy = app.hoy();
  const clientes = app.base.lista('clientes').filter(c => !c.prueba || f.prueba);
  const eventos = app.base.lista('eventos').filter(e => !['cancelado', 'cerrado'].includes(e.estatus));
  const rapidas = [[hoy, 'Hoy'], [sumarDias(hoy, 1), 'Mañana']];
  for (let i = 2; i <= 7 && rapidas.length < 4; i++) { const d = sumarDias(hoy, i); const dia = deYmd(d).getDay(); if (dia === 6) rapidas.push([d, 'Sábado']); if (dia === 0) rapidas.push([d, 'Domingo']); }
  return `<h3>${f.id ? 'Editar ' + esc(f.folio) : 'Nuevo pedido'}</h3>
    <label>Canal</label>
    <div class="seg">${CANALES.map(c => `<button type="button" class="${f.canal === c ? 'on' : ''}" data-accion="pedidos.formCanal" data-canal="${c}">${c}</button>`).join('')}</div>
    <div class="dos"><div><label for="fNombre">Cliente</label><input id="fNombre" list="listaClientes" autocomplete="off" value="${esc(f.clienteNombre)}" data-entrada="pedidos.nombre" placeholder="${f.canal === 'Rappi' || f.canal === 'Mostrador' ? f.canal : 'Nombre'}">
      <datalist id="listaClientes">${clientes.map(c => `<option value="${esc(c.nombre)}">`).join('')}</datalist></div>
      <div><label for="fTel">WhatsApp</label><input id="fTel" type="tel" inputmode="tel" value="${esc(f.telefono)}" data-entrada="pedidos.campo" data-campo="telefono" placeholder="449…"></div></div>
    ${f.canal === 'Evento' && eventos.length ? `<label for="fEvento">Evento</label><select id="fEvento" data-entrada="pedidos.campo" data-campo="eventoId"><option value="">Sin ligar</option>${eventos.map(e => `<option value="${esc(e.id)}" ${f.eventoId === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select>` : ''}
    <label>Entrega</label>
    <div class="chips" id="fFechas">${rapidas.map(([d, t]) => `<button type="button" class="chip ${f.fecha === d ? 'on' : ''}" data-accion="pedidos.formFecha" data-fecha="${d}">${t}</button>`).join('')}</div>
    <div class="dos" style="margin-top:8px"><input type="date" id="fFecha" value="${esc(f.fecha)}" data-entrada="pedidos.fecha" aria-label="Fecha de entrega">
      <input type="time" value="${esc(f.hora)}" data-entrada="pedidos.campo" data-campo="hora" aria-label="Hora de entrega"></div>
    <label>Sabores</label>
    <div id="fSabores">${saboresHtml(app)}</div>
    <div class="dos"><div><label for="fEnvio">Envío $</label><input id="fEnvio" type="number" inputmode="decimal" min="0" value="${esc(f.envio)}" data-entrada="pedidos.campo" data-campo="envio" placeholder="0"></div>
    ${f.id ? '<div></div>' : `<div><label for="fAnt">Anticipo $</label><input id="fAnt" type="number" inputmode="decimal" min="0" value="${esc(f.anticipo)}" data-entrada="pedidos.campo" data-campo="anticipo" placeholder="0"></div>`}</div>
    <label for="fNotas">Notas</label><textarea id="fNotas" data-entrada="pedidos.campo" data-campo="notas" placeholder="Dirección, dedicatoria, cambios…">${esc(f.notas)}</textarea>
    <div id="fTotal">${totalHtml(app)}</div>
    <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="pedidos.guardar">Guardar pedido</button></div>`;
}

function precioDe(app, recetaId, pres, canal) {
  const p = app.producto(recetaId, pres);
  if (!p) return 0;
  return p.precios[canal] ?? Object.values(p.precios)[0] ?? 0;
}

function lineasDeForm(app) {
  const f = app.ui.form, out = [];
  for (const [k, n] of Object.entries(f.cant)) {
    if (!n) continue;
    const [recetaId, presentacion] = k.split('|');
    out.push({ recetaId, presentacion, cantidad: n, precioUnit: f.precioFijo[k] ?? precioDe(app, recetaId, presentacion, f.canal) });
  }
  return out;
}

function saboresHtml(app) {
  const f = app.ui.form;
  const pres = f.canal === 'Rappi' ? 'rappi' : f.pres;
  const conCantidad = new Set(Object.entries(f.cant).filter(([, n]) => n).map(([k]) => k.split('|')[0]));
  const sabores = app.sabores().filter(r => f.verReserva || r.menu === 'operativo' || conCantidad.has(r.id));
  let h = f.canal === 'Rappi' ? '' : `<div class="seg">${['rebanada', 'molde'].map(p => `<button type="button" class="${f.pres === p ? 'on' : ''}" data-accion="pedidos.formPres" data-pres="${p}">${p === 'rebanada' ? 'Rebanadas' : 'Moldes completos'}</button>`).join('')}</div>`;
  h += sabores.map(r => {
    const n = f.cant[r.id + '|' + pres] || 0;
    const otras = Object.entries(f.cant).filter(([k, v]) => v && k.startsWith(r.id + '|') && !k.endsWith('|' + pres)).map(([k, v]) => `${v} ${PRESENTACIONES[k.split('|')[1]].plural}`);
    return `<div class="saborrow"><div class="crece"><b>${esc(r.nombre)}</b><span>${dinero(precioDe(app, r.id, pres, f.canal))}${r.validacion ? ' · en validación' : ''}${otras.length ? ' · + ' + esc(otras.join(', ')) : ''}</span></div>
      <div class="paso"><button type="button" data-accion="pedidos.menos" data-id="${r.id}" aria-label="Quitar ${esc(r.nombre)}">−</button><output class="${n ? '' : 'cero'}">${n}</output><button type="button" data-accion="pedidos.mas" data-id="${r.id}" aria-label="Agregar ${esc(r.nombre)}">+</button></div></div>`;
  }).join('');
  h += `<button type="button" class="ghost" data-accion="pedidos.verReserva">${f.verReserva ? 'Ver solo el menú operativo' : 'Ver también el menú de reserva'}</button>`;
  return h;
}

function totalHtml(app) {
  const f = app.ui.form, rec = app.recetasPorId();
  const lineas = lineasDeForm(app);
  const total = lineas.reduce((s, l) => s + l.cantidad * l.precioUnit, 0) + (Number(f.envio) || 0);
  let cabe = '';
  if (lineas.length && f.fecha) {
    const r = cabePedido(app.motorEntrada(14), { id: f.id, folio: f.folio, fechaEntrega: f.fecha, lineas });
    f.cabe = r.cabe;
    if (r.lejano) cabe = `<div class="cabe">Fecha lejana: se revisa al acercarse.</div>`;
    else if (r.cabe) cabe = `<div class="cabe si">Cabe para ${esc(fechaHumana(f.fecha, app.hoy()))}.${r.mostradorCorto ? ` Deja la vitrina ${r.mostradorCorto === 1 ? '1 molde' : r.mostradorCorto + ' moldes'} abajo del mínimo.` : ''}</div>`;
    else cabe = `<div class="cabe no"><b>No cabe.</b> ${esc(r.motivo.replace(/(\d{4}-\d{2}-\d{2})/g, x => fechaCorta(x)))}${r.alternativa ? ` Sí cabe el ${esc(fechaLarga(r.alternativa))}.` : ' Tampoco en los 7 días siguientes.'}
      ${r.alternativa ? `<div><button type="button" class="chip" data-accion="pedidos.formFecha" data-fecha="${r.alternativa}">Cambiar a ${esc(fechaCorta(r.alternativa))}</button></div>` : ''}</div>`;
  }
  return `${cabe}<div class="lineas">${lineas.length ? lineas.map(l => esc(textoLinea(l, rec))).join(' · ') : 'Agrega al menos un sabor.'}</div>
    <div class="totalbar"><span>Total</span><span class="num">${dinero(total)}</span></div>`;
}

function refrescarForm(app, todo = false) {
  if (todo) { app.modal(formHtml(app)); return; }
  const s = document.getElementById('fSabores'), t = document.getElementById('fTotal');
  if (s) s.innerHTML = saboresHtml(app);
  if (t) t.innerHTML = totalHtml(app);
}

function abrirForm(app, p = null, fecha = null) {
  const hoy = app.hoy();
  const f = app.ui.form = {
    id: p ? p.id : null, folio: p ? p.folio : '', clienteNombre: p ? p.clienteNombre : '', telefono: '', canal: p ? p.canal : 'WhatsApp',
    fecha: p ? p.fechaEntrega : (fecha || sumarDias(hoy, 1)), hora: p ? (p.horaEntrega || '') : '', pres: 'rebanada', cant: {}, precioFijo: {},
    envio: p && p.envio ? p.envio : '', eventoId: p ? (p.eventoId || '') : '', anticipo: '', notas: p ? (p.notas || '') : '', verReserva: false, prueba: !!(p && p.prueba),
  };
  if (p) {
    const c = p.clienteId && app.base.get('clientes', p.clienteId);
    f.telefono = c ? (c.telefono || '') : '';
    for (const l of p.lineas) { const k = l.recetaId + '|' + l.presentacion; f.cant[k] = l.cantidad; f.precioFijo[k] = l.precioUnit; }
  }
  app.modal(formHtml(app));
}

async function clienteDe(app, f) {
  const nombre = (f.clienteNombre || '').trim() || (f.canal === 'Rappi' ? 'Rappi' : f.canal === 'Mostrador' ? 'Mostrador' : '');
  const tel = normalizarTelefono(f.telefono);
  const clientes = app.base.lista('clientes');
  let c = (tel && clientes.find(x => normalizarTelefono(x.telefono) === tel)) || clientes.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (!c) return app.base.guardar('clientes', { nombre, telefono: tel, canalOrigen: f.canal, notas: '' });
  if ((tel && tel !== normalizarTelefono(c.telefono)) || (nombre && nombre !== c.nombre && tel)) c = await app.base.guardar('clientes', { ...c, nombre: nombre || c.nombre, telefono: tel || c.telefono });
  return c;
}

// ---------- detalle ----------
function detalleHtml(app, p) {
  const rec = app.recetasPorId();
  const c = p.clienteId && app.base.get('clientes', p.clienteId);
  const tel = c ? c.telefono : '';
  const msg = mensajeConfirmacion(p, rec);
  const s = saldo(p), ep = estadoPago(p);
  return `<h3>${esc(p.folio)} <span class="tag ${esc(p.canal)}">${esc(p.canal)}</span>${p.prueba ? ' <span class="tag prueba">Prueba</span>' : ''}</h3>
    <div class="entre"><b style="font-size:17px">${esc(p.clienteNombre || 'Sin nombre')}</b>${tel ? `<a href="tel:${esc(tel)}">${esc(tel)}</a>` : '<span class="mini">sin teléfono</span>'}</div>
    <div class="mini">Entrega ${esc(fechaLarga(p.fechaEntrega))}${p.horaEntrega ? ', ' + esc(p.horaEntrega) : ''} · ${moldesTxt(Math.round(moldesPedido(p) * 10) / 10)}</div>
    <table class="tabla">${p.lineas.map(l => `<tr><td>${esc(textoLinea(l, rec))}</td><td class="r">${dinero(l.cantidad * l.precioUnit)}</td></tr>`).join('')}
      ${Number(p.envio) ? `<tr><td>Envío</td><td class="r">${dinero(p.envio)}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td class="r">${dinero(totalPedido(p))}</td></tr>
      ${(p.pagos || []).map(x => `<tr><td>Pago ${esc(fechaCorta(x.fecha))} · ${esc(x.metodo || '')}</td><td class="r">${dinero(-x.monto)}</td></tr>`).join('')}
      <tr><td><b>${s > 0 ? 'Resta' : 'Saldo'}</b></td><td class="r"><span class="pago-pill pago-${ep}">${s > 0 ? dinero(s) : 'Pagado'}</span></td></tr></table>
    ${p.notas ? `<div class="mini" style="margin:8px 0">Notas: ${esc(p.notas)}</div>` : ''}
    <label>Estatus</label>
    <div class="chips">${ESTATUS.filter(e => e !== 'cancelado').map(e => `<button class="chip ${p.estatus === e ? 'on' : ''}" data-accion="pedidos.estatus" data-id="${esc(p.id)}" data-estatus="${e}">${ESTATUS_ETIQUETA[e]}</button>`).join('')}</div>
    ${p.estatus === 'cancelado' ? '<div class="alert"><div><b>Pedido cancelado.</b> Toca un estatus para reactivarlo.</div></div>' : ''}
    ${s > 0 && p.estatus !== 'cancelado' ? `<label for="pMonto">Registrar pago</label>
      <div class="fila"><input id="pMonto" class="crece" type="number" inputmode="decimal" min="0" value="${s}">
      <select id="pMetodo" style="flex:0 0 138px"><option>transferencia</option><option>efectivo</option><option>tarjeta</option><option>Rappi</option></select></div>
      <div class="acciones"><button class="secondary" data-accion="pedidos.pago" data-id="${esc(p.id)}">Guardar pago</button></div>` : ''}
    <label>Mensaje de confirmación</label>
    <pre class="mensaje" id="msgConf">${esc(msg)}</pre>
    <div class="acciones h"><a class="primary" href="${esc(enlaceWhatsApp(tel, msg))}" target="_blank" rel="noopener">Abrir WhatsApp</a>
      <button class="secondary" data-accion="pedidos.copiar" data-id="${esc(p.id)}" data-cual="confirmacion">Copiar</button></div>
    <div class="chips" style="margin-top:12px"><button class="chip" data-accion="pedidos.copiar" data-id="${esc(p.id)}" data-cual="recordatorio">Copiar recordatorio de entrega</button>
      ${s > 0 ? `<button class="chip" data-accion="pedidos.copiar" data-id="${esc(p.id)}" data-cual="saldo">Copiar aviso de saldo</button>` : ''}</div>
    <div class="acciones h" style="margin-top:22px"><button class="secondary" data-accion="pedidos.editar" data-id="${esc(p.id)}">Editar</button>
      ${p.estatus === 'cancelado' ? `<button class="peligro" data-accion="pedidos.eliminar" data-id="${esc(p.id)}">Eliminar</button>` : `<button class="peligro" data-accion="pedidos.estatus" data-id="${esc(p.id)}" data-estatus="cancelado">Cancelar pedido</button>`}</div>
    <div class="acciones"><button class="ghost" data-accion="app.cerrarModal">Cerrar</button></div>`;
}

function verPedido(app, id) {
  const p = app.base.get('pedidos', id);
  if (p && !p.deleted) app.modal(detalleHtml(app, p)); else app.cerrarModal();
}

export const acciones = {
  modo: (app, d) => { estado(app).modo = d.modo; app.render(); },
  filtro: (app, d) => { estado(app).filtro = d.filtro; app.render(); },
  mes: (app, d) => {
    const u = estado(app); const [y, m] = u.mes.split('-').map(Number);
    const n = new Date(y, m - 1 + Number(d.paso), 1); u.mes = ymd(n).slice(0, 7); u.dia = null; app.render();
  },
  dia: (app, d) => { const u = estado(app); u.dia = u.dia === d.dia ? null : d.dia; app.render(); },
  nuevo: (app, d) => abrirForm(app, null, d.fecha || null),
  editar: (app, d) => abrirForm(app, app.base.get('pedidos', d.id)),
  ver: (app, d) => verPedido(app, d.id),

  formCanal: (app, d) => {
    const f = app.ui.form, antes = f.canal; f.canal = d.canal;
    if ((antes === 'Rappi') !== (f.canal === 'Rappi')) { // Rappi solo vende porciones
      const nueva = {};
      for (const [k, n] of Object.entries(f.cant)) {
        const [id, pres] = k.split('|');
        const destino = f.canal === 'Rappi' ? 'rappi' : (pres === 'rappi' ? 'rebanada' : pres);
        nueva[id + '|' + destino] = (nueva[id + '|' + destino] || 0) + n * (f.canal === 'Rappi' && pres === 'molde' ? 5 : 1);
      }
      f.cant = nueva; f.precioFijo = {};
    }
    refrescarForm(app, true);
  },
  formFecha: (app, d) => {
    app.ui.form.fecha = d.fecha;
    const i = document.getElementById('fFecha'); if (i) i.value = d.fecha;
    for (const b of document.querySelectorAll('#fFechas .chip')) b.classList.toggle('on', b.dataset.fecha === d.fecha);
    refrescarForm(app);
  },
  formPres: (app, d) => { app.ui.form.pres = d.pres; refrescarForm(app); },
  mas: (app, d) => { const f = app.ui.form, k = d.id + '|' + (f.canal === 'Rappi' ? 'rappi' : f.pres); f.cant[k] = (f.cant[k] || 0) + 1; refrescarForm(app); },
  menos: (app, d) => { const f = app.ui.form, k = d.id + '|' + (f.canal === 'Rappi' ? 'rappi' : f.pres); f.cant[k] = Math.max(0, (f.cant[k] || 0) - 1); refrescarForm(app); },
  verReserva: app => { app.ui.form.verReserva = !app.ui.form.verReserva; refrescarForm(app); },

  async guardar(app) {
    const f = app.ui.form;
    const lineas = lineasDeForm(app);
    if (!lineas.length) return app.toast('Agrega al menos un sabor');
    if (!f.fecha) return app.toast('Falta la fecha de entrega');
    if (!(f.clienteNombre || '').trim() && !['Rappi', 'Mostrador'].includes(f.canal)) return app.toast('Falta el nombre del cliente');
    const c = await clienteDe(app, f);
    const previo = f.id ? app.base.get('pedidos', f.id) : null;
    const p = previo ? { ...previo } : { tipo: f.canal === 'Evento' ? 'EVT' : 'IND', pagos: [], estatus: 'pendiente', descuento: 0 };
    if (!previo) {
      const letra = app.letra(), llave = 'folio' + p.tipo + letra;
      const r = siguienteFolio(app.base.todos('pedidos'), p.tipo, letra, app.base.meta[llave] || 0);
      p.folio = r.folio; await app.base.metaSet(llave, r.contador);
      const ant = Number(f.anticipo) || 0;
      if (ant > 0) p.pagos = [{ fecha: app.hoy(), monto: ant, metodo: 'transferencia' }];
    }
    Object.assign(p, {
      clienteId: c.id, clienteNombre: c.nombre, canal: f.canal, fechaEntrega: f.fecha, horaEntrega: f.hora || '',
      lineas, envio: Number(f.envio) || 0, notas: (f.notas || '').trim(), eventoId: f.canal === 'Evento' ? (f.eventoId || null) : null,
    });
    const g = await app.base.guardar('pedidos', p);
    app.ui.form = null;
    app.render();
    verPedido(app, g.id);
    app.toast((previo ? 'Pedido actualizado' : `Pedido ${g.folio} guardado`) + (f.cabe === false ? '. Ojo: no cabe en esa fecha' : ''), f.cabe === false ? 5000 : 2600);
  },

  async estatus(app, d) {
    const p = app.base.get('pedidos', d.id);
    if (d.estatus === 'entregado') await entregarPedido(app.base, p, app.hoy(), app.cfg().rebanadasPorMolde); // sus rebanadas salen de la vitrina
    else await app.base.guardar('pedidos', { ...p, estatus: d.estatus });
    app.render(); verPedido(app, d.id);
  },
  async pago(app, d) {
    const monto = Number(document.getElementById('pMonto').value) || 0;
    if (monto <= 0) return app.toast('Escribe el monto del pago');
    const p = app.base.get('pedidos', d.id);
    await app.base.guardar('pedidos', { ...p, pagos: [...(p.pagos || []), { fecha: app.hoy(), monto, metodo: document.getElementById('pMetodo').value }] });
    app.render(); verPedido(app, d.id); app.toast('Pago registrado');
  },
  copiar: (app, d) => {
    const p = app.base.get('pedidos', d.id), rec = app.recetasPorId();
    return app.copiar(d.cual === 'recordatorio' ? mensajeRecordatorio(p, rec) : d.cual === 'saldo' ? mensajeSaldo(p) : mensajeConfirmacion(p, rec));
  },
  async eliminar(app, d) {
    await app.base.borrar('pedidos', d.id);
    app.cerrarModal(); app.render(); app.toast('Pedido eliminado');
  },
};

export const entradas = {
  campo: (app, d, el) => { app.ui.form[d.campo] = el.value; if (d.campo === 'envio') refrescarForm(app); },
  fecha: (app, d, el) => {
    app.ui.form.fecha = el.value;
    for (const b of document.querySelectorAll('#fFechas .chip')) b.classList.toggle('on', b.dataset.fecha === el.value);
    refrescarForm(app);
  },
  nombre: (app, d, el) => {
    const f = app.ui.form; f.clienteNombre = el.value;
    const c = app.base.lista('clientes').find(x => x.nombre.toLowerCase() === el.value.trim().toLowerCase());
    if (c && c.telefono) { f.telefono = c.telefono; const t = document.getElementById('fTel'); if (t) t.value = c.telefono; }
  },
};

export { moldesTxt, totalLineas };
