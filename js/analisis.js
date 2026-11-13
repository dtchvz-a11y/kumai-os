// KUMAI OS · análisis de ventas, clientes, eventos y dinero (funciones puras sobre listas de registros).
import { sumarDias, diasEntre, deYmd } from './util.js';
import { pedidoActivo, totalPedido, saldo, lunesDe, resumenCliente, rebanadasPedido } from './modelo.js';
import { libroXlsx } from './xlsx.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const CATEGORIAS_GASTO = ['Insumos', 'Empaque', 'Gas y luz', 'Transporte', 'Eventos', 'Comisiones', 'Equipo', 'Otros'];
const esDeposito = c => c.tipo === 'deposito-rappi';
const mes = f => f.slice(0, 7);
const r2 = n => Math.round(n * 100) / 100;

// ---------- ventas ----------
/** Renglones de venta: uno por línea de pedido (por fecha de entrega) y uno por corte de mostrador. */
export function ventas({ pedidos = [], cortes = [] }, desde = null, hasta = null) {
  const out = [];
  const dentro = f => (!desde || f >= desde) && (!hasta || f <= hasta);
  for (const p of pedidos) {
    if (!pedidoActivo(p) || p.prueba || !dentro(p.fechaEntrega)) continue;
    for (const l of p.lineas) out.push({ fecha: p.fechaEntrega, recetaId: l.recetaId, canal: p.canal, punto: p.canal, rebanadas: l.cantidad * (l.presentacion === 'molde' ? 5 : 1), ingreso: l.cantidad * l.precioUnit, origen: 'pedido' });
  }
  for (const c of cortes) {
    if (c.deleted || esDeposito(c) || !c.vendidas || !dentro(c.fecha)) continue;
    out.push({ fecha: c.fecha, recetaId: c.recetaId, canal: 'Mostrador', punto: c.puntoVenta || 'Mostrador', rebanadas: c.vendidas, ingreso: c.ingreso, origen: 'corte' });
  }
  return out;
}
export function agrupar(filas, llave) {
  const m = new Map();
  for (const f of filas) { const k = llave(f); const x = m.get(k) || { clave: k, rebanadas: 0, ingreso: 0 }; x.rebanadas += f.rebanadas; x.ingreso += f.ingreso; m.set(k, x); }
  return [...m.values()];
}
export function tableros(datos, desde, hasta) {
  const v = ventas(datos, desde, hasta);
  const dias = agrupar(v, f => deYmd(f.fecha).getDay()).map(x => ({ ...x, nombre: DIAS[x.clave] })).sort((a, b) => ((a.clave + 6) % 7) - ((b.clave + 6) % 7));
  return {
    total: { rebanadas: v.reduce((s, f) => s + f.rebanadas, 0), ingreso: v.reduce((s, f) => s + f.ingreso, 0) },
    porSabor: agrupar(v, f => f.recetaId).sort((a, b) => b.rebanadas - a.rebanadas),
    porCanal: agrupar(v, f => f.punto).sort((a, b) => b.ingreso - a.ingreso),
    porDia: dias,
    porSemana: agrupar(v, f => lunesDe(f.fecha)).sort((a, b) => a.clave.localeCompare(b.clave)),
  };
}
/** Sell-through de mostrador por sabor: vendidas entre disponibles, y sobrantes (de los cortes). */
export function sellThrough(cortes, desde = null, hasta = null) {
  const m = new Map();
  for (const c of cortes) {
    if (c.deleted || esDeposito(c) || (desde && c.fecha < desde) || (hasta && c.fecha > hasta)) continue;
    const x = m.get(c.recetaId) || { recetaId: c.recetaId, disponibles: 0, vendidas: 0, sobrantes: 0, dias: new Set() };
    x.disponibles += c.disponibles || 0; x.vendidas += c.vendidas || 0; x.sobrantes += c.sobrantes || 0; x.dias.add(c.fecha); m.set(c.recetaId, x);
  }
  return [...m.values()].map(x => ({ ...x, dias: x.dias.size, pct: x.disponibles ? Math.round(Math.min(1, x.vendidas / x.disponibles) * 100) : null })).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}
