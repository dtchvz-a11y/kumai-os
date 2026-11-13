// KUMAI OS · arranque, navegación y cableado de la sincronización
import { crearAlmacenIDB, crearAlmacenMemoria } from './almacen.js';
import { Base } from './base.js';
import { Sync, transporteFetch } from './sync.js';
import { contexto } from './costeo.js';
import { letraLibre, VERSION_APP } from './modelo.js';
import { CONFIG_INICIAL, construirSemilla, sembrar } from './semilla.js';
import { esc, ymd, fechaLarga } from './util.js';
import { migrar } from './migraciones.js';
import * as hoy from './vistas/hoy.js';
import * as pedidos from './vistas/pedidos.js';
import * as recetario from './vistas/recetario.js';
import * as ajustes from './vistas/ajustes.js';
import * as carga from './vistas/carga-inicial.js';
import * as produccion from './vistas/produccion.js';
import * as inventario from './vistas/inventario.js';
import * as ventas from './vistas/ventas.js';
import * as dinero from './vistas/dinero.js';
import * as mas from './vistas/mas.js';
import * as simulador from './vistas/simulador.js';
import { entradaMotor } from './operacion.js';
import { planificar } from './motor.js';

const $ = id => document.getElementById(id);
const VISTAS = { hoy, pedidos, produccion, inventario, ventas, dinero, mas, recetario, ajustes, simulador };
const ETIQUETA_SYNC = {
  ok: () => 'Sincronizado', pendiente: r => `Pendiente ${r.pendientes}`, sincronizando: () => 'Sincronizando',
  'sin-conexion': r => (r.pendientes ? `Sin conexión · ${r.pendientes}` : 'Sin conexión'),
  error: () => 'Revisar sync', 'sin-configurar': r => (r.pendientes ? 'Solo aquí' : 'Solo aquí'),
};

