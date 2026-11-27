// KUMAI OS · semilla: convierte lo leído de Recetario_KUMAI.md en registros de la app,
// y compara una semilla nueva contra lo que ya hay (reporte de diferencias del importador).
import { SELLO_SEMILLA } from './modelo.js';
import { contexto, costoReceta, ID_BASE_CREMA, ID_BASE_SOLETAS, ID_GRENETINA } from './costeo.js';
import { canon, dinero } from './util.js';

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sello = r => ({ ...r, createdAt: SELLO_SEMILLA, updatedAt: SELLO_SEMILLA, deviceId: 'semilla', deleted: false });
export const idReceta = num => 'receta-' + String(num).padStart(2, '0');

/** Cómo se compra cada insumo (para existencias y lista de compras). Editable en la app. */
export const PRESENTACION = {
  'insumo-philadelphia-original': { nombre: 'barra', cantidad: 190 },
  'insumo-mantequilla-sin-sal': { nombre: 'kg', cantidad: 1000 },          // Griz la compra por kilo (11-nov-2026)
  'insumo-crema-para-batir': { nombre: 'bote', cantidad: 980 },             // bote Lyncott de 980 ml
  'insumo-leche-condensada': { nombre: 'bolsa', cantidad: 11000 },          // bolsa de 11 kg de Sam's, se registra por gramaje
  'insumo-huevo': { nombre: 'pieza', cantidad: 1 },
  'insumo-harina': { nombre: 'kg', cantidad: 1000 },
  'insumo-azucar': { nombre: 'kg', cantidad: 1000 },
};
/** Insumos que Griz pesa aunque el recetario los escriba en ml. Leche condensada: 1,600 g por batch (confirmado 11-nov-2026). */
export const UNIDAD_REAL = { 'insumo-leche-condensada': 'g' };

export const CONFIG_INICIAL = {
  id: 'config', negocio: 'KUMAI',
  bufferPct: 18, comisionRappiPct: 34.8, // 30 % + IVA (Manual_Rappi_KUMAI; confirmado por Griz el 12-nov-2026)
  soletasPorMolde: 24, rebanadasPorMolde: 5,
  precios: { rebanada: 85, premium: 100, molde: 385, moldePremium: 450, rappi: 90, rappiPremium: 100, promo: 80 },
  metas: { moldesSemana: 35 },
  // Parámetros del motor (especificación v1.2, sección 6). El motor llega en la F2; aquí ya quedan guardados.
  motor: {
    horneadaSoletas: 42, horneadaMin: 60, lavadoHorneadoMin: 60,
    cremaBatchMin: 60, cremaRinde: 10, cremaVidaDias: 7, lavadoCremaMin: 60,
    armadoMinPorMolde: 20, sesionArmadoMoldes: 5, lavadoArmadoMin: 60,
    soletasVidaDias: 30, refriCapacidadMoldes: 10, moldesFisicos: 5, refriMinHoras: 6, adelantoArmadoDias: 2, tandasPorSesion: 7,
  },
  horario: {
    lun: [['05:00', '07:30'], ['12:00', '15:00']], mar: [['05:00', '07:30'], ['12:00', '15:00']],
    mie: [['05:00', '07:30'], ['12:00', '15:00']], jue: [['05:00', '07:30'], ['12:00', '15:00']],
    vie: [['05:00', '07:30'], ['12:00', '15:00']], sab: [['09:00', '15:00']], dom: [],
  },
  // Reglas de mostrador (Griz, 11-nov-2026): mínimo de moldes listos al abrir, por día.
  mostrador: { minimoMoldes: { lun: 0, mar: 3, mie: 3, jue: 3, vie: 3, sab: 3, dom: 5 }, ventaEsperadaPct: 100 },
  semanas: {}, // sabores de mostrador por semana: { 'lunes YYYY-MM-DD': [recetaId] }
  dispositivos: {},
};

export const RECURSOS_INICIALES = [
  { id: 'recurso-persona', tipo: 'persona', nombre: 'Griz', capacidad: 1, activo: true },
  { id: 'recurso-batidora', tipo: 'batidora', nombre: 'Batidora', capacidad: 1, activo: true },
  { id: 'recurso-horno', tipo: 'horno', nombre: 'Horno eléctrico', capacidad: 1, activo: true },
  { id: 'recurso-refri', tipo: 'refrigerador', nombre: 'Refrigerador', capacidad: 10, activo: true },
  { id: 'recurso-moldes', tipo: 'molde', nombre: 'Moldes de 10×40×6', capacidad: 5, activo: true },
];

