// KUMAI OS · operación diaria: lo que pasa en la base cuando se produce, se vende o se compra.
// El plan no se guarda: se recalcula siempre desde el estado real (pedidos, lotes, existencias).
// Marcar una tarea como hecha crea lotes y descuenta insumos; al recalcular, esa necesidad ya está cubierta.
import { sumarDias, diasEntre } from './util.js';
import { existencia } from './modelo.js';
import { parametros, planificar, vidaVenta, consumoDelPlan } from './motor.js';
import { ID_BASE_CREMA, ID_BASE_SOLETAS, ID_GRENETINA } from './costeo.js';
import { pedidosDeEventos } from './analisis.js';

const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sabores = base => base.lista('recetas').filter(r => r.tipo === 'sabor');

/** Datos de entrada del motor a partir de la base. `cambios` sirve para simular (F4) sin tocar datos reales. */
export function entradaMotor(base, cfg, { dias = 14, ahora = new Date(), hoy, cambios = {} } = {}) {
  return {
    hoy, ahoraMin: ahora.getHours() * 60 + ahora.getMinutes(), dias,
    P: parametros(cfg, cambios), recetas: sabores(base), lotes: base.lista('lotes'),
    pedidos: [...base.lista('pedidos'), ...pedidosDeEventos(base.lista('eventos'), hoy)], // los eventos confirmados cuentan como demanda
  };
}
export function plan(base, cfg, opciones) { return planificar(entradaMotor(base, cfg, opciones)); }

// ---------- lotes ----------
const vivos = (base, tipo) => base.lista('lotes').filter(l => l.tipo === tipo && l.disponible > 0);
const porAntiguedad = (a, b) => a.fechaProduccion.localeCompare(b.fechaProduccion) || a.createdAt - b.createdAt;

/** Descuenta `n` de los lotes de un tipo, primero el más viejo que siga vigente. Devuelve lo que no se pudo descontar. */
async function consumirLotes(base, tipo, n, hoy, filtro = () => true) {
  const cambios = [];
  for (const l of vivos(base, tipo).filter(l => l.caducidad >= hoy && filtro(l)).sort(porAntiguedad)) {
    if (n <= 0) break;
    const k = Math.min(l.disponible, n);
    cambios.push({ ...l, disponible: l.disponible - k }); n -= k;
  }
  if (cambios.length) await base.guardarVarios('lotes', cambios);
  return n;
}

/** Rebanadas en vitrina por sabor: vendibles hoy (armadas antes de hoy y dentro de su vida) y las que salen mañana. */
export function stockVitrina(base, hoy) {
  const R = base.porId('recetas'), out = new Map();
  for (const l of vivos(base, 'producto')) {
    if (l.caducidad < hoy) continue;
    const x = out.get(l.recetaId) || { recetaId: l.recetaId, receta: R.get(l.recetaId), hoy: 0, manana: 0, vence: null };
    if (l.fechaProduccion < hoy) { x.hoy += l.disponible; if (!x.vence || l.caducidad < x.vence) x.vence = l.caducidad; } else x.manana += l.disponible;
    out.set(l.recetaId, x);
  }
  return [...out.values()].filter(x => x.receta).sort((a, b) => a.receta.num - b.receta.num);
}
export function caducados(base, hoy) { return base.lista('lotes').filter(l => l.disponible > 0 && l.caducidad < hoy); }

// ---------- producción ----------
async function consumoInsumos(base, baseId, factor, hoy, referencia) {
  const b = base.get('recetas', baseId);
  if (!b || !factor) return;
  await base.guardarVarios('movimientos', b.insumos.map(l => ({ insumoId: l.insumoId, tipo: 'consumo', cantidad: Math.round(l.cantidad * factor * 1000) / 1000, fecha: hoy, referencia })));
}

/** Batch de crema hecho: entra un lote de botes (vida 7 días contando el de hoy) y salen los insumos. */
export async function hacerCrema(base, cfg, hoy, botes) {
  const P = parametros(cfg);
  const lote = await base.guardar('lotes', { tipo: 'crema', cantidadProducida: botes, disponible: botes, fechaProduccion: hoy, caducidad: sumarDias(hoy, P.cremaVidaDias - 1) });
  await consumoInsumos(base, ID_BASE_CREMA, botes / P.cremaRinde, hoy, 'Batch de crema');
  await base.guardar('tareas', { tipo: 'crema', fecha: hoy, duracionMin: P.cremaBatchMin + P.lavadoCremaMin, recursoId: 'recurso-persona', cantidad: botes, loteId: lote.id, estatus: 'hecha' });
  return lote;
}

/** Horneadas hechas: entra un lote de soletas (30 días) y salen los insumos de cada tanda. */
export async function hornear(base, cfg, hoy, tandas, piezas) {
  const P = parametros(cfg);
  const lote = await base.guardar('lotes', { tipo: 'soletas', cantidadProducida: piezas, disponible: piezas, fechaProduccion: hoy, caducidad: sumarDias(hoy, P.soletasVidaDias) });
  await consumoInsumos(base, ID_BASE_SOLETAS, tandas, hoy, `Horneado · ${tandas} ${tandas === 1 ? 'tanda' : 'tandas'}`);
  await base.guardar('tareas', { tipo: 'horneado', fecha: hoy, duracionMin: tandas * P.horneadaMin + P.lavadoHorneadoMin, recursoId: 'recurso-persona', cantidad: piezas, tandas, loteId: lote.id, estatus: 'hecha' });
  return lote;
}

