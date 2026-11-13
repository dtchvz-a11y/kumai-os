// KUMAI OS · costeo (funciones puras)
// Regla: lo compartido (bote de crema, grenetina, soletas) se calcula desde los insumos;
// concentrado, baño y topping son costo fijo por molde, tal como los trae el recetario.
// El costo del molde se redondea al peso, igual que en Recetario_KUMAI.md.

export const ID_BASE_CREMA = 'base-crema';
export const ID_BASE_SOLETAS = 'base-soletas';
export const ID_GRENETINA = 'insumo-grenetina';

/** ctx = { insumos: Map(id→insumo), bases: Map(id→receta base), config } */
export function contexto(insumos, recetas, config) {
  return {
    insumos: new Map(insumos.map(i => [i.id, i])),
    bases: new Map(recetas.filter(r => r.tipo === 'base').map(r => [r.id, r])),
    config,
  };
}

/** Costo de una preparación base completa (un batch de crema, una tanda de soletas). */
export function costoBase(base, ctx) {
  if (!base) return 0;
  let t = 0;
  for (const l of base.insumos || []) {
    const ins = ctx.insumos.get(l.insumoId);
    if (ins) t += l.cantidad * ins.costoUnitario;
  }
  return t + (base.ajuste || 0);
}
/** Costo por unidad de rendimiento (un bote, una soleta). */
export function costoUnidadBase(base, ctx) {
  return base && base.rinde ? costoBase(base, ctx) / base.rinde : 0;
}

export function costoComponente(comp, receta, ctx) {
  if (comp.modo === 'batch') {
    const gren = ctx.insumos.get(ID_GRENETINA);
    return costoUnidadBase(ctx.bases.get(ID_BASE_CREMA), ctx) + (receta.grenetinaG || 0) * (gren ? gren.costoUnitario : 0);
  }
  if (comp.modo === 'soletas') {
    return (ctx.config.soletasPorMolde || 24) * costoUnidadBase(ctx.bases.get(ID_BASE_SOLETAS), ctx);
  }
  return Number(comp.costo) || 0;
}

export function costoReceta(receta, ctx) {
  const componentes = (receta.componentes || []).map(c => ({ ...c, costoCalc: costoComponente(c, receta, ctx) }));
  const exacto = componentes.reduce((s, c) => s + c.costoCalc, 0);
  const molde = Math.round(exacto);
  const reb = receta.rebanadas || ctx.config.rebanadasPorMolde || 5;
  const buffer = (ctx.config.bufferPct || 0) / 100;
  return {
    componentes, exacto, molde, rebanadas: reb,
    rebanada: molde / reb,
    moldeConBuffer: molde * (1 + buffer),
    rebanadaConBuffer: molde * (1 + buffer) / reb,
  };
}

/** Utilidad y margen de una venta. comisionPct: lo que se queda el canal (Rappi). */
export function margen(precio, costo, comisionPct = 0) {
  const neto = precio * (1 - comisionPct / 100);
  const utilidad = neto - costo;
  return { neto, utilidad, pct: precio > 0 ? Math.round(utilidad / precio * 100) : 0 };
}

/** Margen bruto como lo imprime el recetario: sobre ingredientes, sin buffer ni comisión. */
export function margenRecetario(precioRebanada, costo) {
  return margen(precioRebanada, costo.rebanada).pct;
}
