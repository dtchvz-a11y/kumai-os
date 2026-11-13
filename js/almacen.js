// KUMAI OS · almacenamiento local
// Dos implementaciones con la misma interfaz: IndexedDB (la app) y memoria (pruebas en Node).
import { ENTIDADES } from './modelo.js';

export const ALMACENES = [...ENTIDADES, '_cola', '_meta'];
const llaveDe = a => (a === '_cola' ? 'clave' : a === '_meta' ? 'k' : 'id');

export function crearAlmacenMemoria() {
  const m = new Map(ALMACENES.map(a => [a, new Map()]));
  return {
    async abrir() {},
    async leerTodo(a) { return [...m.get(a).values()].map(x => JSON.parse(JSON.stringify(x))); },
    async poner(a, regs) { for (const r of regs) m.get(a).set(r[llaveDe(a)], JSON.parse(JSON.stringify(r))); },
    async quitar(a, claves) { for (const c of claves) m.get(a).delete(c); },
    async vaciar(a) { m.get(a).clear(); },
  };
}

export function crearAlmacenIDB(nombre = 'kumai-os') {
  let db = null;
  const tx = (almacenes, modo, fn) => new Promise((ok, mal) => {
    const t = db.transaction(almacenes, modo);
    let res;
    t.oncomplete = () => ok(res);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error || new Error('Transacción cancelada'));
    res = fn(t);
  });
  return {
    abrir() {
      return new Promise((ok, mal) => {
        const req = indexedDB.open(nombre, 1);
        req.onupgradeneeded = () => {
          for (const a of ALMACENES) if (!req.result.objectStoreNames.contains(a)) req.result.createObjectStore(a, { keyPath: llaveDe(a) });
        };
        req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); ok(); };
        req.onerror = () => mal(req.error);
      });
    },
    leerTodo(a) {
      return new Promise((ok, mal) => {
        const req = db.transaction(a, 'readonly').objectStore(a).getAll();
        req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error);
      });
    },
    poner(a, regs) { return regs.length ? tx(a, 'readwrite', t => { const s = t.objectStore(a); for (const r of regs) s.put(r); }) : Promise.resolve(); },
    quitar(a, claves) { return claves.length ? tx(a, 'readwrite', t => { const s = t.objectStore(a); for (const c of claves) s.delete(c); }) : Promise.resolve(); },
    vaciar(a) { return tx(a, 'readwrite', t => { t.objectStore(a).clear(); }); },
  };
}