/**
 * Moldes armados: por cada uno entra un lote de 5 rebanadas del sabor y sale 1 bote, 24 soletas y su grenetina.
 * @param moldes [{recetaId, motivo?, pedidoId?}] · devuelve avisos si no había crema o soletas suficientes registradas
 */
export async function armar(base, cfg, hoy, moldes) {
  const P = parametros(cfg), R = base.porId('recetas'), avisos = [];
  let botes = 0, piezas = 0, gren = 0;
  const lotes = [];
  for (const m of moldes) {
    const r = R.get(m.recetaId); if (!r) continue;
    lotes.push({ tipo: 'producto', recetaId: r.id, cantidadProducida: P.rebanadas, disponible: P.rebanadas, fechaProduccion: hoy, caducidad: sumarDias(hoy, vidaVenta(r)), motivo: m.motivo || 'mostrador', pedidoId: m.pedidoId || null });
    if (!r.sinBatch) botes++;
    if (r.usaSoletas !== false) piezas += P.soletasPorMolde;
    gren += r.grenetinaG || 0;
  }
  const guardados = await base.guardarVarios('lotes', lotes);
  const faltaBotes = await consumirLotes(base, 'crema', botes, hoy);
  const faltaSol = await consumirLotes(base, 'soletas', piezas, hoy);
  if (faltaBotes) avisos.push(`Faltaron ${faltaBotes} ${faltaBotes === 1 ? 'bote' : 'botes'} de crema en el registro. Revisa los lotes.`);
  if (faltaSol) avisos.push(`Faltaron ${faltaSol} soletas en el registro. Revisa los lotes.`);
  if (gren) await base.guardar('movimientos', { insumoId: ID_GRENETINA, tipo: 'consumo', cantidad: gren, fecha: hoy, referencia: `Armado · ${moldes.length} ${moldes.length === 1 ? 'molde' : 'moldes'}` });
  await base.guardar('tareas', { tipo: 'armado', fecha: hoy, duracionMin: moldes.length * P.armadoMin + P.lavadoArmadoMin, recursoId: 'recurso-persona', moldes: moldes.map(m => ({ recetaId: m.recetaId, motivo: m.motivo || 'mostrador', pedidoId: m.pedidoId || null })), loteIds: guardados.map(l => l.id), estatus: 'hecha' });
  return avisos;
}

// ---------- vitrina y ventas de mostrador ----------
/** Saca rebanadas de la vitrina: primero las que vencen antes. Prefiere las vendibles hoy. */
export async function sacarDeVitrina(base, recetaId, n, hoy) {
  let falta = await consumirLotes(base, 'producto', n, hoy, l => l.recetaId === recetaId && l.fechaProduccion < hoy);
  if (falta) falta = await consumirLotes(base, 'producto', falta, hoy, l => l.recetaId === recetaId);
  return falta;
}

/** Venta de mostrador: descuenta vitrina y la suma al corte del día (un corte por fecha, sabor y equipo). */
export async function venderMostrador(base, recetaId, n, precio, hoy, punto = 'Mostrador') {
  const antes = stockVitrina(base, hoy).find(x => x.recetaId === recetaId);
  const habia = antes ? antes.hoy + antes.manana : 0;
  await sacarDeVitrina(base, recetaId, n, hoy);
  const id = `corte-${hoy}-${recetaId}-${punto === 'Mostrador' ? '' : slug(punto) + '-'}${base.deviceId.slice(0, 8)}`;
  const c = base.get('cortes', id) || { id, fecha: hoy, puntoVenta: punto, recetaId, disponibles: habia, vendidas: 0, sobrantes: habia, ingreso: 0 };
  return base.guardar('cortes', { ...c, deleted: false, vendidas: c.vendidas + n, sobrantes: Math.max(0, habia - n), ingreso: c.ingreso + n * precio });
}

/**
 * Conteo al cierre: Griz cuenta lo que quedó de cada sabor. La diferencia contra lo que la app creía
 * se registra como venta (si quedó menos) o como corrección de stock (si quedó más).
 */
export async function conteoCierre(base, conteo, precioDe, hoy, punto = 'Mostrador') {
  const r = { vendidas: 0, corregidas: 0 };
  for (const x of stockVitrina(base, hoy)) {
    if (conteo[x.recetaId] === undefined || conteo[x.recetaId] === '') continue;
    const contado = Math.max(0, Math.round(Number(conteo[x.recetaId]) || 0)), creia = x.hoy + x.manana;
    if (contado < creia) { await venderMostrador(base, x.recetaId, creia - contado, precioDe(x.recetaId), hoy, punto); r.vendidas += creia - contado; }
    else {
      if (contado > creia) { await corregirVitrina(base, x.recetaId, contado, hoy); r.corregidas += contado - creia; }
      await venderMostrador(base, x.recetaId, 0, 0, hoy, punto); // deja el corte del día aunque no se haya vendido: sirve para el sell-through
    }
  }
  return r;
}