/**
 * @param leido resultado de leerRecetario()
 * @param opciones.rango 'max' (conservador, decisión de Griz del 11-nov-2026) | 'min'
 */
export function construirSemilla(leido, opciones = {}) {
  const rango = opciones.rango || 'max';
  const avisos = [...leido.avisos];
  const insumos = [], recetas = [], productos = [];
  const insumoDe = (x, grupo) => {
    const id = 'insumo-' + slug(x.nombre);
    if (!insumos.some(i => i.id === id)) {
      insumos.push(sello({
        id, nombre: x.nombre, unidad: UNIDAD_REAL[id] || x.unidad, costoUnitario: x.costo / x.cantidad, grupo,
        presentacion: PRESENTACION[id] || { nombre: x.unidad, cantidad: 1 }, proveedor: '', umbralMin: 0,
      }));
    }
    return id;
  };
  const base = (id, nombre, def, grupo, unidadRinde, extra = {}) => {
    const lineas = def.insumos.map(x => ({ insumoId: insumoDe(x, grupo), cantidad: x.cantidad }));
    const suma = def.insumos.reduce((s, x) => s + x.costo, 0);
    const ajuste = def.total == null ? 0 : Math.round((def.total - suma) * 100) / 100;
    if (ajuste !== 0) avisos.push(`${nombre}: los insumos suman ${dinero(suma)} pero el recetario declara ${dinero(def.total)} por tanda. Uso ${dinero(def.total)} (gana el .md) y dejo un ajuste de ${dinero(ajuste)}.`);
    recetas.push(sello({ id, tipo: 'base', nombre, rinde: def.rinde, unidadRinde, insumos: lineas, ajuste, pasos: def.pasos || [], notas: def.notas || [], ...extra }));
  };
  if (leido.cremaBase) base(ID_BASE_CREMA, 'Batch de crema base', leido.cremaBase, 'crema', 'bote');
  if (leido.soletas) base(ID_BASE_SOLETAS, 'Tanda de soletas', leido.soletas, 'soletas', 'soleta');
  if (leido.grenetina) insumos.push(sello({
    id: ID_GRENETINA, nombre: 'Grenetina', unidad: 'g', costoUnitario: leido.grenetina.costo / leido.grenetina.gramos,
    grupo: 'grenetina', presentacion: { nombre: 'g', cantidad: 1 }, proveedor: '', umbralMin: 0,
  }));
  // Grenetina en cubos: la preparación del recetario. Se muestra en Bases; el costeo de cada sabor sigue por gramo.
  const gc = leido.grenetinaCubos;
  if (gc && gc.lote && leido.grenetina) recetas.push(sello({
    id: ID_BASE_GRENETINA, tipo: 'base', nombre: 'Grenetina en cubos de 5 g', rinde: gc.cubos, unidadRinde: 'cubo',
    insumos: [{ insumoId: ID_GRENETINA, cantidad: gc.lote.grenetinaG }], ajuste: 0,
    pasos: gc.pasos, notas: [`Lote: ${gc.lote.grenetinaG} g de grenetina + ${gc.lote.aguaMl} ml de agua (el agua no lleva costo).`, ...gc.notas, ...gc.porCubos],
  }));
  // Pastelito de churro: viene de su ficha de MVP, no del recetario (la ficha dice que no entra hasta validarse).
  const F = FICHA_PASTELITO;
  for (const x of F.insumosNuevos) if (!insumos.some(i => i.id === x.id)) insumos.push(sello({ ...x, presentacion: x.presentacion || { nombre: x.unidad, cantidad: 1 }, proveedor: '', umbralMin: 0 }));
  if (F.insumos.every(l => insumos.some(i => i.id === l.insumoId))) recetas.push(sello({
    id: ID_BASE_PASTELITO, tipo: 'base', nombre: F.nombre, rinde: F.rinde, unidadRinde: 'pieza', insumos: F.insumos, ajuste: 0,
    pasos: F.pasos, notas: F.notas, enPrueba: true, origen: F.origen,
  }));

  const config = { ...CONFIG_INICIAL, recetarioVersion: leido.version };
  if (leido.soletas && leido.soletas.porMolde) config.soletasPorMolde = leido.soletas.porMolde;
  if (leido.precios.molde) config.precios = { ...config.precios, molde: leido.precios.molde, moldePremium: leido.precios.moldePremium };
  if (leido.precios.promo) config.precios = { ...config.precios, promo: leido.precios.promo };

  for (const r of leido.recetas) {
    const componentes = r.componentes.map(c => {
      const x = { nombre: c.nombre, detalle: c.detalle, modo: c.modo, costo: c.costo };
      if (c.clave) x.clave = c.clave;
      if (c.rango) {
        x.costo = rango === 'min' ? c.rango[0] : c.rango[1];
        x.rango = c.rango;
        avisos.push(`#${r.num} ${r.nombre}: "${c.nombre}" viene como rango ${dinero(c.rango[0])}–${c.rango[1]}; cargo ${dinero(x.costo)} (criterio ${rango === 'min' ? 'bajo' : 'conservador'}).`);
      }
      return x;
    });
    const id = idReceta(r.num);
    recetas.push(sello({
      id, tipo: 'sabor', num: r.num, nombre: r.nombre, titulo: r.titulo, descripcion: r.descripcion,
      menu: r.menu || 'reserva', categoria: r.categoria || '', componentes, grenetinaG: r.grenetinaG,
      pesoRango: r.pesoRango, sinBatch: r.sinBatch, usaSoletas: r.usaSoletas, rebanadas: config.rebanadasPorMolde,
      pasos: r.pasos, notas: r.notas, validacion: r.validacion, alergeno: r.alergeno, archivada: false,
      ...(r.vidaVentaDias ? { vidaVentaDias: r.vidaVentaDias } : {}), ...(r.edicion ? { edicion: r.edicion } : {}),
    }));
    const p = r.precio || config.precios.rebanada;
    const pm = p >= config.precios.premium ? config.precios.moldePremium : config.precios.molde;
    const activo = r.menu === 'operativo';
    productos.push(
      sello({ id: `prod-${id}-rebanada`, recetaId: id, presentacion: 'rebanada', precios: { WhatsApp: p, Mostrador: p, Evento: p }, activo }),
      sello({ id: `prod-${id}-molde`, recetaId: id, presentacion: 'molde', precios: { WhatsApp: pm, Mostrador: pm, Evento: pm }, activo }),
      sello({ id: `prod-${id}-rappi`, recetaId: id, presentacion: 'rappi', precios: { Rappi: p >= config.precios.premium ? config.precios.rappiPremium : config.precios.rappi }, activo }),
    );
  }
  for (const o of leido.otros || []) {
    const precios = { Mostrador: o.precio, Evento: o.precio, WhatsApp: o.precio };
    if (o.rappi) precios.Rappi = o.rappi;
    productos.push(sello({ id: idOtro(o.nombre), linea: 'otros', nombre: o.nombre, presentacion: o.presentacion, precios, costo: o.costo, conRebanada: !!o.conRebanada, enPrueba: true, activo: true }));
  }
  return { insumos, recetas, productos, config: sello(config), recursos: RECURSOS_INICIALES.map(sello), avisos };
}