export const app = {
  version: VERSION_APP, base: null, sync: null, vista: 'hoy', ui: {}, _ctx: null, _plan: {}, _toast: null, _renderPendiente: false,

  // ---------- datos de uso común ----------
  cfg() { return this.base.get('config', 'config') || CONFIG_INICIAL; },
  ctx() { return this._ctx || (this._ctx = contexto(this.base.lista('insumos'), this.base.lista('recetas'), this.cfg())); },
  sabores(incluirArchivadas = false) {
    return this.base.lista('recetas').filter(r => r.tipo === 'sabor' && (incluirArchivadas || !r.archivada)).sort((a, b) => a.num - b.num);
  },
  recetasPorId() { return this.base.porId('recetas'); },
  producto(recetaId, presentacion) { return this.base.lista('productos').find(p => p.recetaId === recetaId && p.presentacion === presentacion) || null; },
  letra() { const d = this.cfg().dispositivos || {}; return (d[this.base.deviceId] && d[this.base.deviceId].letra) || this.base.meta.letra || 'A'; },
  hoy() { return ymd(); },
  /** Entrada del motor con el estado real de este momento. */
  motorEntrada(dias = 14) { return entradaMotor(this.base, this.cfg(), { dias, hoy: this.hoy(), ahora: new Date() }); },
  /** Plan de producción; se recalcula en cada repintado. */
  plan(dias = 14) { return this._plan[dias] || (this._plan[dias] = planificar(this.motorEntrada(dias))); },

  // ---------- pantalla ----------
  ir(vista) { this.vista = vista; this.render(); window.scrollTo(0, 0); },
  render() {
    this._ctx = null; this._plan = {}; this._renderPendiente = false;
    const listo = !!this.base.meta.cargaInicial;
    $('tabbar').hidden = !listo; $('fab').hidden = !listo || !['hoy', 'pedidos'].includes(this.vista);
    $('fechaHoy').textContent = fechaLarga(this.hoy());
    $('view').innerHTML = listo ? VISTAS[this.vista].render(this) : carga.render(this);
    for (const b of $('tabbar').querySelectorAll('button')) b.classList.toggle('active', b.dataset.vista === (['recetario', 'ajustes', 'simulador'].includes(this.vista) ? 'mas' : this.vista));
  },
  /** Si estás escribiendo en un campo, no se repinta hasta que sueltes el campo. */
  renderSuave() {
    const a = document.activeElement;
    if (a && $('view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { this._renderPendiente = true; return; }
    this.render();
  },
  modal(html) { $('modalBody').innerHTML = html; $('modalBg').classList.add('open'); $('modalBody').scrollTop = 0; },
  cerrarModal() { $('modalBg').classList.remove('open'); $('modalBody').innerHTML = ''; },
  toast(msg, ms = 2600) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(this._toast); this._toast = setTimeout(() => t.classList.remove('show'), ms);
  },
  error(err) { console.error(err); this.toast('Algo falló: ' + (err && err.message ? err.message : err), 5000); },
  descargar(nombre, texto, tipo = 'application/json') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async copiar(texto) {
    try { await navigator.clipboard.writeText(texto); this.toast('Mensaje copiado'); }
    catch { this.toast('No pude copiar; selecciónalo a mano'); }
  },

  // ---------- semilla del recetario ----------
  async semilla() {
    if (!this._semilla) {
      const r = await fetch('datos/recetario-semilla.json');
      this._semilla = construirSemilla((await r.json()).leido);
    }
    return this._semilla;
  },
  async sembrar() { const s = await this.semilla(); await sembrar(this.base, s); return s; },

  // ---------- sincronización ----------
  configurarSync() {
    const url = (this.base.meta.syncUrl || '').trim();
    this.sync.transporte = url ? transporteFetch(url) : null;
    this.pintarSync();
  },
  pintarSync() {
    const r = this.sync.resumen();
    let fase = r.fase;
    if (fase !== 'sin-configurar' && fase !== 'error' && !navigator.onLine) fase = 'sin-conexion';
    const p = $('syncpill'); p.dataset.fase = fase;
    p.querySelector('span').textContent = ETIQUETA_SYNC[fase](r);
    p.title = r.error || '';
  },
  async sincronizar(avisar = false) {
    if (!this.sync.transporte) { if (avisar) this.toast('Sincronización sin configurar: los datos viven solo en este equipo'); return this.sync.resumen(); }
    const r = await this.sync.sincronizar();
    if (r.fase === 'ok') {
      await this.registrarDispositivo(); await migrar(this.base);
      // Si al registrarse o migrar cambió algo (la letra de folio, por ejemplo), se sube de una vez: así el otro equipo lo ve antes de elegir la suya.
      if (this.base.pendientes().length) await this.sync.sincronizar();
    }
    this.pintarSync();
    if (avisar) this.toast(r.fase === 'ok' ? 'Sincronizado' : r.fase === 'sin-conexion' ? `Sin conexión. ${r.pendientes} cambios esperan en este equipo` : (r.error || 'No se pudo sincronizar'));
    return r;
  },
  /** Cada dispositivo se anota en Ajustes generales con su letra de folio (A, B, C…). */
  async registrarDispositivo() {
    const cfg = this.base.get('config', 'config');
    if (!cfg) return; // sin ajustes cargados todavía: no se inventa un registro que pise el del otro equipo
    const d = { ...(cfg.dispositivos || {}) }; const yo = this.base.deviceId;
    const mia = d[yo] && d[yo].letra;
    const duplicada = mia && Object.entries(d).some(([id, x]) => id !== yo && x.letra === mia && (x.desde || 0) < (d[yo].desde || 0));
    if (mia && !duplicada) return;
    if (duplicada) delete d[yo];
    const letra = !mia && this.base.meta.letra && !Object.values(d).some(x => x.letra === this.base.meta.letra) ? this.base.meta.letra : letraLibre(d, yo);
    d[yo] = { letra, nombre: this.base.meta.nombreDispositivo || (/Android|iPhone/i.test(navigator.userAgent) ? 'Celular' : 'PC'), desde: Date.now() };
    await this.base.metaSet('letra', letra);
    await this.base.guardar('config', { ...cfg, dispositivos: d });
  },
};

// ---------- acciones generales ----------
const acciones = {
  ir: (a, d) => a.ir(d.vista),
  sync: a => (a.sync.transporte ? a.sincronizar(true) : (a.base.meta.cargaInicial ? (a.ir('ajustes'), a.toast('Configura la sincronización aquí')) : null)),
  cerrarModal: a => a.cerrarModal(),
};
const MODULOS = { app: { acciones }, hoy, pedidos, produccion, inventario, ventas, dinero, mas, recetario, ajustes, simulador, carga };

function despachar(tipo, ev) {
  const el = ev.target.closest(tipo === 'acciones' ? '[data-accion]' : '[data-entrada]');
  if (!el) return;
  const [mod, nombre] = (tipo === 'acciones' ? el.dataset.accion : el.dataset.entrada).split('.');
  const fn = MODULOS[mod] && MODULOS[mod][tipo] && MODULOS[mod][tipo][nombre];
  if (!fn) return;
  if (tipo === 'acciones' && el.tagName !== 'INPUT') ev.preventDefault();
  Promise.resolve().then(() => fn(app, el.dataset, el, ev)).catch(err => app.error(err));
}

async function arrancar() {
  let sinDisco = false;
  try { app.base = await new Base(crearAlmacenIDB()).iniciar(); }
  catch (err) { // navegador que no deja guardar (vista previa, modo privado estricto): sigue en memoria y lo dice
    console.warn('IndexedDB no disponible:', err); sinDisco = true;
    app.base = await new Base(crearAlmacenMemoria()).iniciar();
  }
  app.sync = new Sync(app.base, null);
  app.configurarSync();
  let temporizador = null;
  app.base.suscribir(motivo => {
    app.pintarSync();
    if (motivo === 'cambio') { clearTimeout(temporizador); temporizador = setTimeout(() => app.sincronizar(), 1500); }
    if (motivo === 'remoto') app.renderSuave(); else if (motivo === 'importado') app.render();
  });
  app.sync.suscribir(() => app.pintarSync());

  document.addEventListener('click', ev => despachar('acciones', ev));
  document.addEventListener('input', ev => despachar('entradas', ev));
  document.addEventListener('change', ev => { if (ev.target.matches('[type=file]')) despachar('entradas', ev); });
  document.addEventListener('focusout', () => { if (app._renderPendiente) setTimeout(() => app.renderSuave(), 0); });
  $('modalBg').addEventListener('click', ev => { if (ev.target === $('modalBg')) app.cerrarModal(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape') app.cerrarModal(); });
  window.addEventListener('online', () => app.sincronizar());
  window.addEventListener('offline', () => app.pintarSync());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { app.sincronizar(); app.renderSuave(); } });
  setInterval(() => { if (!document.hidden && navigator.onLine) app.sincronizar(); }, 30000);

  await migrar(app.base);
  app.render();
  app.sincronizar();
  if (sinDisco) app.toast('Este navegador no deja guardar datos: lo que captures se pierde al cerrar.', 8000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        nuevo && nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) app.toast('Hay una versión nueva de KUMAI OS. Cierra y vuelve a abrir la app.', 7000);
        });
      });
    } catch (err) { console.warn('Sin service worker:', err); }
  }
}

window.kumai = app; // para revisar desde la consola
arrancar().catch(err => { $('view').innerHTML = `<div class="alert"><div><b>No pude abrir la base de datos.</b> ${esc(err && err.message)}</div></div>`; console.error(err); });
