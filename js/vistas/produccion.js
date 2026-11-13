// KUMAI OS · Producción: plan del motor, vitrina, sabores de la semana y lotes
import { esc, sumarDias, fechaCorta, fechaHumana, diasEntre } from '../util.js';
import { lunesDe } from '../modelo.js';
import { parametros, techoSemanal, minutosSemana, saboresDeSemana, horas, claveDia, vidaVenta } from '../motor.js';
import * as op from '../operacion.js';
import { eventoActivo } from '../analisis.js';
import { deYmd } from '../util.js';

/** Punto de venta de hoy: mostrador, Andador (domingo por defecto) o un evento de puesto propio en curso. */
export function puntos(app) {
  const hoy = app.hoy();
  const evs = app.base.lista('eventos').filter(e => e.tipo === 'puesto' && (eventoActivo(e) || e.estatus === 'entregado') && e.fechaInicio <= hoy && (e.fechaFin || e.fechaInicio) >= hoy).map(e => e.nombre);
  return [...new Set(['Mostrador', 'Andador Raíces Hidrocálidas', ...evs])];
}
export function puntoDeHoy(app) {
  const m = app.base.meta, hoy = app.hoy();
  if (m.puntoVentaFecha === hoy && puntos(app).includes(m.puntoVenta)) return m.puntoVenta;
  return deYmd(hoy).getDay() === 0 ? 'Andador Raíces Hidrocálidas' : 'Mostrador';
}

const estado = app => app.ui.prod || (app.ui.prod = { semana: 'esta' });
const h1 = min => horas(min) + ' h';
const TIPO = { crema: 'Batch de crema base', horneado: 'Hornear soletas', armado: 'Armar', lavado: 'Lavado del horneado' };
const precioMostrador = (app, id) => ((app.producto(id, 'rebanada') || { precios: {} }).precios.Mostrador) || 0;

export function textoTarea(app, t) {
  const R = app.recetasPorId();
  if (t.tipo === 'armado') {
    const nombres = t.moldes.map(m => `${R.get(m.recetaId) ? R.get(m.recetaId).nombre : '?'}${m.motivo === 'pedido' ? ` (${m.folio})` : ''}`);
    return `Armar ${t.moldes.length} ${t.moldes.length === 1 ? 'molde' : 'moldes'}: ${nombres.join(', ')}`;
  }
  if (t.tipo === 'horneado') return `Hornear ${t.tandas} ${t.tandas === 1 ? 'tanda' : 'tandas'} de soletas (${t.cantidad} piezas)`;
  if (t.tipo === 'crema') return 'Batch de crema base (10 botes) y lavado';
  return TIPO[t.tipo];
}
export function filaTarea(app, t) {
  const sub = t.tipo === 'armado' ? `${h1(t.trabajoMin)} de armado + ${h1(t.lavadoMin)} de lavado` : t.tipo === 'crema' ? '1 h de batido + 1 h de lavado' : h1(t.duracionMin);
  if (t.tipo === 'lavado') return `<div class="checkrow pasivo"><div class="box"></div><div class="checkbody"><div><span class="clock-inline">${t.inicio}</span>${esc(textoTarea(app, t))}</div><div class="mini">${sub}</div></div></div>`;
  return `<div class="checkrow" data-accion="produccion.tarea" data-id="${esc(t.id)}"><div class="box"></div><div class="checkbody"><div><span class="clock-inline">${t.inicio}</span>${esc(textoTarea(app, t))}</div><div class="mini">${sub}</div></div></div>`;
}
export function alertasHtml(pl) {
  const lim = f => f.replace(/(\d{4}-\d{2}-\d{2})/g, x => fechaCorta(x));
  let h = pl.alertas.filter(a => a.tipo === 'no-cabe').map(a => `<div class="alert"><div><b>No cabe:</b> ${esc(lim(a.texto))} Opciones: mover la fecha, adelantar soletas o rechazarlo.</div></div>`).join('');
  const cortos = pl.alertas.filter(a => a.tipo === 'mostrador-corto');
  if (cortos.length === 1) h += `<div class="alert soft"><div><b>Vitrina:</b> ${esc(lim(cortos[0].texto))}</div></div>`;
  else if (cortos.length) h += `<div class="alert soft"><div><b>Vitrina corta ${cortos.length} días:</b> ${cortos.map(a => `${esc(fechaCorta(a.fecha))} (faltan ${a.moldes})`).join(', ')}. No alcanzan las horas para el mínimo de mostrador; los pedidos van primero.</div></div>`;
  return h;
}

