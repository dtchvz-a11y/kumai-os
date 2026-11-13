// KUMAI OS · Ajustes: sincronización, costeo, respaldo, datos de prueba
import { esc } from '../util.js';
import { pedidosDePrueba, lunesDe, ENTIDADES } from '../modelo.js';
import { aplicarPreciosDeLista } from '../migraciones.js';

const hora = ms => (ms ? new Date(ms).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'nunca');
const FASE = { ok: 'Sincronizado', pendiente: 'Con cambios pendientes', sincronizando: 'Sincronizando', 'sin-conexion': 'Sin conexión', error: 'Con error', 'sin-configurar': 'Sin configurar: los datos viven solo en este equipo' };

export function render(app) {
  const m = app.base.meta, cfg = app.cfg(), r = app.sync.resumen();
  const disp = cfg.dispositivos || {};
  const bit = app.base.lista('bitacora').sort((a, b) => b.fecha - a.fecha);
  const nPrueba = app.base.lista('pedidos').filter(p => p.prueba).length;
  const nombreDisp = id => (disp[id] ? `${disp[id].nombre} (${disp[id].letra})` : id === 'servidor' ? 'servidor' : 'otro equipo');
  return `<h2 class="viewtitle">Ajustes</h2>

  <div class="taskday"><h3>Sincronización</h3>
    <div class="insumorow"><span>Estado</span><span class="folio">${FASE[r.fase]}</span></div>
    ${r.error ? `<div class="alert"><div>${esc(r.error)}</div></div>` : ''}
    <div class="insumorow"><span>Cambios esperando en este equipo</span><span class="folio">${r.pendientes}</span></div>
    <div class="insumorow"><span>Última sincronización</span><span class="folio">${hora(r.ultimaSync)}</span></div>
    <div class="insumorow"><span>Folios de este equipo</span><span class="folio">IND-${esc(app.letra())}0001</span></div>
    <label for="aUrl">Dirección del Apps Script</label><input id="aUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(m.syncUrl || '')}">
    <label for="aClave">Clave</label><input id="aClave" autocomplete="off" autocapitalize="off" value="${esc(m.syncClave || '')}">
    <label for="aNom">Nombre de este equipo</label><input id="aNom" value="${esc(m.nombreDispositivo || '')}" placeholder="PC, Celular…">
    <div class="acciones"><button class="primary" data-accion="ajustes.guardarSync">Guardar y sincronizar</button></div>
    <div class="smallnote">Los teléfonos de tus clientes son datos personales: la hoja de Google no se comparte con nadie. Guía de instalación: GUIA_SYNC.md.</div>
    ${Object.keys(disp).length ? `<div class="cintillo">Equipos conectados</div>${Object.entries(disp).map(([id, d]) => `<div class="insumorow"><span>${esc(d.nombre)}${id === app.base.deviceId ? ' · este equipo' : ''}</span><span class="folio">Letra ${esc(d.letra)}</span></div>`).join('')}` : ''}
    <div class="cintillo">Bitácora de conflictos · ${bit.length}</div>
    ${bit.length ? bit.slice(0, 25).map(b => `<div class="difrow"><b>${esc(b.resumen || b.regId)} · ${esc(b.entidad)}</b>${esc(hora(b.fecha))} · ${esc(b.resolucion)} Ganó ${esc(nombreDisp(b.gana))}; quedó atrás ${esc(nombreDisp(b.pierde))}.</div>`).join('') : '<div class="mini">Sin conflictos. Aquí se anota cuando dos equipos editan el mismo registro: siempre gana el cambio más reciente.</div>'}
  </div>

  <div class="taskday"><h3>Costeo</h3>
    <div class="tres"><div><label for="aBuf">Buffer %</label><input id="aBuf" type="number" inputmode="decimal" value="${cfg.bufferPct}"></div>
      <div><label for="aRappi">Rappi %</label><input id="aRappi" type="number" inputmode="decimal" value="${cfg.comisionRappiPct}"></div>
      <div><label for="aSol">Soletas/molde</label><input id="aSol" type="number" inputmode="numeric" value="${cfg.soletasPorMolde}"></div></div>
    <div class="smallnote">Buffer operativo: empaque, luz, etiquetas y transporte sobre el costo de ingredientes (15–20%). Recetario cargado: v${esc(cfg.recetarioVersion || '—')}.</div>
    <div class="acciones"><button class="secondary" data-accion="ajustes.guardarCosteo">Guardar costeo</button></div>
  </div>

  <div class="taskday"><h3>Mostrador</h3>
    <label>Moldes listos al abrir, por día</label>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${[['lun', 'L'], ['mar', 'M'], ['mie', 'X'], ['jue', 'J'], ['vie', 'V'], ['sab', 'S'], ['dom', 'D']].map(([k, t]) => `<div><div class="mini" style="text-align:center;font-weight:700">${t}</div><input type="number" inputmode="numeric" min="0" style="padding:11px 2px;text-align:center" data-min="${k}" value="${((cfg.mostrador || {}).minimoMoldes || {})[k] ?? 0}" aria-label="Mínimo ${k}"></div>`).join('')}</div>
    <label for="aVenta">Venta esperada por día, % del mínimo</label><input id="aVenta" type="number" inputmode="numeric" min="0" max="100" value="${(cfg.mostrador || {}).ventaEsperadaPct ?? 100}">
    <div class="smallnote">El mínimo cuenta el sobrante vigente. La venta esperada es el supuesto del plan: 100 significa que la vitrina se vacía a diario (lo más pesado en horas). Bájalo cuando tengas datos de tus ventas.</div>
    <div class="acciones"><button class="secondary" data-accion="ajustes.guardarMostrador">Guardar reglas de mostrador</button></div>
  </div>

  <div class="taskday"><h3>Precios de lista</h3>
    <div class="tres"><div><label for="pReb">Rebanada $</label><input id="pReb" type="number" inputmode="decimal" value="${cfg.precios.rebanada}"></div>
      <div><label for="pMol">Molde $</label><input id="pMol" type="number" inputmode="decimal" value="${cfg.precios.molde}"></div>
      <div><label for="pRap">Rappi $</label><input id="pRap" type="number" inputmode="decimal" value="${cfg.precios.rappi ?? cfg.precios.rebanada}"></div></div>
    <div class="tres"><div><label for="pRebP">Premium $</label><input id="pRebP" type="number" inputmode="decimal" value="${cfg.precios.premium}"></div>
      <div><label for="pMolP">Molde prem. $</label><input id="pMolP" type="number" inputmode="decimal" value="${cfg.precios.moldePremium}"></div>
      <div><label for="pRapP">Rappi prem. $</label><input id="pRapP" type="number" inputmode="decimal" value="${cfg.precios.rappiPremium ?? cfg.precios.premium}"></div></div>
    <div class="smallnote">Cambia el precio de todos los sabores de un jalón. Para un solo sabor: Recetario → el sabor → Editar. Los pedidos ya capturados conservan su precio.</div>
    <div class="acciones"><button class="secondary" data-accion="ajustes.guardarPrecios">Aplicar a todos los sabores</button></div>
  </div>

  <div class="taskday"><h3>Respaldo</h3>
    <div class="acciones"><button class="secondary" data-accion="ajustes.exportar">Exportar respaldo completo (JSON)</button>
    <label class="secondary" style="display:block;text-align:center;border:1.5px solid var(--canela);border-radius:3px;padding:13px 16px;margin:0;font-size:12px;color:var(--chocolate);cursor:pointer;letter-spacing:.13em">Importar respaldo
      <input type="file" accept=".json,application/json" data-entrada="ajustes.archivo" hidden></label></div>
    <div class="smallnote">El respaldo trae todo: recetario, pedidos, clientes, inventario y ajustes. Importarlo reemplaza lo que hay en este equipo.</div>
  </div>

  <div class="taskday"><h3>Datos de prueba</h3>
    <div class="smallnote" style="margin-top:12px">Carga una semana realista en la semana en curso para revisar la app. Quedan marcados como "Prueba" y se quitan con un toque.${nPrueba ? ` Hay ${nPrueba} pedidos de prueba.` : ''}</div>
    <div class="acciones h"><button class="secondary" data-accion="ajustes.prueba" data-moldes="10">Semana de 10 moldes</button><button class="secondary" data-accion="ajustes.prueba" data-moldes="35">Semana de 35 moldes</button></div>
    ${nPrueba ? `<div class="acciones"><button class="peligro" data-accion="ajustes.quitarPrueba">Quitar datos de prueba</button></div>` : ''}
  </div>

  <div class="taskday"><h3>Este equipo</h3>
    <div class="insumorow"><span>Versión</span><span class="folio">KUMAI OS ${esc(app.version)}</span></div>
    <div class="insumorow"><span>Registros guardados</span><span class="folio">${ENTIDADES.reduce((s, e) => s + app.base.lista(e).length, 0)}</span></div>
    <div class="acciones"><button class="secondary" data-accion="ajustes.repetirCarga">Repetir la carga inicial</button></div>
  </div>`;
}

