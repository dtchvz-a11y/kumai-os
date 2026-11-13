// KUMAI OS · utilidades compartidas (sin dependencias; corre en navegador y en Node)

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const z = n => String(n).padStart(2, '0');

/** Fecha local YYYY-MM-DD (nunca UTC: a las 19:00 en Aguascalientes sigue siendo hoy). */
export function ymd(d = new Date()) {
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export function deYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function sumarDias(s, n) { const d = deYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function diasEntre(a, b) { return Math.round((deYmd(b) - deYmd(a)) / 86400000); }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function diaSemana(s) { return DIAS[deYmd(s).getDay()]; }
export function fechaCorta(s) { const d = deYmd(s); return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()]}`; }
export function fechaLarga(s) { const d = deYmd(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; }
/** "hoy", "mañana" o el día con fecha. */
export function fechaHumana(s, hoy = ymd()) {
  const n = diasEntre(hoy, s);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return fechaLarga(s);
}

export function dinero(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const s = Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  return (v < 0 ? '−$' : '$') + s;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function soloDigitos(s) { return String(s || '').replace(/\D/g, ''); }

/** Comparación profunda estable (orden de llaves irrelevante). */
export function igual(a, b) { return canon(a) === canon(b); }
export function canon(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

export function clonar(v) { return JSON.parse(JSON.stringify(v)); }
