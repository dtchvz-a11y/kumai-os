// KUMAI OS · Dinero: ingresos, gastos, utilidad, por cobrar y registro fiscal
import { esc, dinero, fechaCorta, deYmd, clonar } from '../util.js';
import * as an from '../analisis.js';
import { lunesDe, saldo } from '../modelo.js';
import { ticketHtml } from './pedidos.js';

const estado = app => app.ui.din || (app.ui.din = { sub: 'resumen' });
const datos = app => ({ pedidos: app.base.lista('pedidos'), cortes: app.base.lista('cortes'), gastos: app.base.lista('gastos') });
const categorias = app => app.cfg().categoriasGasto || an.CATEGORIAS_GASTO;
const nMes = k => deYmd(k + '-01').toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

export function recordatoriosHtml(app) {
  return an.recordatoriosFiscales(app.hoy(), app.cfg().fiscal || {}).map(r => `<div class="alert ${r.urgente ? '' : 'soft'}"><div><b>Fiscal:</b> ${esc(r.texto)}
    <div><button class="chip" style="margin-top:8px;background:var(--crema)" data-accion="dinero.fiscalHecho" data-clave="${r.clave}" data-mes="${r.mes}">Ya lo hice</button></div></div></div>`).join('');
}

export function render(app) {
  const u = estado(app);
  let h = `<h2 class="viewtitle">Dinero</h2>
    <div class="seg">${[['resumen', 'Resumen'], ['gastos', 'Gastos'], ['cobrar', 'Por cobrar'], ['fiscal', 'Fiscal']].map(([k, t]) => `<button class="${u.sub === k ? 'on' : ''}" data-accion="dinero.sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
  const d = datos(app), hoy = app.hoy();
  if (u.sub === 'resumen') {
    const ing = an.ingresos(d), meses = an.porMes(ing, d.gastos), semanas = an.porSemana(ing, d.gastos);
    const m = meses.find(x => x.clave === hoy.slice(0, 7)) || { ingresos: 0, neto: 0, gastos: 0, utilidad: 0 }, s = semanas.find(x => x.clave === lunesDe(hoy)) || { neto: 0, gastos: 0, utilidad: 0 };
    h += `<div class="grid2"><div class="stat"><div class="n">${dinero(Math.round(m.neto))}</div><div class="l">Cobrado este mes</div></div><div class="stat"><div class="n">${dinero(Math.round(m.gastos))}</div><div class="l">Gastos este mes</div></div>
      <div class="stat"><div class="n">${dinero(Math.round(m.utilidad))}</div><div class="l">Utilidad del mes</div></div><div class="stat"><div class="n">${dinero(Math.round(s.utilidad))}</div><div class="l">Utilidad de la semana</div></div></div>
      <div class="mini" style="margin-top:8px">Utilidad = lo cobrado menos los gastos capturados. Lo cobrado cuenta el día del pago; Rappi, el día del depósito, ya sin comisión.</div>`;
    const tabla = (titulo, filas, nombre) => `<div class="taskday"><h3>${titulo}</h3>${filas.length ? `<table class="tabla"><tr><th></th><th class="r">Cobrado</th><th class="r">Gastos</th><th class="r">Utilidad</th></tr>${filas.map(x => `<tr><td>${esc(nombre(x.clave))}</td><td class="r">${dinero(Math.round(x.neto))}</td><td class="r">${dinero(Math.round(x.gastos))}</td><td class="r"><b>${dinero(Math.round(x.utilidad))}</b></td></tr>`).join('')}</table>` : '<div class="mini" style="padding:12px 0">Sin movimientos todavía.</div>'}</div>`;
    h += tabla('Por semana', semanas.slice(-8).reverse(), k => 'Semana del ' + fechaCorta(k).slice(4)) + tabla('Por mes', meses.slice(-6).reverse(), nMes);
  } else if (u.sub === 'gastos') {
    const gs = d.gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    h += `<div class="acciones"><button class="primary" data-accion="dinero.gasto" data-id="">Anotar gasto</button></div>`;
    h += gs.length ? gs.slice(0, 80).map(g => `<div class="recrow" data-accion="dinero.gasto" data-id="${esc(g.id)}"><div class="crece"><b>${esc(g.concepto || g.categoria)}</b><span>${esc(fechaCorta(g.fecha))} · ${esc(g.categoria || '')}${g.proveedor ? ' · ' + esc(g.proveedor) : ''}${g.conFactura ? ' · con factura' : ''}</span></div><div class="der"><span class="num">${dinero(g.monto)}</span></div></div>`).join('')
      : `<div class="empty"><div class="big">Sin gastos</div>Anota aquí insumos, empaque, luz, transporte y eventos. Las compras que registras en Insumos con importe entran solas.</div>`;
  } else if (u.sub === 'cobrar') {
    const pc = an.porCobrar(d.pedidos).sort((a, b) => a.fechaEntrega.localeCompare(b.fechaEntrega));
    h += pc.length ? `<div class="grid2"><div class="stat"><div class="n">${dinero(pc.reduce((s, p) => s + saldo(p), 0))}</div><div class="l">Por cobrar</div></div><div class="stat"><div class="n">${pc.length}</div><div class="l">Pedidos con saldo</div></div></div>${pc.map(p => ticketHtml(app, p)).join('')}`
      : `<div class="empty"><div class="big">Nada por cobrar</div>Los pedidos de Rappi no aparecen aquí: Rappi cobra y luego deposita.</div>`;
  } else {
    const anio = Number(hoy.slice(0, 4)), ing = an.ingresos(d).filter(i => i.fecha.startsWith(String(anio)));
    const mesAct = an.porMes(ing, []).find(x => x.clave === hoy.slice(0, 7)), isr = an.isrResico(mesAct ? mesAct.ingresos : 0);
    const deps = d.cortes.filter(c => c.tipo === 'deposito-rappi').sort((a, b) => b.fecha.localeCompare(a.fecha));
    h += recordatoriosHtml(app) || '<div class="mini" style="margin-top:12px">Al corriente: sin pendientes fiscales de este mes.</div>';
    h += `<div class="taskday"><h3>Tu mes fiscal</h3>
      <div class="insumorow"><span>Día 1</span><span class="folio">Factura global del mes anterior</span></div>
      <div class="insumorow"><span>Antes del 17</span><span class="folio">Declaración mensual</span></div>
      <div class="insumorow"><span>Cobrado en ${esc(nMes(hoy.slice(0, 7)))}</span><span class="folio">${dinero(Math.round(mesAct ? mesAct.ingresos : 0))}</span></div>
      <div class="insumorow"><span>ISR RESICO estimado · ${isr.tasa}%</span><span class="folio">${dinero(isr.isr)}</span></div>
      <div class="smallnote">Fechas y tabla de RESICO tomadas de Manual_Tramites_KUMAI. El ISR es un estimado sobre lo cobrado; no incluye IVA ni IEPS, que siguen pendientes de definir con contador. El plazo exacto de la factura global también.</div></div>
      <div class="taskday"><h3>Rappi</h3><div class="smallnote" style="margin-top:12px">Anota cada depósito con los datos de la Relación de ventas de Rappi. Así entra al registro fiscal con su venta bruta, comisión y retenciones.</div>
      <div class="acciones"><button class="secondary" data-accion="dinero.deposito" data-id="">Registrar depósito de Rappi</button></div>
      ${deps.map(c => `<div class="recrow" data-accion="dinero.deposito" data-id="${esc(c.id)}"><div class="crece"><b>Depósito del ${esc(fechaCorta(c.fecha))}</b><span>venta bruta ${dinero(c.ventaBruta)} · comisión y promos ${dinero((c.comision || 0) + (c.promos || 0))} · retenciones ${dinero(c.retenciones || 0)}</span></div><div class="der"><span class="num">${dinero(c.deposito)}</span></div></div>`).join('')}</div>
      <div class="taskday"><h3>Registro fiscal ${anio}</h3><div class="smallnote" style="margin-top:12px">Genera KUMAI_Registro_Fiscal_${anio}.xlsx con tres hojas: Ingresos (${ing.length} renglones), Gastos y Resumen mensual. Es el archivo para tu contador.</div>
      <div class="acciones"><button class="primary" data-accion="dinero.xlsx" data-anio="${anio}">Generar el .xlsx</button></div></div>`;
  }
  return h;
}

