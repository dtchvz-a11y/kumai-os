// KUMAI OS · cliente de sincronización
// 1) manda la cola local al Apps Script, 2) baja lo que cambió desde el último cursor.
// Si no hay conexión, la cola se queda guardada y se reintenta sola.

/** Transporte real: POST de texto plano (evita el preflight CORS de Apps Script). */
export function transporteFetch(url) {
  return async carga => {
    // text/plain es obligatorio: con application/json el navegador manda un preflight que Apps Script no contesta.
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(carga), redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
    if (!r.ok) throw new Error('El servidor respondió ' + r.status);
    return r.json();
  };
}

const ERRORES = {
  clave: 'La clave no coincide con la del Apps Script.',
  'sin-clave-servidor': 'Falta cambiar la clave dentro del Apps Script (ver GUIA_SYNC.md, paso 3).',
  json: 'El servidor no entendió el envío.',
};

export class Sync {
  /** @param transporte async (carga) → respuesta; si es null, la sync está sin configurar */
  constructor(base, transporte = null, opciones = {}) {
    this.base = base;
    this.transporte = transporte;
    this.lote = opciones.lote || 150;
    this.enCurso = null;
    this.estado = { fase: transporte ? 'pendiente' : 'sin-configurar', error: null };
    this.oyentes = new Set();
  }
  suscribir(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  _fase(fase, error = null) { this.estado = { fase, error }; for (const fn of this.oyentes) fn(this.resumen()); }

  resumen() {
    const pendientes = this.base.pendientes().length;
    let fase = this.estado.fase;
    if (fase === 'ok' && pendientes) fase = 'pendiente';
    return { fase, pendientes, error: this.estado.error, ultimaSync: this.base.meta.ultimaSync || null };
  }

  /** Una sola sincronización a la vez; las llamadas simultáneas comparten el mismo resultado. */
  sincronizar() {
    if (!this.transporte) { this._fase('sin-configurar'); return Promise.resolve(this.resumen()); }
    if (!this.enCurso) this.enCurso = this._correr().finally(() => { this.enCurso = null; });
    return this.enCurso;
  }

  async _correr() {
    const b = this.base;
    this._fase('sincronizando');
    try {
      for (let vuelta = 0; vuelta < 50; vuelta++) {
        const cola = b.pendientes().slice(0, this.lote);
        const cambios = cola.map(c => ({ entidad: c.entidad, reg: b.get(c.entidad, c.id) })).filter(c => c.reg);
        const resp = await this.transporte({
          clave: b.meta.syncClave || '', deviceId: b.deviceId, desde: b.meta.cursor || 0, cambios,
        });
        if (!resp || !resp.ok) { this._fase('error', ERRORES[resp && resp.error] || 'El servidor rechazó la sincronización.'); return this.resumen(); }
        await b.confirmarEnviados(cambios.map(c => ({ entidad: c.entidad, id: c.reg.id, updatedAt: c.reg.updatedAt })));
        // Lo que estaba en cola pero ya no existe localmente tampoco debe quedarse atorado.
        await b.confirmarEnviados(cola.filter(c => !b.get(c.entidad, c.id)));
        await b.aplicarRemotos(resp.cambios || []);
        await b.metaSet('cursor', resp.sv);
        if (!b.pendientes().length) break;
      }
      await b.metaSet('ultimaSync', Date.now());
      this._fase('ok');
    } catch (err) {
      this._fase('sin-conexion', String(err && err.message || err));
    }
    return this.resumen();
  }
}
