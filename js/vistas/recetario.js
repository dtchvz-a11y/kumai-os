// KUMAI OS · Recetario editable: sabores, insumos, preparaciones base e importador del .md
import { esc, dinero, clonar } from '../util.js';
import { costoReceta, costoBase, costoUnidadBase, margen, ID_BASE_CREMA, ID_BASE_SOLETAS } from '../costeo.js';
import { leerRecetario } from '../recetario-md.js';
import { construirSemilla, compararConActual, idReceta } from '../semilla.js';
import { vidaVenta } from '../motor.js';

const CATS = ['Café', 'Fruta', 'Cítrico', 'Galleta', 'Tendencia', 'Permanente', 'Invierno', 'Primavera', 'Verano', 'Otoño', 'Premium', 'Tier S', 'En validación'];
const MODO = { batch: 'Bote del batch + grenetina', soletas: 'Soletas caseras', fijo: 'Costo fijo por molde' };
const n2 = v => Math.round(v * 100) / 100;
const estado = app => app.ui.rec || (app.ui.rec = { sub: 'sabores' });
const precios = (app, r) => ({
  rebanada: (app.producto(r.id, 'rebanada') || { precios: {} }).precios.WhatsApp ?? 0,
  molde: (app.producto(r.id, 'molde') || { precios: {} }).precios.WhatsApp ?? 0,
  rappi: (app.producto(r.id, 'rappi') || { precios: {} }).precios.Rappi ?? 0,
});

export function render(app) {
  const u = estado(app);
  let h = `<h2 class="viewtitle">Recetario</h2>
    <div class="seg">${[['sabores', 'Sabores'], ['insumos', 'Insumos'], ['bases', 'Bases']].map(([k, t]) => `<button class="${u.sub === k ? 'on' : ''}" data-accion="recetario.sub" data-sub="${k}">${t}</button>`).join('')}</div>`;
  if (u.sub === 'sabores') h += saboresHtml(app);
  else if (u.sub === 'insumos') h += insumosHtml(app);
  else h += basesHtml(app);
  return h;
}

function filaSabor(app, r) {
  const c = costoReceta(r, app.ctx()), p = precios(app, r);
  const m = margen(p.rebanada, c.rebanada).pct;
  return `<div class="recrow" data-accion="recetario.ver" data-id="${esc(r.id)}"><span class="nro">${r.num}</span>
    <div class="crece"><b>${esc(r.nombre)}</b><span>${esc(r.categoria || '')}${p.rebanada >= (app.cfg().precios || {}).premium ? ' · Premium' : ''}${r.validacion ? ' · en validación' : ''}${r.archivada ? ' · archivada' : ''}</span></div>
    <div class="der"><span class="num">${dinero(c.molde)}</span><small>${m}% · ${dinero(Math.round(c.rebanada))}/reb</small></div></div>`;
}

function saboresHtml(app) {
  const todas = app.sabores(true);
  const oper = todas.filter(r => r.menu === 'operativo' && !r.archivada), res = todas.filter(r => r.menu !== 'operativo' && !r.archivada), arch = todas.filter(r => r.archivada);
  const ctx = app.ctx();
  const prom = oper.length ? Math.round(oper.reduce((s, r) => s + costoReceta(r, ctx).molde, 0) / oper.length) : 0;
  let h = `<div class="taskday"><h3>Menú operativo · ${oper.length} sabores · promedio ${dinero(prom)} por molde</h3>${oper.map(r => filaSabor(app, r)).join('') || '<div class="mini" style="padding:12px 0">Ningún sabor en el operativo.</div>'}</div>
    <div class="taskday"><h3>Menú de reserva · ${res.length} sabores</h3>${res.map(r => filaSabor(app, r)).join('')}</div>`;
  if (arch.length) h += `<div class="taskday"><h3>Archivadas · ${arch.length}</h3>${arch.map(r => filaSabor(app, r)).join('')}</div>`;
  h += `<div class="mini">Costo por molde con ingredientes, sin buffer, igual que en Recetario_KUMAI v${esc(app.cfg().recetarioVersion || '—')}. El margen es el de la rebanada en venta directa.</div>
    <div class="acciones"><button class="secondary" data-accion="recetario.nueva">Nueva receta</button>
    <label class="secondary" style="display:block;text-align:center;border:1.5px solid var(--canela);border-radius:3px;padding:13px 16px;margin:0;font-size:12px;color:var(--chocolate);cursor:pointer;letter-spacing:.13em">Importar Recetario_KUMAI.md
      <input type="file" accept=".md,.txt,text/markdown,text/plain" data-entrada="recetario.archivo" hidden></label></div>`;
  return h;
}