/**
 * Regla de rotación del recetario: sale del operativo el sabor que queda dos veces en último lugar
 * de ventas en 4 fines de semana consecutivos. Devuelve cuántas veces quedó último cada sabor operativo.
 */
export function rotacion(datos, operativos, hoy) {
  const sabadoPasado = sumarDias(hoy, -((deYmd(hoy).getDay() + 1) % 7 || 7));
  const ultimos = new Map(), finesConDatos = [];
  for (let i = 0; i < 4; i++) {
    const sab = sumarDias(sabadoPasado, -7 * i), dom = sumarDias(sab, 1);
    if (dom >= hoy) continue;
    const v = agrupar(ventas(datos, sab, dom), f => f.recetaId);
    if (!v.length) continue;
    finesConDatos.push(sab);
    const por = new Map(v.map(x => [x.clave, x.rebanadas]));
    const orden = operativos.map(r => ({ id: r.id, n: por.get(r.id) || 0 })).sort((a, b) => a.n - b.n);
    if (orden.length > 1 && orden[0].n < orden[1].n) ultimos.set(orden[0].id, (ultimos.get(orden[0].id) || 0) + 1); // empate en el último lugar no cuenta
  }
  return { fines: finesConDatos.length, ultimos, candidatos: [...ultimos].filter(([, n]) => n >= 2).map(([id]) => id) };
}
/** Con ventas reales: qué porcentaje del mínimo de mostrador se vende en promedio (para el supuesto del motor). */
export function ventaEsperadaSugerida(cortes, minimoMoldes, hoy, dias = 14) {
  const CL = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
  const por = new Map();
  for (const c of cortes) if (!c.deleted && !esDeposito(c) && c.fecha < hoy && c.fecha >= sumarDias(hoy, -dias)) por.set(c.fecha, (por.get(c.fecha) || 0) + (c.vendidas || 0));
  let vend = 0, min = 0, n = 0;
  for (const [f, v] of por) { const m = (minimoMoldes[CL[deYmd(f).getDay()]] || 0) * 5; if (m) { vend += Math.min(v, m); min += m; n++; } }
  return n >= 5 ? { dias: n, pct: Math.round(vend / min * 100) } : { dias: n, pct: null };
}

// ---------- clientes ----------
export function clientesAnalisis(clientes, pedidos, hoy, diasReactivar = 30) {
  const reales = pedidos.filter(p => !p.prueba);
  const filas = clientes.filter(c => !c.deleted && !c.prueba && !['Rappi', 'Mostrador'].includes(c.nombre)).map(c => {
    const r = resumenCliente(c.id, reales);
    return { cliente: c, ...r, diasSinComprar: r.ultimaCompra ? diasEntre(r.ultimaCompra, hoy) : null };
  }).filter(f => f.pedidos > 0);
  return {
    total: filas.length,
    recurrentes: filas.filter(f => f.pedidos >= 2).sort((a, b) => b.pedidos - a.pedidos || b.gastado - a.gastado),
    reactivar: filas.filter(f => f.diasSinComprar !== null && f.diasSinComprar > diasReactivar).sort((a, b) => b.gastado - a.gastado),
    recompraPct: filas.length ? Math.round(filas.filter(f => f.pedidos >= 2).length / filas.length * 100) : null,
  };
}

