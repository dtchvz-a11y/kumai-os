// KUMAI OS · Inventario: existencias por movimientos, alertas de mínimo y lista de compras
import { esc, dinero } from '../util.js';
import * as op from '../operacion.js';

const estado = app => app.ui.inv || (app.ui.inv = { sub: 'existencias' });
const n2 = v => Math.round(v * 100) / 100;
const presTxt = (i, n) => { const p = i.presentacion || { nombre: i.unidad, cantidad: 1 }; return `${n2(n)} ${p.nombre}${/^(barra|bote|bolsa|lata|pieza|paquete|frasco|caja)$/.test(p.nombre) && n !== 1 ? 's' : ''}`; };
const baseTxt = (i, n) => `${Math.round(n).toLocaleString('es-MX')} ${i.unidad}`;

export function render(app) {
  const u = estado(app);
  let h = `<h2 class="viewtitle">Inventario</h2>
    <div class="seg">${[['existencias', 'Existencias'], ['7', 'Compras 7 días'], ['30', 'Compras 30 días']].map(([k, t]) => `<button class="${u.sub === k ? 'on' : ''}" data-accion="inventario.sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
  if (u.sub === 'existencias') {
    const filas = op.existencias(app.base), bajos = filas.filter(f => f.bajo), sinCapturar = filas.filter(f => f.existencia < 0);
    if (bajos.length) h += `<div class="alert"><div><b>Bajo el mínimo:</b> ${bajos.map(f => esc(f.insumo.nombre)).join(', ')}.</div></div>`;
    if (sinCapturar.length) h += `<div class="alert soft"><div><b>Falta capturar compras:</b> ${sinCapturar.map(f => esc(f.insumo.nombre)).join(', ')}. La app descontó producción de insumos que no tenía registrados.</div></div>`;
    h += filas.map(f => `<div class="recrow" data-accion="inventario.mov" data-id="${esc(f.insumo.id)}"><div class="crece"><b>${esc(f.insumo.nombre)}</b><span>${f.existencia < 0 ? 'sin capturar' : esc(baseTxt(f.insumo, f.existencia))}${f.insumo.umbralMin ? ` · mínimo ${esc(baseTxt(f.insumo, f.insumo.umbralMin))}` : ''}</span></div>
      <div class="der"><span class="num" style="${f.bajo || f.existencia < 0 ? '' : 'color:var(--tinta)'}">${f.existencia < 0 ? '—' : esc(presTxt(f.insumo, f.enPresentaciones))}</span></div></div>`).join('');
    h += `<div class="mini" style="margin-top:12px">Toca un insumo para registrar una compra, una merma o corregir lo que hay. La producción marcada como hecha descuenta sola.</div>`;
  } else {
    const dias = Number(u.sub), l = op.listaCompras(app.base, app.cfg(), dias, { hoy: app.hoy() });
    const comprar = l.filas.filter(f => f.comprar > 0), alcanza = l.filas.filter(f => f.comprar === 0);
    h += `<div class="mini" style="margin-top:12px">El plan de ${dias} días pide ${l.batches} ${l.batches === 1 ? 'batch' : 'batches'} de crema, ${l.tandas} ${l.tandas === 1 ? 'horneada' : 'horneadas'} y ${l.moldes} moldes. No incluye concentrados, baños ni toppings: esos se compran por sabor.</div>`;
    h += comprar.length ? `<div class="taskday"><h3>Comprar · ${dinero(Math.round(l.total))} aprox.</h3>${comprar.map(f => `<div class="recrow" data-accion="inventario.mov" data-id="${esc(f.insumo.id)}"><div class="crece"><b>${esc(f.insumo.nombre)}</b><span>se usan ${esc(baseTxt(f.insumo, f.uso))} · hay ${f.existencia < 0 ? 'sin capturar' : esc(baseTxt(f.insumo, f.existencia))}</span></div>
        <div class="der"><span class="num">${esc(presTxt(f.insumo, f.comprar))}</span><small>${dinero(Math.round(f.costo))}</small></div></div>`).join('')}</div>
      <div class="acciones"><button class="secondary" data-accion="inventario.copiar" data-dias="${dias}">Copiar lista de compras</button></div>` : `<div class="empty"><div class="big">Nada que comprar</div>Lo que hay alcanza para el plan de ${dias} días.</div>`;
    if (alcanza.length) h += `<div class="cintillo">Alcanza</div>${alcanza.map(f => `<div class="insumorow"><span>${esc(f.insumo.nombre)} · se usan ${esc(baseTxt(f.insumo, f.uso))}</span><span class="folio">${esc(presTxt(f.insumo, f.enPresentaciones))}</span></div>`).join('')}`;
  }
  return h;
}