export const ID_BASE_GRENETINA = 'base-grenetina';
export const ID_BASE_PASTELITO = 'base-pastelito';

/** Pastelito de churro · Ficha_PastelitoChurro_KUMAI v0.3 (27-nov-2026). Masa validada; molde y tiempos en A/B. */
export const FICHA_PASTELITO = {
  origen: 'Ficha_PastelitoChurro_KUMAI v0.3 · 27 nov 2026',
  nombre: 'Pastelito de churro (lote de masa + cubierta)',
  rinde: 12, // D94 bajo (~74 g). Con el D94 alto (~119 g) el mismo lote rinde 7: cambiar "Rinde" en Editar cantidades.
  insumosNuevos: [
    { id: 'insumo-leche', nombre: 'Leche', unidad: 'ml', costoUnitario: 0.028, grupo: 'otro', presentacion: { nombre: 'litro', cantidad: 1000 } },
    { id: 'insumo-canela-molida', nombre: 'Canela molida', unidad: 'g', costoUnitario: 0.35, grupo: 'otro' },
    { id: 'insumo-sal', nombre: 'Sal', unidad: 'g', costoUnitario: 0, grupo: 'otro' },
  ],
  insumos: [
    { insumoId: 'insumo-harina', cantidad: 250 },
    { insumoId: 'insumo-azucar', cantidad: 280 },            // 180 masa + 100 cubierta
    { insumoId: 'insumo-mantequilla-sin-sal', cantidad: 190 }, // 150 masa + 40 barniz
    { insumoId: 'insumo-huevo', cantidad: 3 },
    { insumoId: 'insumo-leche', cantidad: 150 },
    { insumoId: 'insumo-polvo-para-hornear', cantidad: 6 },
    { insumoId: 'insumo-canela-molida', cantidad: 10 },      // 4 masa + 6 cubierta
    { insumoId: 'insumo-sal', cantidad: 3 },
    { insumoId: 'insumo-esencia-de-vainilla', cantidad: 1 },
  ],
  pasos: [
    'Mantequilla (150 g, pomada) y azúcar (180 g): batir 3–4 min hasta pálido y esponjoso.',
    'Agregar los 3 huevos uno a uno con la vainilla, batiendo bien entre cada uno.',
    'Tamizar harina (250 g) + polvo (6 g) + canela (4 g) + sal (3 g). Incorporar en 3 partes, alternando con la leche (150 g) en 2: empezar y terminar con secos. Mezclar solo hasta integrar.',
    'Engrasar el molde con mantequilla y pincel, metiendo bien en las líneas del grabado. Llenar al 85% con manga: 119 g en el D94 alto, 74 g en el D94 bajo.',
    'Golpear el molde 2–3 veces contra la mesa para sacar burbujas de la cara.',
    'Hornear en el horno de gas, rejilla al centro, perilla en ~210 °C, girando a la mitad: D94 alto 28–35 min, D94 bajo 15–18 min (estimados, fijarlos en la primera horneada). Punto: palillo limpio, superficie dorada y elástica.',
    'Reposar 5–10 min en el molde y desmoldar volteando el molde y pelándolo sobre rejilla.',
    'Tibio: barnizar con mantequilla derretida (40 g) y revolcar en azúcar (100 g) con canela (6 g). El azúcar se mete en las líneas de la cara y la resalta.',
    'Frío: inyectar el relleno por la base con duya de relleno (tubo largo): 12 g en el alto, 8–10 g en el bajo.',
  ],
  notas: [
    'En prueba (MVP): masa validada; molde D94 y tiempos en A/B. Rinde 12 piezas con el D94 bajo y 7 con el alto: cambiarlo en Editar cantidades cuando se decida.',
    'El costo es masa + cubierta, sin relleno, buffer ni empaque. El precio y el costo de venta están en Recetario → Otras líneas.',
    'Rellenos: cajeta (directa, 2–3 días) · Abuelita (ganache 2:1, 80 g rallado + 40 g crema, 1 día) · frutos rojos (conserva, 2–3 días) · taro (ganache 2:1 de chocolate blanco + 1 ml de saborizante por pieza, 1 día).',
    'Nunca usar la crema base del tiramisú como relleno: necesita refrigeración.',
    'Guardar en hermético a temperatura ambiente, lejos del sol. Nunca encerrar tibio. Alérgenos: gluten, huevo, lácteo.',
    'Precios estimados: leche $28/L y canela $0.35/g. La sal no trae precio en la ficha.',
  ],
};

