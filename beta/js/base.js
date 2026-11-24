// KUMAI OS · base local: datos en memoria + almacén persistente + cola de sincronización.
// Todo cambio pasa por guardar(): sella el registro, lo persiste y lo forma en la cola.
import { ENTIDADES, VERSION_APP, sellar } from './modelo.js';
import { uid, clonar } from './util.js';

export class Base {
  constructor(almacen) {
    this.a = almacen;
    this.datos = {};
    this.cola = new Map();   // clave "entidad|id" → { clave, entidad, id, updatedAt }
    this.meta = {};
    this.oyentes = new Set();
  }

  async iniciar() {
    await this.a.abrir();
    for (const e of ENTIDADES) this.datos[e] = new Map((await this.a.leerTodo(e)).map(r => [r.id, r]));
    this.cola = new Map((await this.a.leerTodo('_cola')).map(c => [c.clave, c]));
    this.meta = Object.fromEntries((await this.a.leerTodo('_meta')).map(m => [m.k, m.v]));
    if (!this.meta.deviceId) await this.metaSet('deviceId', uid());
    return this;
  }

  get deviceId() { return this.meta.deviceId; }
  async metaSet(k, v) { this.meta[k] = v; await this.a.poner('_meta', [{ k, v }]); }

  suscribir(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  avisar(motivo) { for (const fn of this.oyentes) fn(motivo); }

  /** Registros vigentes (sin los borrados lógicamente). */
  lista(e) { return [...this.datos[e].values()].filter(r => !r.deleted); }
  todos(e) { return [...this.datos[e].values()]; }
  get(e, id) { return this.datos[e].get(id) || null; }
  porId(e) { return new Map(this.lista(e).map(r => [r.id, r])); }

  async guardar(e, datos) { return (await this.guardarVarios(e, [datos]))[0]; }
  async guardarVarios(e, lista) {
    const ahora = Date.now();
    const regs = lista.map(d => sellar(d, this.deviceId, d.id ? this.datos[e].get(d.id) : null, ahora));
    await this._persistir(e, regs, true);
    this.avisar('cambio');
    return regs;
  }
  async borrar(e, id) {
    const r = this.get(e, id);
    return r ? this.guardar(e, { ...r, deleted: true }) : null;
  }

  /** Carga registros de semilla solo si no existen (ids fijos: sembrar dos veces no duplica). */
  async sembrar(e, regs) {
    const nuevos = regs.filter(r => !this.datos[e].has(r.id));
    await this._persistir(e, nuevos, true);
    if (nuevos.length) this.avisar('cambio');
    return nuevos.length;
  }

  async _persistir(e, regs, encolar) {
    if (!regs.length) return;
    await this.a.poner(e, regs);
    for (const r of regs) this.datos[e].set(r.id, r);
    if (encolar) {
      const cs = regs.map(r => ({ clave: e + '|' + r.id, entidad: e, id: r.id, updatedAt: r.updatedAt }));
      await this.a.poner('_cola', cs);
      for (const c of cs) this.cola.set(c.clave, c);
    }
  }

  // ---------- lado de sincronización ----------
  pendientes() { return [...this.cola.values()]; }

  /** Quita de la cola lo que el servidor ya recibió, salvo que haya cambiado mientras viajaba. */
  async confirmarEnviados(enviados) {
    const fuera = enviados.filter(x => { const c = this.cola.get(x.entidad + '|' + x.id); return c && c.updatedAt === x.updatedAt; }).map(x => x.entidad + '|' + x.id);
    await this.a.quitar('_cola', fuera);
    for (const c of fuera) this.cola.delete(c);
  }

  /** Aplica cambios que vienen del servidor: gana el updatedAt más reciente, registro por registro. */
  async aplicarRemotos(cambios) {
    const porEntidad = {}; const fuera = []; let n = 0;
    for (const { entidad, reg } of cambios) {
      if (!this.datos[entidad] || !reg || !reg.id) continue;
      const local = this.datos[entidad].get(reg.id);
      if (local && local.updatedAt >= reg.updatedAt) continue;
      (porEntidad[entidad] = porEntidad[entidad] || []).push(reg);
      const c = this.cola.get(entidad + '|' + reg.id);
      if (c && c.updatedAt <= reg.updatedAt) fuera.push(c.clave);
      n++;
    }
    for (const e of Object.keys(porEntidad)) await this._persistir(e, porEntidad[e], false);
    await this.a.quitar('_cola', fuera);
    for (const c of fuera) this.cola.delete(c);
    if (n) this.avisar('remoto');
    return n;
  }

  // ---------- respaldo ----------
  exportar() {
    const entidades = {};
    for (const e of ENTIDADES) entidades[e] = clonar(this.todos(e)).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return { app: 'KUMAI OS', version: VERSION_APP, exportadoEl: new Date().toISOString(), deviceId: this.deviceId, entidades };
  }

  /** Reemplaza los datos locales con el respaldo. Todo vuelve a la cola: la sincronización decide registro por registro. */
  async importar(obj) {
    if (!obj || obj.app !== 'KUMAI OS' || !obj.entidades) throw new Error('El archivo no es un respaldo de KUMAI OS.');
    for (const e of ENTIDADES) {
      const regs = obj.entidades[e] || [];
      if (!Array.isArray(regs) || regs.some(r => !r || !r.id || typeof r.updatedAt !== 'number')) throw new Error(`El respaldo trae datos dañados en "${e}".`);
    }
    await this.a.vaciar('_cola'); this.cola.clear();
    for (const e of ENTIDADES) {
      await this.a.vaciar(e); this.datos[e] = new Map();
      await this._persistir(e, clonar(obj.entidades[e] || []), e !== 'bitacora');
    }
    await this.metaSet('cursor', 0);
    this.avisar('importado');
  }

  async borrarTodo() {
    for (const e of ENTIDADES) { await this.a.vaciar(e); this.datos[e] = new Map(); }
    await this.a.vaciar('_cola'); this.cola.clear();
    await this.metaSet('cursor', 0);
    this.avisar('importado');
  }
}
