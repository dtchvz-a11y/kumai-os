// KUMAI OS · simulador de recursos (F4). Mismos datos reales, parámetros distintos; nunca escribe en la base.
import { planificar, cargaDeTrabajo, minutosSemana, techoSemanal, horas, ventanasDe } from './motor.js';
import { sumarDias, clonar } from './util.js';

export const SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
/** Costo extra por molde si se compran las soletas (Recetario_KUMAI v3.4: las caseras bajaron $39 por molde). */
export const COSTO_SOLETAS_COMPRADAS = 39;

/** Palancas del escenario, con los valores de la operación actual como punto de partida. */
export function palancasDe(P) {
  return {
    ayudanteH: P.ayudante ? (P.ayudante.minDia || 0) / 60 : 0, batidoras: P.batidoras, hornos: P.hornos,
    moldes: P.moldesFisicos, sesion: P.sesionMoldes, extraH: 0, soletasCompradas: P.soletasCompradas, armadoMin: P.armadoMin,
  };
}
const aMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const aHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Parámetros del motor con las palancas aplicadas. No modifica P. */
export function conPalancas(P, x) {
  const horario = clonar(P.horario);
  if (x.extraH > 0) for (const k of ['lun', 'mar', 'mie', 'jue', 'vie']) { // horas extra propias: se alarga la última ventana entre semana
    const v = horario[k]; if (v && v.length) v[v.length - 1][1] = aHora(Math.min(24 * 60 - 1, aMin(v[v.length - 1][1]) + Math.round(x.extraH * 60)));
  }
  return {
    ...P, horario, batidoras: x.batidoras, hornos: x.hornos, moldesFisicos: x.moldes, sesionMoldes: x.sesion, armadoMin: x.armadoMin, soletasCompradas: !!x.soletasCompradas,
    ayudante: x.ayudanteH > 0 ? { minDia: Math.round(x.ayudanteH * 60), dias: SEMANA } : null,
  };
}

/** Mide un juego de parámetros contra la demanda real de los próximos 7 días y contra la meta semanal. */
export function medir(e, P, meta = 35) {
  const pl = planificar({ ...e, P, dias: 14 });
  const fin = sumarDias(e.hoy, 6), t = techoSemanal(P), ts = pl.tareas.filter(x => x.fecha <= fin);
  const suma = k => ts.reduce((s, x) => s + (x[k] || 0), 0);
  const enSemana = a => a.fecha <= fin;
  const cargaMeta = cargaDeTrabajo(meta, P);
  return {
    disponiblesH: horas(minutosSemana(P)), techo: t.techo, techoPorHoras: t.porHoras, techoPorMoldes: t.porMoldes,
    horasPlan: horas(suma('duracionMin')), lavadoH: horas(suma('lavadoMin')), horneadoH: horas(ts.filter(x => x.tipo === 'horneado').reduce((s, x) => s + x.trabajoMin, 0)),
    moldes: ts.filter(x => x.tipo === 'armado').reduce((s, x) => s + x.moldes.length, 0),
    pedidosNoCaben: pl.alertas.filter(a => a.tipo === 'no-cabe' && enSemana(a)).length,
    diasCortos: pl.alertas.filter(a => a.tipo === 'mostrador-corto' && enSemana(a)).length,
    moldesCortos: pl.alertas.filter(a => a.tipo === 'mostrador-corto' && enSemana(a)).reduce((s, a) => s + a.moldes, 0),
    diasLlenos: pl.dias.filter(d => d.fecha <= fin && d.saturado).length,
    metaMoldes: meta, metaH: horas(cargaMeta.totalMin), metaCabe: meta <= t.techo,
  };
}

export function comparar(e, palancas, meta = 35) {
  const P2 = conPalancas(e.P, palancas);
  const actual = medir(e, e.P, meta), escenario = medir(e, P2, meta);
  const frases = [];
  if (escenario.techo > actual.techo) frases.push(`El techo sube de ${actual.techo} a ${escenario.techo} moldes por semana.`);
  else if (escenario.techo < actual.techo) frases.push(`El techo baja de ${actual.techo} a ${escenario.techo} moldes por semana.`);
  else frases.push(`El techo no cambia: ${actual.techo} moldes por semana.`);
  if (palancas.batidoras > e.P.batidoras && escenario.techo === actual.techo) frases.push('Una batidora más no sube la capacidad mientras trabaje una sola persona: lo que falta son horas de manos, no de batidora.');
  if (palancas.hornos > e.P.hornos && escenario.techo === actual.techo) frases.push('Un horno más tampoco: cada horneada cuenta 1 h de operador, y sigue habiendo una sola persona.');
  const durSesion = palancas.sesion * palancas.armadoMin + e.P.lavadoArmadoMin;
  const largoEntreSemana = Math.max(0, ...ventanasDe(P2, '2026-11-18').map(v => v.largo)); // un miércoles cualquiera
  if (palancas.sesion > e.P.sesionMoldes && durSesion > largoEntreSemana) frases.push(`Una sesión de ${palancas.sesion} moldes dura ${horas(durSesion)} h con su lavado: no cabe entre semana (tu ventana más larga es de ${horas(largoEntreSemana)} h), solo el sábado. El techo por horas supone sesiones completas, así que la ganancia real es menor.`);
  if (escenario.techoPorMoldes < escenario.techoPorHoras) frases.push(`En este escenario el límite ya no son las horas sino los moldes y las ventanas: ${escenario.techoPorMoldes} por semana. Con más moldes físicos subiría hasta ${escenario.techoPorHoras}.`);
  if (palancas.soletasCompradas && !e.P.soletasCompradas) frases.push(`Comprar las soletas quita el horneado, pero sube el costo unos $${COSTO_SOLETAS_COMPRADAS} por molde (recetario v3.4).`);
  frases.push(escenario.metaCabe ? `La meta de ${meta} moldes por semana cabe: pide ${escenario.metaH} h y habría ${escenario.disponiblesH} h.` : `La meta de ${meta} moldes pide ${escenario.metaH} h; con este escenario hay ${escenario.disponiblesH} h y el techo es ${escenario.techo}.`);
  return { actual, escenario, frases, P2 };
}

/** Lo que cambia en Ajustes generales si Griz decide que el escenario ya es su operación real. */
export function aConfig(cfg, palancas) {
  const P2 = conPalancas({ horario: cfg.horario, batidoras: 1, hornos: 1 }, palancas);
  return {
    ...cfg, horario: P2.horario, ayudante: P2.ayudante,
    motor: { ...cfg.motor, moldesFisicos: palancas.moldes, sesionArmadoMoldes: palancas.sesion, armadoMinPorMolde: palancas.armadoMin, hornos: palancas.hornos, batidoras: palancas.batidoras, soletasCompradas: !!palancas.soletasCompradas },
  };
}