export const acciones = {
  sub: (app, d) => { estado(app).sub = d.sub; app.render(); },
  mov(app, d) {
    const f = op.existencias(app.base).find(x => x.insumo.id === d.id), i = f.insumo, p = i.presentacion || { nombre: i.unidad, cantidad: 1 };
    app.ui.movId = d.id; app.ui.movTipo = 'compra';
    app.modal(`<h3>${esc(i.nombre)}</h3><div class="mini">Hay ${f.existencia < 0 ? 'sin capturar' : esc(presTxt(i, f.enPresentaciones)) + ' (' + esc(baseTxt(i, f.existencia)) + ')'}. Se cuenta en ${esc(p.nombre)}${p.cantidad > 1 ? ` de ${p.cantidad} ${esc(i.unidad)}` : ''}.</div>
      <div class="seg" id="mTipos">${[['compra', 'Compré'], ['merma', 'Merma'], ['ajuste', 'Hay en total']].map(([k, t]) => `<button type="button" class="${k === 'compra' ? 'on' : ''}" data-accion="inventario.tipo" data-tipo="${k}">${t}</button>`).join('')}</div>
      <label for="mCant">Cantidad en ${esc(p.nombre)}</label><input id="mCant" type="number" inputmode="decimal" min="0" step="any">
      <div id="mCostoBox"><label for="mCosto">Lo que pagaste en total $ (opcional)</label><input id="mCosto" type="number" inputmode="decimal" min="0" step="any">
        <div class="smallnote">Si lo escribes, el costo del insumo se actualiza y las recetas se recalculan. Si no, el costo del recetario se queda como está.</div></div>
      <label for="mMin">Avísame cuando haya menos de (${esc(p.nombre)})</label><input id="mMin" type="number" inputmode="decimal" min="0" step="any" value="${i.umbralMin ? n2(i.umbralMin / p.cantidad) : ''}" placeholder="sin aviso">
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="inventario.guardar">Guardar</button></div>`);
  },
  tipo(app, d) {
    app.ui.movTipo = d.tipo;
    for (const b of document.querySelectorAll('#mTipos button')) b.classList.toggle('on', b.dataset.tipo === d.tipo);
    document.getElementById('mCostoBox').hidden = d.tipo !== 'compra';
  },
  async guardar(app) {
    const v = id => document.getElementById(id).value, id = app.ui.movId, tipo = app.ui.movTipo;
    const i = app.base.get('insumos', id), p = (i.presentacion && i.presentacion.cantidad) || 1;
    const min = v('mMin') === '' ? 0 : Math.max(0, Number(v('mMin')) || 0) * p;
    if (min !== (i.umbralMin || 0)) await app.base.guardar('insumos', { ...i, umbralMin: min });
    if (v('mCant') !== '') {
      const n = Number(v('mCant'));
      if (!(n >= 0)) return app.toast('Revisa la cantidad');
      await op.registrarMovimiento(app.base, { insumoId: id, tipo, presentaciones: n, hoy: app.hoy(), costoPagado: tipo === 'compra' && v('mCosto') !== '' ? Number(v('mCosto')) : null });
    }
    app.cerrarModal(); app.render(); app.toast('Inventario actualizado');
  },
  copiar(app, d) {
    const l = op.listaCompras(app.base, app.cfg(), Number(d.dias), { hoy: app.hoy() });
    return app.copiar(`Compras KUMAI · ${d.dias} días\n` + l.filas.filter(f => f.comprar > 0).map(f => `- ${f.insumo.nombre}: ${presTxt(f.insumo, f.comprar)}`).join('\n'));
  },
};