// ---------- eventos ----------
export const ESTATUS_EVENTO = ['cotizado', 'confirmado', 'anticipo', 'entregado', 'cerrado', 'cancelado'];
export const TIPOS_EVENTO = { puesto: 'Puesto propio', organizador: 'Con organizador', pedido: 'Pedido de evento' };
export const eventoActivo = e => !e.deleted && ['confirmado', 'anticipo'].includes(e.estatus);
/** Ingreso de un evento = pedidos ligados + ventas de mostrador capturadas con ese punto de venta en sus fechas. */
export function resultadoEvento(e, { pedidos = [], cortes = [] }, costoRebanada = () => 0) {
  const ligados = pedidos.filter(p => p.eventoId === e.id && pedidoActivo(p));
  const suyos = cortes.filter(c => !c.deleted && !esDeposito(c) && c.puntoVenta === e.nombre && c.fecha >= e.fechaInicio && c.fecha <= (e.fechaFin || e.fechaInicio));
  const ingreso = ligados.reduce((s, p) => s + totalPedido(p), 0) + suyos.reduce((s, c) => s + c.ingreso, 0);
  const rebanadas = ligados.reduce((s, p) => s + rebanadasPedido(p), 0) + suyos.reduce((s, c) => s + c.vendidas, 0);
  const costoProducto = ligados.reduce((s, p) => s + p.lineas.reduce((t, l) => t + l.cantidad * (l.presentacion === 'molde' ? 5 : 1) * costoRebanada(l.recetaId), 0), 0) + suyos.reduce((s, c) => s + c.vendidas * costoRebanada(c.recetaId), 0);
  const participacion = Number(e.costoParticipacion) || 0;
  return { pedidos: ligados.length, rebanadas, ingreso, participacion, costoProducto: r2(costoProducto), utilidad: r2(ingreso - participacion - costoProducto) };
}
export function embudoEventos(eventos) {
  const vivos = eventos.filter(e => !e.deleted);
  const n = s => vivos.filter(e => e.estatus === s).length;
  const ganados = n('confirmado') + n('anticipo') + n('entregado') + n('cerrado');
  return { cotizado: n('cotizado'), confirmado: n('confirmado'), anticipo: n('anticipo'), entregado: n('entregado'), cerrado: n('cerrado'), cancelado: n('cancelado'), total: vivos.length, conversionPct: vivos.length ? Math.round(ganados / vivos.length * 100) : null };
}
/** Los eventos confirmados con plan de cantidades entran al motor como un pedido de moldes para su primer día. */
export function pedidosDeEventos(eventos, hoy) {
  return eventos.filter(e => eventoActivo(e) && e.fechaInicio >= hoy && (e.plan || []).some(l => l.moldes > 0)).map(e => ({
    id: 'evento-' + e.id, folio: e.nombre, estatus: 'pendiente', deleted: false, canal: 'Evento', fechaEntrega: e.fechaInicio, horaEntrega: '',
    lineas: e.plan.filter(l => l.moldes > 0).map(l => ({ recetaId: l.recetaId, presentacion: 'molde', cantidad: l.moldes, precioUnit: 0 })),
  }));
}

// ---------- dinero (por fecha de cobro: decisión 2a) ----------
/**
 * Ingresos cobrados: pagos de pedidos (el día que pagan), ventas de mostrador (el día de la venta)
 * y depósitos de Rappi (el día del depósito, con su venta bruta, comisión y retenciones).
 * Los pedidos de Rappi no generan ingreso por sí solos: Rappi cobra y luego deposita.
 */