function formGasto(app) {
  const g = app.ui.gasto;
  return `<h3>${g.id ? 'Editar gasto' : 'Anotar gasto'}</h3>
    <div class="dos"><div><label for="gMonto">Monto $</label><input id="gMonto" type="number" inputmode="decimal" min="0" step="any" value="${g.monto ?? ''}"></div><div><label for="gFecha">Fecha</label><input id="gFecha" type="date" value="${esc(g.fecha || app.hoy())}"></div></div>
    <label>Categoría</label><div class="chips" id="gCats">${categorias(app).map(c => `<button type="button" class="chip ${g.categoria === c ? 'on' : ''}" data-accion="dinero.cat" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <label for="gCatNueva">O una categoría nueva</label><input id="gCatNueva" placeholder="Se guarda en tu lista">
    <label for="gConcepto">Concepto</label><input id="gConcepto" value="${esc(g.concepto || '')}" placeholder="Contenedores, gasolina, stand…">
    <label for="gProv">Proveedor</label><input id="gProv" value="${esc(g.proveedor || '')}">
    <label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--tinta)"><input type="checkbox" id="gFactura" style="width:auto;margin-right:10px" ${g.conFactura ? 'checked' : ''}>Tengo factura a mi RFC</label>
    <label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--tinta)"><input type="checkbox" id="gDeducible" style="width:auto;margin-right:10px" ${g.deducible ? 'checked' : ''}>Marcar como deducible</label>
    <label for="gComp">Comprobante (folio o nota)</label><input id="gComp" value="${esc(g.comprobante || '')}">
    <div class="smallnote">En RESICO los gastos no bajan el ISR, pero la factura respalda tu costo y su IVA puede acreditarse: pídela siempre que puedas.</div>
    <div class="modal-actions">${g.id ? `<button class="peligro" data-accion="dinero.borrarGasto">Eliminar</button>` : `<button class="secondary" data-accion="app.cerrarModal">Cancelar</button>`}<button class="primary" data-accion="dinero.guardarGasto">Guardar</button></div>`;
}
function formDeposito(app) {
  const c = app.ui.deposito, pct = app.cfg().comisionRappiPct;
  return `<h3>Depósito de Rappi</h3><div class="mini">Copia los totales de la Relación de ventas (pestaña Resumen).</div>
    <div class="dos"><div><label for="dFecha">Fecha del depósito</label><input id="dFecha" type="date" value="${esc(c.fecha || app.hoy())}"></div><div><label for="dBruta">Venta bruta $</label><input id="dBruta" type="number" inputmode="decimal" step="any" value="${c.ventaBruta ?? ''}"></div></div>
    <div class="dos"><div><label for="dCom">Comisión + IVA $</label><input id="dCom" type="number" inputmode="decimal" step="any" value="${c.comision ?? ''}"></div><div><label for="dPromo">Promos a tu cargo $</label><input id="dPromo" type="number" inputmode="decimal" step="any" value="${c.promos ?? ''}" placeholder="0"></div></div>
    <div class="dos"><div><label for="dRet">Retenciones ISR + IVA $</label><input id="dRet" type="number" inputmode="decimal" step="any" value="${c.retenciones ?? ''}" placeholder="0"></div><div><label for="dDep">Depósito recibido $</label><input id="dDep" type="number" inputmode="decimal" step="any" value="${c.deposito ?? ''}"></div></div>
    <div class="smallnote">Si dejas vacío el depósito, lo calculo: venta bruta − comisión − promos − retenciones. La app tiene la comisión de Rappi en ${pct}%.</div>
    <div class="modal-actions">${c.id ? `<button class="peligro" data-accion="dinero.borrarDeposito">Eliminar</button>` : `<button class="secondary" data-accion="app.cerrarModal">Cancelar</button>`}<button class="primary" data-accion="dinero.guardarDeposito">Guardar</button></div>`;
}

export const acciones = {
  sub: (app, d) => { estado(app).sub = d.sub; app.render(); },
  gasto(app, d) { app.ui.gasto = d.id ? clonar(app.base.get('gastos', d.id)) : { categoria: 'Insumos' }; app.modal(formGasto(app)); },
  cat(app, d) { app.ui.gasto.categoria = d.cat; for (const b of document.querySelectorAll('#gCats .chip')) b.classList.toggle('on', b.dataset.cat === d.cat); },
  async guardarGasto(app) {
    const v = id => document.getElementById(id).value, g = app.ui.gasto, monto = Number(v('gMonto'));
    if (!(monto > 0)) return app.toast('Escribe el monto');
    const nueva = v('gCatNueva').trim(), cfg = app.cfg();
    if (nueva && !categorias(app).includes(nueva)) await app.base.guardar('config', { ...cfg, categoriasGasto: [...categorias(app), nueva] });
    await app.base.guardar('gastos', { ...g, monto, fecha: v('gFecha') || app.hoy(), categoria: nueva || g.categoria || 'Otros', concepto: v('gConcepto').trim(), proveedor: v('gProv').trim(), conFactura: document.getElementById('gFactura').checked, deducible: document.getElementById('gDeducible').checked, comprobante: v('gComp').trim() });
    app.ui.gasto = null; app.cerrarModal(); app.render(); app.toast('Gasto guardado');
  },
  async borrarGasto(app) { await app.base.borrar('gastos', app.ui.gasto.id); app.cerrarModal(); app.render(); app.toast('Gasto eliminado'); },
  deposito(app, d) { app.ui.deposito = d.id ? clonar(app.base.get('cortes', d.id)) : {}; app.modal(formDeposito(app)); },
  async guardarDeposito(app) {
    const n = id => Number(document.getElementById(id).value) || 0, c = app.ui.deposito;
    if (!(n('dBruta') > 0)) return app.toast('Escribe la venta bruta');
    const deposito = document.getElementById('dDep').value === '' ? Math.round((n('dBruta') - n('dCom') - n('dPromo') - n('dRet')) * 100) / 100 : n('dDep');
    await app.base.guardar('cortes', { ...c, tipo: 'deposito-rappi', puntoVenta: 'Rappi', fecha: document.getElementById('dFecha').value || app.hoy(), ventaBruta: n('dBruta'), comision: n('dCom'), promos: n('dPromo'), retenciones: n('dRet'), deposito });
    app.ui.deposito = null; app.cerrarModal(); app.render(); app.toast('Depósito guardado');
  },
  async borrarDeposito(app) { await app.base.borrar('cortes', app.ui.deposito.id); app.cerrarModal(); app.render(); app.toast('Depósito eliminado'); },
  async fiscalHecho(app, d) {
    const cfg = app.cfg(), f = { ...(cfg.fiscal || {}) };
    f[d.mes] = { ...(f[d.mes] || {}), [d.clave]: true };
    await app.base.guardar('config', { ...cfg, fiscal: f }); app.render(); app.toast('Anotado');
  },
  xlsx(app, d) {
    const r = an.registroFiscal(datos(app), Number(d.anio));
    app.descargar(`KUMAI_Registro_Fiscal_${d.anio}.xlsx`, r.bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    app.toast(`Registro fiscal generado: ${r.ingresos.length} ingresos y ${r.gastos.length} gastos`);
  },
};