export function render(app) {
  const u = estado(app), hoy = app.hoy(), cfg = app.cfg(), P = parametros(cfg), pl = app.plan(14);
  const lunes = lunesDe(hoy);
  const s = pl.semanas.find(x => x.lunes === lunes) || { totalMin: 0, horneadoMin: 0, cremaMin: 0, armadoMin: 0, lavadoMin: 0, moldes: 0, moldesPedido: 0, moldesMostrador: 0 };
  const restoSemana = pl.dias.filter(d => d.fecha <= sumarDias(lunes, 6)).reduce((t, d) => t + d.disponibleMin, 0);
  const techo = techoSemanal(P);
  let h = `<h2 class="viewtitle">Producción</h2>
    <div class="grid2">
      <div class="stat"><div class="n">${horas(s.totalMin)}</div><div class="l">Horas por hacer esta semana · quedan ${horas(restoSemana)} disponibles</div></div>
      <div class="stat"><div class="n">${s.moldes}</div><div class="l">Moldes por armar · ${s.moldesPedido} de pedidos, ${s.moldesMostrador} de mostrador</div></div>
      <div class="stat"><div class="n">${horas(s.horneadoMin)}</div><div class="l">Horas de horno · lavado ${horas(s.lavadoMin)} h</div></div>
      <div class="stat"><div class="n">${techo.techo}</div><div class="l">Techo por semana con ${horas(minutosSemana(P))} h y ${P.moldesFisicos} moldes</div></div>
    </div>
    <div class="mini" style="margin-top:8px">Esta semana: horneado ${h1(s.horneadoMin)} · crema ${h1(s.cremaMin)} · armado ${h1(s.armadoMin)} · lavado ${h1(s.lavadoMin)}.</div>
    ${alertasHtml(pl)}`;

  // ----- vitrina -----
  const vit = op.stockVitrina(app.base, hoy), total = vit.reduce((t, x) => t + x.hoy, 0), obj = pl.dias[0].objetivo;
  const pv = puntoDeHoy(app);
  h += `<div class="taskday"><h3>Vitrina · ${total} rebanadas${obj ? ` · mínimo de hoy ${obj}` : ''}</h3>
    <label for="pvSel">Hoy vendo en</label><select id="pvSel" data-entrada="produccion.punto">${puntos(app).map(x => `<option ${x === pv ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
    ${vit.length ? vit.map(x => `<div class="saborrow"><div class="crece"><b>${esc(x.receta.nombre)}</b><span>${x.hoy} ${x.hoy === 1 ? 'rebanada' : 'rebanadas'}${x.vence ? ` · ${x.vence === hoy ? 'último día' : 'hasta ' + fechaCorta(x.vence)}` : ''}${x.manana ? ` · ${x.manana} salen mañana` : ''}</span></div>
      <button class="secondary" ${x.hoy + x.manana ? '' : 'disabled'} data-accion="produccion.vender" data-id="${esc(x.recetaId)}">Vender 1</button></div>`).join('') : '<div class="mini" style="padding:12px 0">Sin rebanadas registradas. Al marcar un armado como hecho aparecen aquí.</div>'}
    <div class="acciones h"><button class="secondary" data-accion="produccion.conteo">Conteo al cierre</button><button class="secondary" data-accion="produccion.fuera">Registrar producción</button></div></div>`;

  // ----- sabores de la semana -----
  const lunesSel = u.semana === 'esta' ? lunes : sumarDias(lunes, 7);
  const oper = app.sabores().filter(r => r.menu === 'operativo');
  const sem = saboresDeSemana(cfg.semanas || {}, lunesSel, oper);
  h += `<div class="taskday"><h3>Sabores de mostrador</h3>
    <div class="seg"><button class="${u.semana === 'esta' ? 'on' : ''}" data-accion="produccion.semana" data-semana="esta">Esta semana</button><button class="${u.semana === 'prox' ? 'on' : ''}" data-accion="produccion.semana" data-semana="prox">Semana del ${esc(fechaCorta(sumarDias(lunes, 7)).slice(4))}</button></div>
    <div class="chips">${oper.map(r => `<button class="chip ${sem.ids.includes(r.id) ? 'on' : ''}" data-accion="produccion.sabor" data-id="${esc(r.id)}" data-lunes="${lunesSel}">${esc(r.nombre)}</button>`).join('')}</div>
    <div class="mini" style="margin-top:8px">${sem.elegida ? `${sem.ids.length} sabores elegidos. La app reparte los moldes entre ellos.` : sem.heredadaDe ? 'Sin elegir todavía: se repiten los de la semana anterior. Toca un sabor para cambiarlos.' : 'Sin elegir: entra todo el menú operativo. Toca un sabor para quitarlo.'}</div></div>`;

  // ----- plan por día -----
  h += '<div class="cintillo">Plan de producción</div>';
  let alguno = false;
  for (const d of pl.dias.slice(0, 8)) {
    const ts = pl.tareas.filter(t => t.fecha === d.fecha);
    if (!ts.length && !d.objetivo && !d.pedidos.length) continue;
    alguno = true;
    h += `<div class="taskday"><h3>${esc(fechaHumana(d.fecha, hoy))} · ${h1(d.usadoMin)} de ${h1(d.disponibleMin)}${d.saturado ? ' · lleno' : ''}</h3>
      ${ts.map(t => filaTarea(app, t)).join('') || '<div class="mini" style="padding:12px 0">Nada que producir.</div>'}
      <div class="mini" style="padding:6px 0 0">${d.objetivo ? `Vitrina al abrir, con este plan: ${d.stockPlaneado} de ${d.objetivo} rebanadas.` : 'Sin mínimo de mostrador.'}${d.pedidos.length ? ` ${d.pedidos.length} ${d.pedidos.length === 1 ? 'pedido' : 'pedidos'}, ${d.rebanadasPedidos} rebanadas.` : ''}</div></div>`;
  }
  if (!alguno) h += '<div class="empty">Sin producción pendiente.</div>';

  // ----- lotes -----
  const lotes = app.base.lista('lotes').filter(l => l.disponible > 0 && l.tipo !== 'producto').sort((a, b) => a.caducidad.localeCompare(b.caducidad));
  h += `<div class="cintillo">Crema y soletas</div>` + (lotes.length ? lotes.map(l => {
    const q = diasEntre(hoy, l.caducidad), dia = diasEntre(l.fechaProduccion, hoy) + 1;
    return `<div class="insumorow"><span>${l.tipo === 'crema' ? `Crema base · día ${dia} de ${P.cremaVidaDias}${dia >= 3 && q >= 0 ? ' · re-batir' : ''}` : `Soletas del ${esc(fechaCorta(l.fechaProduccion))}`}${q < 0 ? ' · <b>caducó</b>' : q <= 1 ? ` · ${q === 0 ? 'último día' : 'vence mañana'}` : ''}</span><span class="folio">${l.disponible} ${l.tipo === 'crema' ? (l.disponible === 1 ? 'bote' : 'botes') : 'pzas'}</span></div>`;
  }).join('') : '<div class="mini">Sin lotes registrados.</div>');
  h += `<div class="mini" style="margin-top:14px">El plan se recalcula solo con los pedidos, la vitrina y los lotes reales. Supone que cada día se vende el ${P.mostrador.ventaEsperadaPct}% del mínimo de mostrador (se cambia en Ajustes).</div>`;
  return h;
}

function modalTarea(app, t) {
  const R = app.recetasPorId();
  let cuerpo = '';
  if (t.tipo === 'crema') cuerpo = `<label for="tBotes">Botes que salieron</label><input id="tBotes" type="number" inputmode="numeric" value="${t.cantidad}">`;
  if (t.tipo === 'horneado') cuerpo = `<div class="dos"><div><label for="tTandas">Tandas horneadas</label><input id="tTandas" type="number" inputmode="numeric" value="${t.tandas}"></div><div><label for="tPiezas">Soletas buenas</label><input id="tPiezas" type="number" inputmode="numeric" value="${t.cantidad}"></div></div>`;
  if (t.tipo === 'armado') cuerpo = `<label>Moldes armados</label>${t.moldes.map((m, i) => `<label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--tinta);margin:10px 0"><input type="checkbox" checked data-molde="${i}" style="width:auto;margin-right:10px">${esc(R.get(m.recetaId) ? R.get(m.recetaId).nombre : '?')}${m.motivo === 'pedido' ? ` · ${esc(m.folio)}` : ' · mostrador'}</label>`).join('')}
    <div class="smallnote">Por cada molde entran 5 rebanadas a la vitrina (salen a la venta mañana) y se descuenta 1 bote, ${app.cfg().soletasPorMolde} soletas y su grenetina.</div>`;
  app.ui.tarea = t;
  app.modal(`<h3>${esc(TIPO[t.tipo])}</h3><div class="mini">${esc(fechaHumana(t.fecha, app.hoy()))} · ${t.inicio} · ${esc(textoTarea(app, t))}</div>${cuerpo}
    <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="produccion.hecha">Marcar como hecha</button></div>`);
}

export const acciones = {
  semana: (app, d) => { estado(app).semana = d.semana; app.render(); },
  async sabor(app, d) {
    const cfg = app.cfg(), oper = app.sabores().filter(r => r.menu === 'operativo');
    const actual = saboresDeSemana(cfg.semanas || {}, d.lunes, oper).ids;
    const nuevo = actual.includes(d.id) ? actual.filter(x => x !== d.id) : [...actual, d.id];
    if (!nuevo.length) return app.toast('Deja al menos un sabor');
    await app.base.guardar('config', { ...cfg, semanas: { ...(cfg.semanas || {}), [d.lunes]: nuevo } });
    app.render();
  },
  tarea: (app, d) => { const t = app.plan(14).tareas.find(x => x.id === d.id); if (t) modalTarea(app, t); },
  async hecha(app) {
    const t = app.ui.tarea, cfg = app.cfg(), hoy = app.hoy(), n = id => Number(document.getElementById(id).value) || 0;
    let avisos = [];
    if (t.tipo === 'crema') { if (n('tBotes') <= 0) return app.toast('Escribe cuántos botes salieron'); await op.hacerCrema(app.base, cfg, hoy, n('tBotes')); }
    if (t.tipo === 'horneado') { if (n('tTandas') <= 0) return app.toast('Escribe cuántas tandas'); await op.hornear(app.base, cfg, hoy, n('tTandas'), n('tPiezas')); }
    if (t.tipo === 'armado') {
      const moldes = t.moldes.filter((m, i) => document.querySelector(`[data-molde="${i}"]`).checked);
      if (!moldes.length) return app.toast('Marca al menos un molde');
      avisos = await op.armar(app.base, cfg, hoy, moldes);
    }
    app.ui.tarea = null; app.cerrarModal(); app.render();
    app.toast(avisos[0] || 'Hecho. Plan recalculado.', avisos.length ? 6000 : 2600);
  },
  async vender(app, d) {
    await op.venderMostrador(app.base, d.id, 1, precioMostrador(app, d.id), app.hoy(), puntoDeHoy(app));
    app.render(); app.toast('Venta registrada');
  },
  conteo(app) {
    const vit = op.stockVitrina(app.base, app.hoy());
    if (!vit.length) return app.toast('No hay rebanadas registradas en vitrina');
    app.modal(`<h3>Conteo de vitrina</h3><div class="mini">Escribe cuántas rebanadas quedan de cada sabor. Deja vacío lo que no contaste.</div>
      ${vit.map(x => `<div class="stockfila"><div><b>${esc(x.receta.nombre)}</b><span>la app tiene ${x.hoy + x.manana}</span></div><input type="number" inputmode="numeric" min="0" placeholder="${x.hoy + x.manana}" data-conteo="${esc(x.recetaId)}" aria-label="${esc(x.receta.nombre)}"></div>`).join('')}
      <div class="acciones"><button class="primary" data-accion="produccion.guardarConteo" data-modo="venta">Guardar: lo que falta se vendió</button>
      <button class="secondary" data-accion="produccion.guardarConteo" data-modo="corregir">Solo corregir, sin registrar venta</button>
      <button class="ghost" data-accion="app.cerrarModal">Cancelar</button></div>`);
  },
  async guardarConteo(app, d) {
    const conteo = {}; for (const i of document.querySelectorAll('[data-conteo]')) if (i.value !== '') conteo[i.dataset.conteo] = i.value;
    if (!Object.keys(conteo).length) return app.toast('No escribiste ningún conteo');
    if (d.modo === 'venta') {
      const r = await op.conteoCierre(app.base, conteo, id => precioMostrador(app, id), app.hoy(), puntoDeHoy(app));
      app.toast(`Conteo guardado: ${r.vendidas} vendidas${r.corregidas ? `, ${r.corregidas} de más corregidas` : ''}`);
    } else {
      for (const [id, n] of Object.entries(conteo)) await op.corregirVitrina(app.base, id, Math.max(0, Math.round(Number(n) || 0)), app.hoy());
      app.toast('Vitrina corregida');
    }
    app.cerrarModal(); app.render();
  },
  fuera(app) {
    const sab = app.sabores();
    app.modal(`<h3>Registrar producción</h3><div class="mini">Para lo que hiciste fuera del plan, o si la vitrina ya tenía rebanadas antes de usar la app.</div>
      <label for="xTipo">Qué hiciste</label><select id="xTipo"><option value="armado">Armé moldes</option><option value="crema">Batch de crema base</option><option value="horneado">Horneé soletas</option><option value="vitrina">Ya tenía rebanadas en vitrina</option></select>
      <label for="xSabor">Sabor (armado o vitrina)</label><select id="xSabor">${sab.map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}${r.menu === 'operativo' ? '' : ' · reserva'}</option>`).join('')}</select>
      <label for="xCant">Cantidad: moldes, botes, tandas o rebanadas</label><input id="xCant" type="number" inputmode="numeric" min="1" value="1">
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="produccion.guardarFuera">Guardar</button></div>`);
  },
  async guardarFuera(app) {
    const v = id => document.getElementById(id).value, n = Math.max(0, Math.round(Number(v('xCant')) || 0)), cfg = app.cfg(), hoy = app.hoy();
    if (!n) return app.toast('Escribe la cantidad');
    let avisos = [];
    if (v('xTipo') === 'crema') await op.hacerCrema(app.base, cfg, hoy, n);
    else if (v('xTipo') === 'horneado') await op.hornear(app.base, cfg, hoy, n, n * parametros(cfg).horneadaSoletas);
    else if (v('xTipo') === 'armado') avisos = await op.armar(app.base, cfg, hoy, Array.from({ length: n }, () => ({ recetaId: v('xSabor'), motivo: 'mostrador' })));
    else { const x = op.stockVitrina(app.base, hoy).find(s => s.recetaId === v('xSabor')); await op.corregirVitrina(app.base, v('xSabor'), (x ? x.hoy + x.manana : 0) + n, hoy); }
    app.cerrarModal(); app.render(); app.toast(avisos[0] || 'Registrado. Plan recalculado.', avisos.length ? 6000 : 2600);
  },
};

export const entradas = {
  async punto(app, d, el) { await app.base.metaSet('puntoVenta', el.value); await app.base.metaSet('puntoVentaFecha', app.hoy()); app.toast('Las ventas de hoy se anotan en ' + el.value); },
};

export { vidaVenta, claveDia };