/** Corrección manual: deja la vitrina de un sabor en `total` rebanadas (sin registrar venta). */
export async function corregirVitrina(base, recetaId, total, hoy) {
  const x = stockVitrina(base, hoy).find(s => s.recetaId === recetaId);
  const hay = x ? x.hoy + x.manana : 0;
  if (total < hay) return sacarDeVitrina(base, recetaId, hay - total, hoy);
  if (total > hay) {
    const r = base.get('recetas', recetaId), ayer = sumarDias(hoy, -1);
    await base.guardar('lotes', { tipo: 'producto', recetaId, cantidadProducida: total - hay, disponible: total - hay, fechaProduccion: ayer, caducidad: sumarDias(ayer, vidaVenta(r)), motivo: 'corrección' });
  }
  return 0;
}

/** Al entregar un pedido sus rebanadas salen de la vitrina (una sola vez). */
export async function entregarPedido(base, pedido, hoy, porMolde = 5) {
  if (pedido.stockDescontado) return pedido;
  const porSabor = new Map();
  for (const l of pedido.lineas) porSabor.set(l.recetaId, (porSabor.get(l.recetaId) || 0) + l.cantidad * (l.presentacion === 'molde' ? porMolde : 1));
  for (const [recetaId, n] of porSabor) await sacarDeVitrina(base, recetaId, n, hoy);
  return base.guardar('pedidos', { ...base.get('pedidos', pedido.id), estatus: 'entregado', stockDescontado: true });
}

// ---------- inventario y compras ----------
export function existencias(base) {
  const movs = base.lista('movimientos');
  return base.lista('insumos').map(i => {
    const ex = existencia(i.id, movs), pres = (i.presentacion && i.presentacion.cantidad) || 1;
    return { insumo: i, existencia: ex, enPresentaciones: Math.round(ex / pres * 100) / 100, bajo: (i.umbralMin || 0) > 0 && ex < i.umbralMin };
  }).sort((a, b) => (a.insumo.grupo || '').localeCompare(b.insumo.grupo || '') || a.insumo.nombre.localeCompare(b.insumo.nombre));
}

/** Compra, merma o ajuste. `cantidad` viene en presentaciones (barras, kilos, bolsas, botes). */
export async function registrarMovimiento(base, { insumoId, tipo, presentaciones, hoy, costoPagado = null, referencia = '' }) {
  const i = base.get('insumos', insumoId), pres = (i.presentacion && i.presentacion.cantidad) || 1;
  let cantidad = Math.round(presentaciones * pres * 1000) / 1000;
  if (tipo === 'ajuste') cantidad = Math.round((cantidad - existencia(insumoId, base.lista('movimientos'))) * 1000) / 1000; // "hay X": se guarda la diferencia
  if (cantidad === 0 && tipo === 'ajuste') return null;
  const m = await base.guardar('movimientos', { insumoId, tipo, cantidad, fecha: hoy, referencia, costo: costoPagado });
  if (tipo === 'compra' && costoPagado > 0 && presentaciones > 0) {
    await base.guardar('insumos', { ...i, costoUnitario: costoPagado / (presentaciones * pres) });
    // La compra con importe también queda como gasto en Dinero.
    await base.guardar('gastos', { fecha: hoy, categoria: 'Insumos', concepto: `${i.nombre} · ${presentaciones} ${(i.presentacion && i.presentacion.nombre) || i.unidad}`, proveedor: i.proveedor || '', monto: costoPagado, deducible: false, conFactura: false, comprobante: '', movimientoId: m.id });
  }
  return m;
}

/** Lista de compras: lo que pide el plan de los próximos `dias` días, menos lo que hay, en presentaciones enteras. */
export function listaCompras(base, cfg, dias, opciones = {}) {
  const pl = plan(base, cfg, { ...opciones, dias: Math.max(dias, 7) });
  const bases = { crema: base.get('recetas', ID_BASE_CREMA), soletas: base.get('recetas', ID_BASE_SOLETAS) };
  const c = consumoDelPlan(pl, dias, sabores(base), bases);
  const filas = existencias(base).map(x => {
    const uso = c.uso.get(x.insumo.id) || 0, pres = (x.insumo.presentacion && x.insumo.presentacion.cantidad) || 1;
    const falta = Math.max(0, uso + (x.insumo.umbralMin || 0) - Math.max(0, x.existencia));
    return { ...x, uso, falta, comprar: Math.ceil(Math.round(falta / pres * 1000) / 1000), costo: Math.ceil(Math.round(falta / pres * 1000) / 1000) * pres * x.insumo.costoUnitario };
  });
  return { filas: filas.filter(f => f.uso > 0 || f.bajo), batches: c.batches, tandas: c.tandas, moldes: c.moldes, total: filas.reduce((s, f) => s + f.costo, 0), plan: pl };
}

export function diasParaCaducar(lote, hoy) { return diasEntre(hoy, lote.caducidad); }
