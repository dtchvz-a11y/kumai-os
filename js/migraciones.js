// KUMAI OS · ajustes de datos entre versiones. Cada paso revisa antes de tocar: correrlo dos veces no cambia nada.
import { PRESENTACION, UNIDAD_REAL } from './semilla.js';
import { canon, sumarDias } from './util.js';
import { MOSTRADOR_INICIAL } from './motor.js';

/** Presentaciones con las que salió la primera F1 (supuestos que Griz corrigió el 11-nov-2026). */
const VIEJAS = {
  'insumo-mantequilla-sin-sal': { nombre: 'barra', cantidad: 90 },
  'insumo-crema-para-batir': { nombre: 'bote', cantidad: 500 },
  'insumo-leche-condensada': { nombre: 'lata', cantidad: 267 },
};

export async function migrar(base) {
  const hechos = [];
  const cfg = base.get('config', 'config');
  if (!cfg) return hechos;
  // 1. Mantequilla por kilo, crema en bote de 980 ml, leche condensada por gramos en bolsa de 11 kg.
  for (const [id, vieja] of Object.entries(VIEJAS)) {
    const i = base.get('insumos', id);
    if (!i || i.deleted || canon(i.presentacion) !== canon(vieja)) continue; // ya corregida o editada a mano
    await base.guardar('insumos', { ...i, presentacion: PRESENTACION[id], unidad: UNIDAD_REAL[id] || i.unidad });
    hechos.push('presentación de ' + i.nombre);
  }
  for (const [id, viejo] of [['insumo-crema-para-batir', 'bote Lyncott'], ['insumo-leche-condensada', 'bolsa de 11 kg']]) { // nombres de la 1.1
    const i = base.get('insumos', id);
    if (i && !i.deleted && i.presentacion && i.presentacion.nombre === viejo) await base.guardar('insumos', { ...i, presentacion: PRESENTACION[id] });
  }
  // 2. Rappi: $90 los sencillos y $100 los premium.
  if (cfg.precios && cfg.precios.rappi == null) {
    const precios = { ...cfg.precios, rappi: 90, rappiPremium: 100 };
    const prods = [];
    for (const p of base.lista('productos')) {
      if (p.presentacion !== 'rappi') continue;
      const reb = base.get('productos', p.id.replace(/-rappi$/, '-rebanada'));
      const eraSemilla = reb && p.precios.Rappi === reb.precios.WhatsApp; // nadie lo había cambiado a mano
      if (eraSemilla && p.precios.Rappi < precios.premium) prods.push({ ...p, precios: { Rappi: precios.rappi } });
    }
    if (prods.length) await base.guardarVarios('productos', prods);
    await base.guardar('config', { ...base.get('config', 'config'), precios });
    hechos.push('precios de Rappi');
  }
  // Comisión de Rappi: 30 % + IVA = 34.8 % del precio (Griz, 12-nov-2026). Solo si seguía en el 30 de arranque.
  { const c = base.get('config', 'config'); if (c.comisionRappiPct === 30 && !c.rappiConIva) { await base.guardar('config', { ...c, comisionRappiPct: 34.8, rappiConIva: true }); hechos.push('comisión de Rappi'); } }
  // 3. Crema: el día del batch es el día 1 de 7, así que el último día de uso es fecha + 6 (la 1.0 guardó + 7).
  const cremas = base.lista('lotes').filter(l => l.tipo === 'crema' && l.caducidad === sumarDias(l.fechaProduccion, 7)).map(l => ({ ...l, caducidad: sumarDias(l.fechaProduccion, 6) }));
  if (cremas.length) { await base.guardarVarios('lotes', cremas); hechos.push('caducidad de la crema'); }
  // 4. Reglas de mostrador (F2).
  const c2 = base.get('config', 'config');
  if (!c2.mostrador) { await base.guardar('config', { ...c2, mostrador: MOSTRADOR_INICIAL, semanas: c2.semanas || {} }); hechos.push('reglas de mostrador'); }
  return hechos;
}

/**
 * Cambia los precios de lista de todos los sabores de un jalón (Ajustes → Precios de lista).
 * Un sabor es premium si hoy su rebanada cuesta lo que marca el precio premium vigente.
 */
export async function aplicarPreciosDeLista(base, nuevos) {
  const cfg = base.get('config', 'config');
  const viejo = cfg.precios;
  const prods = [];
  for (const r of base.lista('recetas')) {
    if (r.tipo !== 'sabor') continue;
    const de = pres => base.lista('productos').find(p => p.recetaId === r.id && p.presentacion === pres);
    const reb = de('rebanada'), mol = de('molde'), rap = de('rappi');
    const premium = reb && reb.precios.WhatsApp >= viejo.premium;
    const pr = premium ? nuevos.premium : nuevos.rebanada, pm = premium ? nuevos.moldePremium : nuevos.molde, pp = premium ? nuevos.rappiPremium : nuevos.rappi;
    if (reb) prods.push({ ...reb, precios: { WhatsApp: pr, Mostrador: pr, Evento: pr } });
    if (mol) prods.push({ ...mol, precios: { WhatsApp: pm, Mostrador: pm, Evento: pm } });
    if (rap) prods.push({ ...rap, precios: { Rappi: pp } });
  }
  await base.guardarVarios('productos', prods);
  await base.guardar('config', { ...cfg, precios: { ...viejo, ...nuevos } });
  return prods.length;
}