async function quitarPrueba(app) {
  for (const e of ['pedidos', 'clientes']) {
    const regs = app.base.lista(e).filter(x => x.prueba).map(x => ({ ...x, deleted: true }));
    if (regs.length) await app.base.guardarVarios(e, regs);
  }
}

export const acciones = {
  async guardarSync(app) {
    const v = id => document.getElementById(id).value.trim();
    await app.base.metaSet('syncUrl', v('aUrl')); await app.base.metaSet('syncClave', v('aClave')); await app.base.metaSet('nombreDispositivo', v('aNom'));
    app.configurarSync();
    if (!v('aUrl')) { app.render(); return app.toast('Sincronización apagada: los datos viven solo en este equipo'); }
    await app.sincronizar(true);
    const cfg = app.cfg(), d = cfg.dispositivos || {}, yo = app.base.deviceId;
    if (d[yo] && v('aNom') && d[yo].nombre !== v('aNom')) await app.base.guardar('config', { ...cfg, dispositivos: { ...d, [yo]: { ...d[yo], nombre: v('aNom') } } });
    app.render();
  },
  async guardarCosteo(app) {
    const n = id => Number(document.getElementById(id).value);
    if (!(n('aSol') > 0) || n('aBuf') < 0 || n('aRappi') < 0 || n('aRappi') >= 100) return app.toast('Revisa los valores');
    await app.base.guardar('config', { ...app.cfg(), bufferPct: n('aBuf'), comisionRappiPct: n('aRappi'), soletasPorMolde: n('aSol') });
    app.render(); app.toast('Costeo guardado. Recetas recalculadas.');
  },
  async guardarMostrador(app) {
    const cfg = app.cfg(), minimoMoldes = {};
    for (const i of document.querySelectorAll('[data-min]')) minimoMoldes[i.dataset.min] = Math.max(0, Math.round(Number(i.value) || 0));
    const pct = Math.min(100, Math.max(0, Number(document.getElementById('aVenta').value) || 0));
    await app.base.guardar('config', { ...cfg, mostrador: { ...(cfg.mostrador || {}), minimoMoldes, ventaEsperadaPct: pct } });
    app.render(); app.toast('Reglas de mostrador guardadas. Plan recalculado.');
  },
  async guardarPrecios(app) {
    const n = id => Number(document.getElementById(id).value);
    const nuevos = { rebanada: n('pReb'), premium: n('pRebP'), molde: n('pMol'), moldePremium: n('pMolP'), rappi: n('pRap'), rappiPremium: n('pRapP') };
    if (Object.values(nuevos).some(v => !(v > 0))) return app.toast('Todos los precios deben ser mayores a cero');
    if (nuevos.premium <= nuevos.rebanada) return app.toast('El precio premium debe ser mayor al sencillo');
    const k = await aplicarPreciosDeLista(app.base, nuevos);
    app.render(); app.toast(`Precios aplicados a ${k / 3} sabores`);
  },
  exportar(app) {
    const r = app.base.exportar();
    app.descargar(`KUMAI_OS_respaldo_${app.hoy()}.json`, JSON.stringify(r));
    app.toast('Respaldo descargado');
  },
  async confirmarImportar(app) {
    const obj = app.ui.respaldo; app.ui.respaldo = null;
    await app.base.importar(obj);
    app.cerrarModal(); app.render(); app.toast('Respaldo importado');
    app.sincronizar();
  },
  async prueba(app, d) {
    await quitarPrueba(app);
    const r = pedidosDePrueba(Number(d.moldes), lunesDe(app.hoy()), { recetas: app.base.lista('recetas'), productos: app.base.lista('productos') });
    await app.base.guardarVarios('clientes', r.clientes); await app.base.guardarVarios('pedidos', r.pedidos);
    app.render(); app.toast(`Semana de prueba cargada: ${r.pedidos.length} pedidos, ${r.moldes} moldes`);
  },
  async quitarPrueba(app) { await quitarPrueba(app); app.render(); app.toast('Datos de prueba eliminados'); },
  async repetirCarga(app) { await app.base.metaSet('cargaInicial', false); app.ui.carga = null; app.render(); window.scrollTo(0, 0); },
};

export const entradas = {
  async archivo(app, d, el) {
    const f = el.files && el.files[0]; if (!f) return;
    let obj; try { obj = JSON.parse(await f.text()); } catch { el.value = ''; return app.toast('Ese archivo no es un JSON válido'); }
    el.value = '';
    if (!obj || obj.app !== 'KUMAI OS' || !obj.entidades) return app.toast('Ese archivo no es un respaldo de KUMAI OS');
    app.ui.respaldo = obj;
    const cuenta = e => (obj.entidades[e] || []).filter(x => !x.deleted).length;
    app.modal(`<h3>Importar respaldo</h3>
      <p>Respaldo del ${esc(String(obj.exportadoEl || '').slice(0, 10))}: ${cuenta('pedidos')} pedidos, ${cuenta('clientes')} clientes, ${cuenta('recetas')} recetas.</p>
      <div class="alert"><div><b>Reemplaza todo lo de este equipo.</b> Si tienes la sincronización activa, al sincronizar gana el cambio más reciente de cada registro.</div></div>
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="ajustes.confirmarImportar">Importar</button></div>`);
  },
};