function textoPresentacion(i) {
  const p = i.presentacion || { nombre: i.unidad, cantidad: 1 };
  return p.cantidad === 1 ? `por ${p.nombre}` : `por ${p.nombre} de ${p.cantidad} ${i.unidad}`;
}
function insumosHtml(app) {
  const ins = app.base.lista('insumos').sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '') || a.nombre.localeCompare(b.nombre));
  const grupos = { crema: 'Crema base', grenetina: 'Grenetina', soletas: 'Soletas', otro: 'Otros' };
  let h = '', g = null;
  for (const i of ins) {
    if (i.grupo !== g) { if (g !== null) h += '</div>'; g = i.grupo; h += `<div class="taskday"><h3>${grupos[g] || 'Otros'}</h3>`; }
    const p = i.presentacion || { cantidad: 1 };
    h += `<div class="recrow" data-accion="recetario.insumo" data-id="${esc(i.id)}"><div class="crece"><b>${esc(i.nombre)}</b><span>${esc(textoPresentacion(i))}${i.proveedor ? ' · ' + esc(i.proveedor) : ''}</span></div>
      <div class="der"><span class="num">${dinero(n2(i.costoUnitario * p.cantidad))}</span></div></div>`;
  }
  if (g !== null) h += '</div>';
  return h + `<div class="mini">Al cambiar un costo aquí se recalculan al instante todas las recetas que usan ese insumo. Concentrados, baños y toppings se editan dentro de cada sabor. Existencias y compras llegan en la Fase 2.</div>
    <div class="acciones"><button class="secondary" data-accion="recetario.insumo" data-id="">Nuevo insumo</button></div>`;
}

function basesHtml(app) {
  const ctx = app.ctx(); let h = '';
  for (const b of [...ctx.bases.values()]) {
    const total = costoBase(b, ctx);
    h += `<div class="taskday"><h3>${esc(b.nombre)} · rinde ${b.rinde} ${esc(b.unidadRinde || '')}${b.rinde === 1 ? '' : 's'}</h3>
      <table class="tabla">${b.insumos.map(l => { const i = ctx.insumos.get(l.insumoId); return `<tr><td>${esc(i ? i.nombre : l.insumoId)}<small>${l.cantidad} ${esc(i ? i.unidad : '')}</small></td><td class="r">${dinero(n2(i ? l.cantidad * i.costoUnitario : 0))}</td></tr>`; }).join('')}
      ${b.ajuste ? `<tr><td>Ajuste del recetario<small>El .md declara un total distinto a la suma de sus renglones.</small></td><td class="r">${dinero(b.ajuste)}</td></tr>` : ''}
      <tr class="total"><td>Total</td><td class="r">${dinero(n2(total))}</td></tr>
      <tr><td>Por ${esc(b.unidadRinde || 'unidad')}${b.id === ID_BASE_SOLETAS ? `<small>${app.cfg().soletasPorMolde} soletas por molde = ${dinero(Math.round(app.cfg().soletasPorMolde * total / b.rinde))}</small>` : ''}</td><td class="r"><b>${dinero(n2(total / b.rinde))}</b></td></tr></table>
      <div class="acciones"><button class="secondary" data-accion="recetario.base" data-id="${esc(b.id)}">Editar cantidades</button></div></div>`;
  }
  return h + `<div class="mini">Grenetina: se costea por gramo según lo que pide cada sabor (2, 3 o 4 cubos de 5 g). No va dentro del batch.</div>`;
}