/** Id fijo de un producto de otra línea a partir de su nombre ("Café de olla KUMAI" → prod-otro-cafe-de-olla-kumai). */
export const idOtro = nombre => 'prod-otro-' + String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- reporte de diferencias (importador) ----------
const CAMPOS = {
  insumos: ['nombre', 'unidad', 'costoUnitario'],
  recetasBase: ['nombre', 'rinde', 'insumos', 'ajuste', 'pasos', 'notas'],
  recetas: ['nombre', 'titulo', 'descripcion', 'menu', 'categoria', 'componentes', 'grenetinaG', 'pesoRango', 'sinBatch', 'usaSoletas', 'pasos', 'notas', 'validacion', 'alergeno', 'vidaVentaDias', 'edicion'],
  productos: ['precios', 'costo', 'nombre', 'presentacion'],
  config: ['soletasPorMolde', 'precios', 'recetarioVersion'],
};
const ETIQUETA = {
  costoUnitario: 'costo unitario', costo: 'costo', nombre: 'nombre', presentacion: 'presentación', componentes: 'componentes y costos', grenetinaG: 'grenetina', pesoRango: 'rango de peso',
  pasos: 'procedimiento', notas: 'notas', vidaVentaDias: 'días de venta', edicion: 'edición limitada', rinde: 'rinde', menu: 'menú', categoria: 'categoría', precios: 'precios', insumos: 'insumos',
  soletasPorMolde: 'soletas por molde', recetarioVersion: 'versión del recetario', validacion: 'en validación',
};
const corto = v => {
  if (v == null) return '—';
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
  if (typeof v === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  return null; // listas y objetos: solo se avisa que cambiaron
};

/**
 * Compara la semilla nueva contra los registros actuales.
 * @returns { cambios:[{entidad,id,nombre,tipo:'nuevo'|'cambia',detalle:[...],registro}], soloEnApp:[...], avisos }
 */
export function compararConActual(semilla, actual) {
  const cambios = [], soloEnApp = [];
  const ctxAntes = contexto(actual.insumos || [], actual.recetas || [], actual.config || semilla.config);
  const ctxDespues = contexto(semilla.insumos, semilla.recetas, semilla.config);
  const revisar = (entidad, nuevos, campos, nombreDe) => {
    const lista = entidad === 'config' ? [actual.config].filter(Boolean) : (actual[entidad] || []);
    const porId = new Map(lista.map(r => [r.id, r]));
    for (const n of nuevos) {
      const a = porId.get(n.id);
      if (!a || a.deleted) { cambios.push({ entidad, id: n.id, nombre: nombreDe(n), tipo: 'nuevo', detalle: ['No está en la app: se agrega.'], registro: n }); continue; }
      const cs = (typeof campos === 'function' ? campos(n) : campos).filter(c => canon(a[c]) !== canon(n[c]));
      if (!cs.length) continue;
      const detalle = cs.map(c => {
        const x = corto(a[c]), y = corto(n[c]);
        return x !== null && y !== null ? `${ETIQUETA[c] || c}: ${x} → ${y}` : `Cambia: ${ETIQUETA[c] || c}`;
      });
      if (entidad === 'recetas' && n.tipo === 'sabor') {
        const antes = costoReceta(a, ctxAntes).molde, despues = costoReceta(n, ctxDespues).molde;
        if (antes !== despues) detalle.unshift(`Costo por molde: ${dinero(antes)} → ${dinero(despues)}`);
      }
      const registro = { ...a }; for (const c of cs) registro[c] = n[c];
      cambios.push({ entidad, id: n.id, nombre: nombreDe(n), tipo: 'cambia', detalle, registro });
    }
  };
  revisar('insumos', semilla.insumos, CAMPOS.insumos, n => n.nombre);
  revisar('recetas', semilla.recetas, n => (n.tipo === 'base' ? CAMPOS.recetasBase : CAMPOS.recetas), n => (n.num ? `#${n.num} ${n.nombre}` : n.nombre));
  const nombreReceta = new Map(semilla.recetas.map(r => [r.id, r.nombre]));
  revisar('productos', semilla.productos, n => (n.linea ? CAMPOS.productos : ['precios']), n => (n.linea ? `${n.nombre} · en prueba` : `${nombreReceta.get(n.recetaId)} · ${n.presentacion}`));
  revisar('config', [semilla.config], CAMPOS.config, () => 'Ajustes generales');
  const enSemilla = new Set(semilla.recetas.map(r => r.id));
  for (const r of actual.recetas || []) if (!r.deleted && r.tipo === 'sabor' && !enSemilla.has(r.id)) soloEnApp.push(r.nombre);
  return { cambios, soloEnApp, avisos: semilla.avisos };
}

/** Carga la semilla en la base (solo lo que falta). Devuelve cuántos registros entraron. */
export async function sembrar(base, s) {
  let n = 0;
  n += await base.sembrar('insumos', s.insumos);
  n += await base.sembrar('recetas', s.recetas);
  n += await base.sembrar('productos', s.productos);
  n += await base.sembrar('recursos', s.recursos);
  n += await base.sembrar('config', [s.config]);
  return n;
}