export function ingresos({ pedidos = [], cortes = [] }, incluirPrueba = false) {
  const out = [];
  for (const p of pedidos) {
    if (p.deleted || (p.prueba && !incluirPrueba) || p.canal === 'Rappi') continue;
    for (const x of p.pagos || []) if (Number(x.monto)) out.push({ fecha: x.fecha, tipo: 'Pedido', referencia: p.folio, cliente: p.clienteNombre || '', canal: p.canal, metodo: x.metodo || '', ingreso: Number(x.monto), comision: 0, retenciones: 0, neto: Number(x.monto) });
  }
  const mostrador = new Map();
  for (const c of cortes) {
    if (c.deleted) continue;
    if (esDeposito(c)) { out.push({ fecha: c.fecha, tipo: 'Rappi', referencia: 'Depósito de Rappi', cliente: 'Público en general', canal: 'Rappi', metodo: 'transferencia', ingreso: c.ventaBruta, comision: (c.comision || 0) + (c.promos || 0), retenciones: c.retenciones || 0, neto: c.deposito }); continue; }
    if (!c.ingreso) continue;
    const k = c.fecha + '|' + (c.puntoVenta || 'Mostrador'), x = mostrador.get(k) || { fecha: c.fecha, punto: c.puntoVenta || 'Mostrador', ingreso: 0 };
    x.ingreso += c.ingreso; mostrador.set(k, x);
  }
  for (const x of mostrador.values()) out.push({ fecha: x.fecha, tipo: 'Mostrador', referencia: x.punto, cliente: 'Público en general', canal: 'Mostrador', metodo: 'efectivo', ingreso: x.ingreso, comision: 0, retenciones: 0, neto: x.ingreso });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));
}
export function porPeriodo(ing, gastos, llave) {
  const m = new Map();
  const de = k => { if (!m.has(k)) m.set(k, { clave: k, ingresos: 0, neto: 0, gastos: 0, utilidad: 0, rappiBruto: 0, retenciones: 0 }); return m.get(k); };
  for (const i of ing) { const x = de(llave(i.fecha)); x.ingresos += i.ingreso; x.neto += i.neto; x.retenciones += i.retenciones; if (i.tipo === 'Rappi') x.rappiBruto += i.ingreso; }
  for (const g of gastos) if (!g.deleted) de(llave(g.fecha)).gastos += Number(g.monto) || 0;
  for (const x of m.values()) x.utilidad = r2(x.neto - x.gastos);
  return [...m.values()].sort((a, b) => a.clave.localeCompare(b.clave));
}
export const porMes = (ing, gastos) => porPeriodo(ing, gastos, mes);
export const porSemana = (ing, gastos) => porPeriodo(ing, gastos, lunesDe);
export function porCobrar(pedidos) { return pedidos.filter(p => pedidoActivo(p) && !p.prueba && p.canal !== 'Rappi' && saldo(p) > 0); }

/** Tabla RESICO mensual 2026 (Manual_Tramites_KUMAI, ficha A3-bis). Estimado: se valida con contador. */
export const TABLA_RESICO = [[25000, 1.0], [50000, 1.1], [83333.33, 1.5], [208333.33, 2.0], [Infinity, 2.5]];
export function isrResico(cobradoMes) { const t = TABLA_RESICO.find(([tope]) => cobradoMes <= tope)[1]; return { tasa: t, isr: r2(cobradoMes * t / 100) }; }

/** Recordatorios del mes fiscal (Manual_Tramites_KUMAI, A5): factura global el día 1 y declaración antes del 17. */
export function recordatoriosFiscales(hoy, hechos = {}) {
  const [y, m, d] = hoy.split('-').map(Number);
  const anterior = mes(sumarDias(`${hoy.slice(0, 8)}01`, -1));
  const h = hechos[anterior] || {};
  const out = [];
  const nombreMes = deYmd(anterior + '-01').toLocaleDateString('es-MX', { month: 'long' });
  if (!h.global) out.push({ clave: 'global', mes: anterior, urgente: d > 1, texto: `Factura global de ${nombreMes}: se emite el día 1${d > 1 ? '. Ya pasó la fecha' : ', hoy'}.` });
  if (!h.declaracion) out.push({ clave: 'declaracion', mes: anterior, urgente: d >= 15, vencida: d > 17, texto: `Declaración mensual de ${nombreMes} (ISR RESICO + IVA, aunque sea en ceros): ${d > 17 ? 'venció el 17' : d === 17 ? 'vence hoy' : `${17 - d === 1 ? 'falta 1 día' : 'faltan ' + (17 - d) + ' días'}, vence el 17`}.` });
  return out;
}