// ---------- detalle de un sabor ----------
function detalleHtml(app, r) {
  const ctx = app.ctx(), cfg = app.cfg(), c = costoReceta(r, ctx), p = precios(app, r);
  const fila = (canal, precio, costo, costoBuf, com = 0) => {
    const a = margen(precio, costo, com), b = margen(precio, costoBuf, com);
    return `<tr><td>${canal}<small>con buffer ${cfg.bufferPct}%: ${dinero(n2(b.utilidad))} · ${b.pct}%</small></td><td class="r">${dinero(precio)}</td><td class="r">${dinero(n2(a.utilidad))}</td><td class="r"><b>${a.pct}%</b></td></tr>`;
  };
  return `<h3>#${r.num} ${esc(r.nombre)}</h3>
    <div><span class="tag ${r.menu === 'operativo' ? 'OP' : ''}">${r.menu === 'operativo' ? 'Menú operativo' : 'Menú de reserva'}</span> <span class="tag">${esc(r.categoria || '')}</span>
      ${r.validacion ? ' <span class="tag aviso">En validación</span>' : ''}${r.alergeno ? ` <span class="tag aviso">${esc(r.alergeno)}</span>` : ''}${r.archivada ? ' <span class="tag">Archivada</span>' : ''}</div>
    ${r.descripcion ? `<p class="mini" style="margin:10px 0 0">${esc(r.descripcion)}</p>` : ''}
    <div class="grid2" style="margin-top:14px"><div class="stat"><div class="n">${dinero(c.molde)}</div><div class="l">Costo por molde</div></div>
      <div class="stat"><div class="n">${dinero(Math.round(c.rebanada))}</div><div class="l">Por rebanada · ${c.rebanadas} por molde</div></div></div>
    <div class="mini" style="margin-top:8px">Con buffer operativo de ${cfg.bufferPct}%: ${dinero(Math.round(c.moldeConBuffer))} por molde · ${dinero(n2(c.rebanadaConBuffer))} por rebanada.</div>
    <div class="cintillo">Componentes</div>
    <table class="tabla">${c.componentes.map(x => `<tr><td><b>${esc(x.nombre)}</b><small>${esc(x.detalle || '')}</small>${x.modo !== 'fijo' ? `<small>${MODO[x.modo]}: se calcula desde los insumos.</small>` : ''}${x.rango ? `<small>El recetario da ${dinero(x.rango[0])}–${x.rango[1]}; aquí va el tope.</small>` : ''}</td><td class="r">${dinero(Math.round(x.costoCalc))}</td></tr>`).join('')}
      <tr class="total"><td>Molde</td><td class="r">${dinero(c.molde)}</td></tr></table>
    <div class="cintillo">Margen por canal</div>
    <table class="tabla"><tr><th>Canal</th><th class="r">Precio</th><th class="r">Utilidad</th><th class="r">Margen</th></tr>
      ${fila('Rebanada directa', p.rebanada, c.rebanada, c.rebanadaConBuffer)}
      ${fila('Molde completo', p.molde, c.molde, c.moldeConBuffer)}
      ${fila(`Porción Rappi (−${cfg.comisionRappiPct}%)`, p.rappi, c.rebanada, c.rebanadaConBuffer, cfg.comisionRappiPct)}</table>
    <div class="cintillo">Datos de producción</div>
    <div class="insumorow"><span>Grenetina</span><span class="folio">${r.grenetinaG != null ? `${r.grenetinaG} g · ${Math.ceil(r.grenetinaG / 5)} cubos` : '—'}</span></div>
    <div class="insumorow"><span>Peso de la crema al molde</span><span class="folio">${r.pesoRango ? `${r.pesoRango[0]}–${r.pesoRango[1]} g` : 'sin dato'}</span></div>
    <div class="insumorow"><span>Crema</span><span class="folio">${r.sinBatch ? 'Base propia (sin batch)' : '1 bote del batch'}</span></div>
    <div class="insumorow"><span>Vida en vitrina</span><span class="folio">${vidaVenta(r)} días</span></div>
    <div class="insumorow"><span>Base</span><span class="folio">${r.usaSoletas ? `${cfg.soletasPorMolde} soletas` : 'Sin soletas'}</span></div>
    ${r.pasos && r.pasos.length ? `<details style="margin-top:14px"><summary>Procedimiento · ${r.pasos.length} pasos</summary><ol>${r.pasos.map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}
    ${r.notas && r.notas.length ? `<details><summary>Notas · ${r.notas.length}</summary><ul>${r.notas.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
    <div class="acciones" style="margin-top:18px">
      <button class="primary" data-accion="recetario.mover" data-id="${esc(r.id)}">${r.menu === 'operativo' ? 'Pasar al menú de reserva' : 'Pasar al menú operativo'}</button>
      <div class="acciones h" style="margin-top:0"><button class="secondary" data-accion="recetario.editar" data-id="${esc(r.id)}">Editar</button>
      <button class="peligro" data-accion="recetario.archivar" data-id="${esc(r.id)}">${r.archivada ? 'Recuperar' : 'Archivar'}</button></div>
      <button class="ghost" data-accion="app.cerrarModal">Cerrar</button></div>`;
}

function verReceta(app, id) { const r = app.base.get('recetas', id); if (r) app.modal(detalleHtml(app, r)); }

// ---------- formulario de sabor ----------
function formHtml(app) {
  const f = app.ui.recForm, r = f.r;
  return `<h3>${f.nueva ? 'Nueva receta' : 'Editar #' + r.num}</h3>
    <label for="rNombre">Nombre en el menú</label><input id="rNombre" value="${esc(r.nombre)}" data-entrada="recetario.campo" data-campo="nombre">
    <div class="dos"><div><label for="rCat">Categoría</label><select id="rCat" data-entrada="recetario.campo" data-campo="categoria">${[...new Set([r.categoria, ...CATS])].filter(Boolean).map(c => `<option ${c === r.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label for="rMenu">Menú</label><select id="rMenu" data-entrada="recetario.campo" data-campo="menu"><option value="operativo" ${r.menu === 'operativo' ? 'selected' : ''}>Operativo</option><option value="reserva" ${r.menu !== 'operativo' ? 'selected' : ''}>Reserva</option></select></div></div>
    <div class="tres"><div><label for="rPR">Rebanada $</label><input id="rPR" type="number" inputmode="decimal" value="${f.precios.rebanada}" data-entrada="recetario.precio" data-campo="rebanada"></div>
      <div><label for="rPM">Molde $</label><input id="rPM" type="number" inputmode="decimal" value="${f.precios.molde}" data-entrada="recetario.precio" data-campo="molde"></div>
      <div><label for="rPP">Rappi $</label><input id="rPP" type="number" inputmode="decimal" value="${f.precios.rappi}" data-entrada="recetario.precio" data-campo="rappi"></div></div>
    <div class="tres"><div><label for="rG">Grenetina g</label><input id="rG" type="number" inputmode="decimal" value="${r.grenetinaG ?? ''}" data-entrada="recetario.numero" data-campo="grenetinaG"></div>
      <div><label for="rP0">Peso mín g</label><input id="rP0" type="number" inputmode="numeric" value="${r.pesoRango ? r.pesoRango[0] : ''}" data-entrada="recetario.peso" data-i="0"></div>
      <div><label for="rP1">Peso máx g</label><input id="rP1" type="number" inputmode="numeric" value="${r.pesoRango ? r.pesoRango[1] : ''}" data-entrada="recetario.peso" data-i="1"></div></div>
    <label for="rVida">Días que se puede vender ya armado</label><input id="rVida" type="number" inputmode="numeric" min="1" max="7" value="${vidaVenta(r)}" data-entrada="recetario.numero" data-campo="vidaVentaDias">
    <label>Componentes y costo por molde</label>
    <div id="rComps">${compsHtml(app)}</div>
    <button type="button" class="ghost" data-accion="recetario.masComp">Agregar componente</button>
    <label><input type="checkbox" style="width:auto;margin-right:8px" ${r.validacion ? 'checked' : ''} data-entrada="recetario.check" data-campo="validacion">En validación (sin probar físicamente)</label>
    <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="recetario.guardar">Guardar</button></div>`;
}
function compsHtml(app) {
  const f = app.ui.recForm, ctx = app.ctx();
  const c = costoReceta(f.r, ctx);
  return f.r.componentes.map((x, i) => `<div class="comprow"><div><input value="${esc(x.nombre)}" data-entrada="recetario.comp" data-i="${i}" data-campo="nombre" aria-label="Nombre del componente">
      <select style="margin-top:6px" data-entrada="recetario.comp" data-i="${i}" data-campo="modo" aria-label="Cómo se costea">${Object.entries(MODO).map(([k, t]) => `<option value="${k}" ${x.modo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div>${x.modo === 'fijo' ? `<input type="number" inputmode="decimal" value="${x.costo}" data-entrada="recetario.comp" data-i="${i}" data-campo="costo" aria-label="Costo">` : `<div class="num" style="font-size:19px;padding:12px 0;text-align:right">${dinero(Math.round(c.componentes[i].costoCalc))}</div>`}
      <button type="button" class="ghost" style="padding:4px 0;float:right" data-accion="recetario.menosComp" data-i="${i}">Quitar</button></div></div>`).join('')
    + `<div class="totalbar"><span>Costo por molde</span><span class="num">${dinero(c.molde)}</span></div>`;
}
function abrirForm(app, r) {
  const nueva = !r;
  if (nueva) {
    const num = Math.max(0, ...app.sabores(true).map(x => x.num)) + 1;
    r = {
      id: idReceta(num), tipo: 'sabor', num, nombre: '', titulo: '', descripcion: '', menu: 'reserva', categoria: 'En validación',
      componentes: [
        { clave: 'crema', nombre: 'Crema base universal', detalle: '1 bote del batch + grenetina', modo: 'batch', costo: 0 },
        { nombre: 'Concentrado de sabor', detalle: '', modo: 'fijo', costo: 0 },
        { clave: 'base', nombre: 'Base', detalle: 'Soletas KUMAI caseras', modo: 'soletas', costo: 0 },
        { nombre: 'Baño para soletillas', detalle: '', modo: 'fijo', costo: 0 },
        { nombre: 'Topping y decoración', detalle: '', modo: 'fijo', costo: 0 },
      ],
      grenetinaG: 10, pesoRango: [620, 650], sinBatch: false, usaSoletas: true, rebanadas: app.cfg().rebanadasPorMolde, pasos: [], notas: [], validacion: true, alergeno: null, archivada: false,
    };
  }
  const cp = app.cfg().precios;
  app.ui.recForm = { nueva, r: clonar(r), precios: nueva ? { rebanada: cp.rebanada, molde: cp.molde, rappi: cp.rebanada } : precios(app, r) };
  app.modal(formHtml(app));
}

// ---------- importador ----------
function reporteHtml(app) {
  const d = app.ui.dif;
  const grupos = { recetas: 'Recetas', insumos: 'Insumos', productos: 'Precios de venta', config: 'Ajustes' };
  let h = `<h3>Importar recetario v${esc(d.version || '—')}</h3>
    <div class="mini">Leí ${d.sabores} sabores de <b>${esc(d.archivo)}</b>. Nada cambia hasta que toques "Aplicar".</div>`;
  if (d.avisos.length) h += `<div class="alert soft"><div><b>Avisos del recetario</b><ul style="margin:6px 0 0;padding-left:18px">${d.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div></div>`;
  if (!d.cambios.length) h += `<div class="empty"><div class="big">Sin diferencias</div>La app ya coincide con este recetario.</div>`;
  for (const [ent, titulo] of Object.entries(grupos)) {
    const cs = d.cambios.filter(c => c.entidad === ent);
    if (!cs.length) continue;
    h += `<div class="cintillo">${titulo} · ${cs.length}</div>` + cs.slice(0, 60).map(c => `<div class="difrow"><b>${esc(c.nombre)}${c.tipo === 'nuevo' ? ' · nuevo' : ''}</b><ul>${c.detalle.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')
      + (cs.length > 60 ? `<div class="mini">…y ${cs.length - 60} más.</div>` : '');
  }
  if (d.soloEnApp.length) h += `<div class="cintillo">Solo en la app (se conservan)</div><div class="mini">${d.soloEnApp.map(esc).join(' · ')}</div>`;
  h += `<div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">${d.cambios.length ? 'Cancelar' : 'Cerrar'}</button>${d.cambios.length ? `<button class="primary" data-accion="recetario.aplicar">Aplicar ${d.cambios.length} ${d.cambios.length === 1 ? 'cambio' : 'cambios'}</button>` : ''}</div>`;
  return h;
}

/** Usado también por la carga inicial. */
export function prepararImportacion(app, texto, archivo) {
  const leido = leerRecetario(texto);
  if (!leido.recetas.length) throw new Error('Ese archivo no parece ser Recetario_KUMAI.md: no encontré recetas.');
  const semilla = construirSemilla(leido);
  const b = app.base;
  const dif = compararConActual(semilla, { insumos: b.todos('insumos'), recetas: b.todos('recetas'), productos: b.todos('productos'), config: b.get('config', 'config') });
  app.ui.dif = { ...dif, version: leido.version, sabores: leido.recetas.length, archivo };
  return app.ui.dif;
}

export const acciones = {
  sub: (app, d) => { estado(app).sub = d.sub; app.render(); },
  ver: (app, d) => verReceta(app, d.id),
  nueva: app => abrirForm(app, null),
  editar: (app, d) => abrirForm(app, app.base.get('recetas', d.id)),
  async mover(app, d) {
    const r = app.base.get('recetas', d.id); const menu = r.menu === 'operativo' ? 'reserva' : 'operativo';
    await app.base.guardar('recetas', { ...r, menu });
    const prods = app.base.lista('productos').filter(p => p.recetaId === r.id).map(p => ({ ...p, activo: menu === 'operativo' }));
    await app.base.guardarVarios('productos', prods);
    app.render(); verReceta(app, d.id); app.toast(`${r.nombre}: ahora en el menú ${menu === 'operativo' ? 'operativo' : 'de reserva'}`);
  },
  async archivar(app, d) {
    const r = app.base.get('recetas', d.id);
    await app.base.guardar('recetas', { ...r, archivada: !r.archivada, menu: r.archivada ? r.menu : 'reserva' });
    app.cerrarModal(); app.render(); app.toast(r.archivada ? 'Receta recuperada' : 'Receta archivada');
  },
  masComp: app => { app.ui.recForm.r.componentes.push({ nombre: 'Componente nuevo', detalle: '', modo: 'fijo', costo: 0 }); document.getElementById('rComps').innerHTML = compsHtml(app); },
  menosComp: (app, d) => { app.ui.recForm.r.componentes.splice(Number(d.i), 1); document.getElementById('rComps').innerHTML = compsHtml(app); },
  async guardar(app) {
    const f = app.ui.recForm, r = f.r;
    r.nombre = (r.nombre || '').trim();
    if (!r.nombre) return app.toast('Falta el nombre');
    if (!r.titulo) r.titulo = 'Tiramisú de ' + r.nombre;
    for (const c of r.componentes) { c.costo = Number(c.costo) || 0; if (c.modo === 'batch') c.clave = 'crema'; if (c.modo === 'soletas') c.clave = 'base'; }
    r.sinBatch = !r.componentes.some(c => c.modo === 'batch');
    r.usaSoletas = r.componentes.some(c => c.modo === 'soletas');
    if (r.pesoRango && !(r.pesoRango[0] > 0 && r.pesoRango[1] > 0)) r.pesoRango = null;
    const g = await app.base.guardar('recetas', r);
    const activo = g.menu === 'operativo' && !g.archivada;
    const defs = [['rebanada', { WhatsApp: f.precios.rebanada, Mostrador: f.precios.rebanada, Evento: f.precios.rebanada }], ['molde', { WhatsApp: f.precios.molde, Mostrador: f.precios.molde, Evento: f.precios.molde }], ['rappi', { Rappi: f.precios.rappi }]];
    await app.base.guardarVarios('productos', defs.map(([pres, pr]) => ({ ...(app.producto(g.id, pres) || { id: `prod-${g.id}-${pres}`, recetaId: g.id, presentacion: pres }), precios: pr, activo })));
    app.ui.recForm = null; app.render(); verReceta(app, g.id); app.toast('Receta guardada');
  },

  insumo(app, d) {
    const i = d.id ? app.base.get('insumos', d.id) : { nombre: '', unidad: 'g', costoUnitario: 0, presentacion: { nombre: 'kg', cantidad: 1000 }, proveedor: '', umbralMin: 0, grupo: 'otro' };
    const p = i.presentacion || { nombre: i.unidad, cantidad: 1 };
    app.ui.insumoId = d.id || null;
    app.modal(`<h3>${d.id ? esc(i.nombre) : 'Nuevo insumo'}</h3>
      <label for="iNombre">Nombre</label><input id="iNombre" value="${esc(i.nombre)}">
      <div class="tres"><div><label for="iPres">Se compra por</label><input id="iPres" value="${esc(p.nombre)}"></div>
        <div><label for="iCant">Contenido</label><input id="iCant" type="number" inputmode="decimal" value="${p.cantidad}"></div>
        <div><label for="iUni">Unidad</label><select id="iUni">${['g', 'ml', 'pza', 'cdita', 'cda'].map(u => `<option ${u === i.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>
      <label for="iCosto">Costo por presentación $</label><input id="iCosto" type="number" inputmode="decimal" step="0.01" value="${n2(i.costoUnitario * p.cantidad)}">
      <label for="iProv">Proveedor</label><input id="iProv" value="${esc(i.proveedor || '')}" placeholder="Sam's, Walmart, Bakeries and Berries…">
      <div class="smallnote">Ejemplo: Philadelphia se compra por barra, contenido 190, unidad g, costo 45.</div>
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="recetario.guardarInsumo">Guardar</button></div>`);
  },
  async guardarInsumo(app) {
    const v = id => document.getElementById(id).value;
    const cant = Number(v('iCant')) || 1, costo = Number(v('iCosto')) || 0, nombre = v('iNombre').trim();
    if (!nombre) return app.toast('Falta el nombre');
    const previo = app.ui.insumoId ? app.base.get('insumos', app.ui.insumoId) : { grupo: 'otro', umbralMin: 0 };
    await app.base.guardar('insumos', { ...previo, nombre, unidad: v('iUni'), presentacion: { nombre: v('iPres').trim() || v('iUni'), cantidad: cant }, costoUnitario: costo / cant, proveedor: v('iProv').trim() });
    app.cerrarModal(); app.render(); app.toast('Insumo guardado. Recetas recalculadas.');
  },

  base(app, d) {
    const b = app.base.get('recetas', d.id), ctx = app.ctx();
    app.ui.baseId = d.id;
    app.modal(`<h3>${esc(b.nombre)}</h3>
      <label for="bRinde">Rinde (${esc(b.unidadRinde || 'unidades')})</label><input id="bRinde" type="number" inputmode="numeric" value="${b.rinde}">
      <label>Cantidad por tanda</label>
      ${b.insumos.map((l, i) => { const ins = ctx.insumos.get(l.insumoId); return `<div class="stockfila"><div><b>${esc(ins ? ins.nombre : l.insumoId)}</b><span>${esc(ins ? ins.unidad : '')}</span></div><input type="number" inputmode="decimal" data-linea="${i}" value="${l.cantidad}"></div>`; }).join('')}
      <label for="bAjuste">Ajuste $ (diferencia declarada en el recetario)</label><input id="bAjuste" type="number" inputmode="decimal" step="0.01" value="${b.ajuste || 0}">
      <div class="smallnote">El molde de 10×40×6 usa ${b.id === ID_BASE_CREMA ? '1 bote' : app.cfg().soletasPorMolde + ' soletas'}. Costo actual por ${esc(b.unidadRinde)}: ${dinero(n2(costoUnidadBase(b, ctx)))}.</div>
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="recetario.guardarBase">Guardar</button></div>`);
  },
  async guardarBase(app) {
    const b = app.base.get('recetas', app.ui.baseId);
    const insumos = b.insumos.map((l, i) => ({ ...l, cantidad: Number(document.querySelector(`[data-linea="${i}"]`).value) || 0 }));
    await app.base.guardar('recetas', { ...b, rinde: Number(document.getElementById('bRinde').value) || b.rinde, insumos, ajuste: Number(document.getElementById('bAjuste').value) || 0 });
    app.cerrarModal(); app.render(); app.toast('Base guardada. Recetas recalculadas.');
  },

  async aplicar(app) {
    const d = app.ui.dif; if (!d) return;
    for (const ent of ['insumos', 'recetas', 'productos', 'config']) {
      const regs = d.cambios.filter(c => c.entidad === ent).map(c => ({ ...c.registro, deleted: false }));
      if (regs.length) await app.base.guardarVarios(ent, regs);
    }
    const n = d.cambios.length; app.ui.dif = null;
    app.cerrarModal(); app.render(); app.toast(`Recetario actualizado: ${n} ${n === 1 ? 'cambio' : 'cambios'}`);
  },
};

export const entradas = {
  campo: (app, d, el) => { app.ui.recForm.r[d.campo] = el.value; },
  check: (app, d, el) => { app.ui.recForm.r[d.campo] = el.checked; },
  numero: (app, d, el) => { app.ui.recForm.r[d.campo] = el.value === '' ? null : Number(el.value); if (d.campo === 'grenetinaG') refrescarTotal(app); },
  precio: (app, d, el) => { app.ui.recForm.precios[d.campo] = Number(el.value) || 0; },
  peso: (app, d, el) => { const r = app.ui.recForm.r; r.pesoRango = r.pesoRango || [0, 0]; r.pesoRango[Number(d.i)] = Number(el.value) || 0; },
  comp: (app, d, el) => {
    const c = app.ui.recForm.r.componentes[Number(d.i)];
    c[d.campo] = d.campo === 'costo' ? (Number(el.value) || 0) : el.value;
    if (d.campo === 'modo') document.getElementById('rComps').innerHTML = compsHtml(app); else if (d.campo === 'costo') refrescarTotal(app);
  },
  async archivo(app, d, el) {
    const f = el.files && el.files[0]; if (!f) return;
    const texto = await f.text(); el.value = '';
    prepararImportacion(app, texto, f.name);
    app.modal(reporteHtml(app));
  },
};

function refrescarTotal(app) {
  const t = document.querySelector('#rComps .totalbar .num');
  if (t) t.textContent = dinero(costoReceta(app.ui.recForm.r, app.ctx()).molde);
}