// ---------- registro fiscal ----------
export function registroFiscal({ pedidos = [], cortes = [], gastos = [] }, anio) {
  const ing = ingresos({ pedidos, cortes }).filter(i => i.fecha.startsWith(String(anio)));
  const gas = gastos.filter(g => !g.deleted && g.fecha.startsWith(String(anio))).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const din = v => ({ v: r2(v), t: 'dinero' }), tot = v => ({ v: r2(v), t: 'total' }), fec = f => ({ v: f, t: 'fecha' });
  const hIng = [['Fecha de cobro', 'Tipo', 'Folio o punto de venta', 'Cliente', 'Canal', 'Método', 'Ingreso', 'Comisión y promos de Rappi', 'Retenciones', 'Neto recibido'],
    ...ing.map(i => [fec(i.fecha), i.tipo, i.referencia, i.cliente, i.canal, i.metodo, din(i.ingreso), din(i.comision), din(i.retenciones), din(i.neto)]),
    [{ v: 'Total', t: 'negritas' }, null, null, null, null, null, tot(ing.reduce((s, i) => s + i.ingreso, 0)), tot(ing.reduce((s, i) => s + i.comision, 0)), tot(ing.reduce((s, i) => s + i.retenciones, 0)), tot(ing.reduce((s, i) => s + i.neto, 0))]];
  const hGas = [['Fecha', 'Categoría', 'Concepto', 'Proveedor', 'Monto', 'Deducible', 'Con factura', 'Comprobante'],
    ...gas.map(g => [fec(g.fecha), g.categoria || '', g.concepto || '', g.proveedor || '', din(Number(g.monto) || 0), g.deducible ? 'Sí' : 'No', g.conFactura ? 'Sí' : 'No', g.comprobante || '']),
    [{ v: 'Total', t: 'negritas' }, null, null, null, tot(gas.reduce((s, g) => s + (Number(g.monto) || 0), 0))]];
  const meses = porMes(ing, gas);
  const filasMes = [];
  for (let m = 1; m <= 12; m++) {
    const k = `${anio}-${String(m).padStart(2, '0')}`, x = meses.find(z => z.clave === k) || { ingresos: 0, neto: 0, gastos: 0, utilidad: 0, rappiBruto: 0, retenciones: 0 };
    const r = isrResico(x.ingresos);
    filasMes.push([deYmd(k + '-01').toLocaleDateString('es-MX', { month: 'long' }), din(x.ingresos), din(x.rappiBruto), din(x.neto), din(x.gastos), din(x.utilidad), `${r.tasa}%`, din(r.isr), din(x.retenciones)]);
  }
  const suma = k => meses.reduce((s, x) => s + x[k], 0);
  const hRes = [['Mes', 'Ingresos cobrados', 'De los cuales, venta bruta en Rappi', 'Neto recibido', 'Gastos', 'Utilidad (neto − gastos)', 'Tasa RESICO', 'ISR RESICO estimado', 'Retenciones de Rappi'],
    ...filasMes,
    [{ v: 'Total ' + anio, t: 'negritas' }, tot(suma('ingresos')), tot(suma('rappiBruto')), tot(suma('neto')), tot(suma('gastos')), tot(suma('utilidad')), null, tot(filasMes.reduce((s, f) => s + f[7].v, 0)), tot(suma('retenciones'))],
    [],
    ['Notas'],
    ['Los ingresos se anotan el día en que se cobran: anticipo y liquidación por separado. Las ventas de mostrador, el día de la venta.'],
    ['Rappi: se anota cada depósito con su venta bruta, comisión, promos y retenciones, tal como viene en la Relación de ventas.'],
    ['ISR RESICO estimado con la tabla mensual 2026 del Manual de Trámites. No incluye IVA ni IEPS: eso se define con el contador.'],
    ['Generado por KUMAI OS. Es un registro de apoyo para el contador, no una declaración.']];
  return {
    ingresos: ing, gastos: gas, meses,
    bytes: libroXlsx([
      { nombre: 'Ingresos', anchos: [14, 12, 26, 26, 12, 14, 14, 20, 14, 16], filas: hIng },
      { nombre: 'Gastos', anchos: [12, 16, 34, 22, 14, 11, 12, 22], filas: hGas },
      { nombre: 'Resumen mensual', anchos: [16, 18, 28, 16, 14, 22, 13, 20, 20], filas: hRes },
    ]),
  };
}
