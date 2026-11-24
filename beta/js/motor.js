// KUMAI OS · motor de planeación (especificación v1.3, sección 6). Funciones puras: no tocan la base.
//
// Qué hace:
//  1. Demanda por día = pedidos + lo que falte para el mínimo de mostrador (cuenta el sobrante vigente).
//  2. Programa los armados hacia atrás desde la entrega, dentro de las ventanas de horario.
//  3. Primero los pedidos confirmados; el mostrador se acomoda con lo que quede (decisión 3a).
//  4. Agrupa armados en sesiones para lavar una sola vez; respeta los moldes físicos.
//  5. Asegura crema (7 días) y soletas (30 días): usa primero lo más viejo y programa batch u horneadas si faltan.
//  6. Lo que no cabe se avisa; nunca se programa fuera de una ventana.
import { sumarDias, deYmd, diasEntre } from './util.js';
import { lunesDe, pedidoAbierto } from './modelo.js';

const CLAVES = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
export const claveDia = f => CLAVES[deYmd(f).getDay()];
const aMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const aHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
export const horas = min => Math.round(min / 6) / 10;

/** Reglas de mostrador confirmadas por Griz el 11-nov-2026. */
export const MOSTRADOR_INICIAL = {
  minimoMoldes: { lun: 0, mar: 3, mie: 3, jue: 3, vie: 3, sab: 3, dom: 5 },
  ventaEsperadaPct: 100, // supuesto de planeación: cuánto del mínimo se vende cada día (100 = la vitrina se vacía)
};

export function parametros(cfg, cambios = {}) {
  const m = cfg.motor || {};
  return {
    soletasPorMolde: cfg.soletasPorMolde || 24, rebanadas: cfg.rebanadasPorMolde || 5,
    horneadaSoletas: m.horneadaSoletas || 42, horneadaMin: m.horneadaMin || 60, lavadoHorneadoMin: m.lavadoHorneadoMin ?? 60, tandasPorSesion: m.tandasPorSesion || 7,
    cremaBatchMin: m.cremaBatchMin || 60, cremaRinde: m.cremaRinde || 10, cremaVidaDias: m.cremaVidaDias || 7, lavadoCremaMin: m.lavadoCremaMin ?? 60,
    armadoMin: m.armadoMinPorMolde || 20, sesionMoldes: m.sesionArmadoMoldes || 5, lavadoArmadoMin: m.lavadoArmadoMin ?? 60,
    soletasVidaDias: m.soletasVidaDias || 30, moldesFisicos: m.moldesFisicos || 5, adelantoArmadoDias: m.adelantoArmadoDias || 2,
    personas: 1, hornos: m.hornos || 1, batidoras: m.batidoras || 1,
    ayudante: cfg.ayudante || null,          // { minDia, dias:['lun',…] }: persona extra unas horas al día
    soletasCompradas: !!m.soletasCompradas,  // sin horneado (el recetario estima +$39 por molde)
    horario: cfg.horario || {}, mostrador: cfg.mostrador || MOSTRADOR_INICIAL, semanas: cfg.semanas || {},
    ...cambios,
  };
}

/** Días que una rebanada ya armada puede venderse: 3 con fruta, cítrico u Oreo; 5 los demás. Editable por sabor. */
export function vidaVenta(r) {
  if (!r) return 3;
  if (r.vidaVentaDias) return r.vidaVentaDias;
  return (r.grenetinaG >= 15 || r.sinBatch || /oreo/i.test(r.nombre || '')) ? 3 : 5;
}

/** Sabores de mostrador de la semana que empieza en `lunes`. Si no se eligieron, se repiten los de la semana anterior. */
export function saboresDeSemana(semanas, lunes, operativos) {
  const vivos = new Set(operativos.map(r => r.id));
  for (let i = 0; i <= 8; i++) {
    const s = semanas[sumarDias(lunes, -7 * i)];
    if (s && s.length) { const ok = s.filter(id => vivos.has(id)); if (ok.length) return { ids: ok, elegida: i === 0, heredadaDe: i === 0 ? null : sumarDias(lunes, -7 * i) }; }
  }
  return { ids: operativos.map(r => r.id), elegida: false, heredadaDe: null };
}

/**
 * Ventanas de trabajo de un día con su capacidad en minutos-persona.
 * Un ayudante suma minutos a las ventanas (trabaja en paralelo), pero una tarea sigue teniendo que caber en la ventana.
 */
export function ventanasDe(P, fecha, desdeMin = 0) {
  const k = claveDia(fecha);
  let extra = P.ayudante && (P.ayudante.dias || []).includes(k) ? (P.ayudante.minDia || 0) : 0;
  return (P.horario[k] || []).map(([a, b]) => ({ ini: Math.max(aMin(a), desdeMin), fin: aMin(b) })).filter(v => v.fin - v.ini >= P.armadoMin).map(v => {
    const largo = v.fin - v.ini, ayuda = Math.min(largo, extra); extra -= ayuda;
    return { ...v, largo, cap: largo * P.personas + ayuda };
  });
}

// ---------- carga de trabajo (tabla de la sección 6) ----------
export function cargaDeTrabajo(moldes, P) {
  const tandas = P.soletasCompradas ? 0 : Math.ceil(moldes * P.soletasPorMolde / P.horneadaSoletas);
  const sesionesHorno = Math.ceil(tandas / P.tandasPorSesion);
  const batches = Math.ceil(moldes / P.cremaRinde);
  const sesionesArmado = Math.ceil(moldes / P.sesionMoldes);
  const c = {
    moldes, tandas, sesionesHorno, batches, sesionesArmado,
    horneadoMin: tandas * P.horneadaMin, lavadoHorneadoMin: sesionesHorno * P.lavadoHorneadoMin,
    cremaMin: batches * P.cremaBatchMin, lavadoCremaMin: batches * P.lavadoCremaMin,
    armadoMin: moldes * P.armadoMin, lavadoArmadoMin: sesionesArmado * P.lavadoArmadoMin,
  };
  c.lavadoMin = c.lavadoHorneadoMin + c.lavadoCremaMin + c.lavadoArmadoMin;
  c.totalMin = c.horneadoMin + c.cremaMin + c.armadoMin + c.lavadoMin;
  return c;
}
export function minutosSemana(P) {
  const FECHA = { dom: '2026-11-15', lun: '2026-11-16', mar: '2026-11-17', mie: '2026-11-18', jue: '2026-11-19', vie: '2026-11-20', sab: '2026-11-21' };
  return CLAVES.reduce((s, k) => s + ventanasDe(P, FECHA[k]).reduce((t, v) => t + v.cap, 0), 0);
}
/** Máximo de moldes por semana que cabe en las horas disponibles, con los moldes físicos que hay. */
export function techoSemanal(P) {
  const disponibles = minutosSemana(P);
  let porMoldes = 0;
  const FECHA = { dom: '2026-11-15', lun: '2026-11-16', mar: '2026-11-17', mie: '2026-11-18', jue: '2026-11-19', vie: '2026-11-20', sab: '2026-11-21' };
  for (const k of CLAVES) {
    let caben = 0;
    for (const v of ventanasDe(P, FECHA[k])) {
      const porSesion = Math.max(0, Math.min(P.sesionMoldes, Math.floor((v.largo - P.lavadoArmadoMin) / P.armadoMin)));
      caben += Math.min(porSesion * Math.ceil(v.cap / v.largo), Math.floor(Math.max(0, v.cap - P.lavadoArmadoMin) / P.armadoMin));
    }
    porMoldes += Math.min(P.moldesFisicos, caben);
  }
  let n = 0;
  while (n < 400 && cargaDeTrabajo(n + 1, P).totalMin <= disponibles) n++;
  return { porHoras: n, porMoldes, techo: Math.min(n, porMoldes), disponiblesMin: disponibles };
}

// ---------- planeación ----------
/**
 * @param e.hoy 'YYYY-MM-DD' · e.ahoraMin minutos desde medianoche (lo que ya pasó de hoy no se usa)
 * @param e.dias horizonte · e.P parámetros · e.recetas lista de sabores · e.pedidos · e.lotes
 */
export function planificar(e) {
  const { hoy, ahoraMin = 0, P, pedidos = [], lotes = [] } = e;
  const H = e.dias || 14;
  const R = new Map((e.recetas || []).map(r => [r.id, r]));
  const operativos = [...R.values()].filter(r => r.tipo === 'sabor' && r.menu === 'operativo' && !r.archivada && !r.deleted);
  const fechas = Array.from({ length: H }, (_, i) => sumarDias(hoy, i));
  const alertas = [];
  const prodHoy = lotes.filter(l => !l.deleted && l.tipo === 'producto' && l.fechaProduccion === hoy).reduce((s, l) => s + l.cantidadProducida / P.rebanadas, 0);

  let D = fechas.map((f, i) => ({
    fecha: f, moldes: i === 0 ? Math.round(prodHoy) : 0, lavadoHorno: false,
    ventanas: ventanasDe(P, f, i === 0 ? ahoraMin : 0)
      .map(v => ({ ...v, libre: v.cap, horno: v.largo * P.hornos, batidora: v.largo * P.batidoras, sesiones: [], batches: 0, tandas: 0, lavadoHorno: 0 })),
  }));

  // ===== A. Demanda: qué moldes hacen falta y para qué día =====
  const inv = lotes.filter(l => !l.deleted && l.tipo === 'producto' && l.disponible > 0)
    .map(l => ({ recetaId: l.recetaId, disp: l.disponible, dia: diasEntre(hoy, l.fechaProduccion), vida: vidaVenta(R.get(l.recetaId)) }));
  const vendible = (l, i) => l.disp > 0 && l.dia < i && i - l.dia <= l.vida;
  const tomar = (i, n, recetaId = null) => {
    for (const l of inv.filter(l => vendible(l, i) && (!recetaId || l.recetaId === recetaId)).sort((a, b) => (a.dia + a.vida) - (b.dia + b.vida))) {
      const k = Math.min(l.disp, n); l.disp -= k; n -= k; if (!n) break;
    }
    return n; // lo que faltó
  };
  const necesidades = [];
  const demanda = [];
  const abiertos = pedidos.filter(pedidoAbierto);
  const stockVigente = i => inv.filter(l => vendible(l, i)).reduce((s, l) => s + l.disp, 0);
  // A1. Pedidos: salen del stock si alcanza; lo que falte se produce y el sobrante del molde pasa a vitrina.
  //     Se resuelven antes que el mostrador: las rebanadas que un pedido necesita quedan apartadas.
  for (let i = 0; i < H; i++) {
    const f = fechas[i];
    const info = { fecha: f, pedidos: [], rebanadasPedidos: 0, objetivo: 0, stockApertura: stockVigente(i), faltaMostrador: 0, sabores: [] };
    for (const p of abiertos.filter(p => p.fechaEntrega === f).sort((a, b) => (a.horaEntrega || '').localeCompare(b.horaEntrega || ''))) {
      info.pedidos.push(p.id);
      const porSabor = new Map();
      for (const l of p.lineas) porSabor.set(l.recetaId, (porSabor.get(l.recetaId) || 0) + l.cantidad * (l.presentacion === 'molde' ? P.rebanadas : 1));
      for (const [recetaId, n] of porSabor) {
        info.rebanadasPedidos += n;
        const falta = tomar(i, n, recetaId);
        if (!falta) continue;
        const k = Math.ceil(falta / P.rebanadas);
        for (let j = 0; j < k; j++) necesidades.push({ recetaId, due: i, motivo: 'pedido', pedidoId: p.id, folio: p.folio });
        if (k * P.rebanadas > falta) inv.push({ recetaId, disp: k * P.rebanadas - falta, dia: i - 1, vida: vidaVenta(R.get(recetaId)) });
      }
    }
    demanda.push(info);
  }
  // A2. Mínimo de mostrador, con lo que quedó después de apartar los pedidos.
  const veces = new Map();
  for (let i = 0; i < H; i++) {
    const f = fechas[i], info = demanda[i];
    const moldesMin = e.sinMostrador ? 0 : (P.mostrador.minimoMoldes[claveDia(f)] || 0);
    info.objetivo = moldesMin * P.rebanadas;
    if (!info.objetivo) continue;
    const sem = saboresDeSemana(P.semanas, lunesDe(f), operativos);
    info.sabores = sem.ids;
    info.stockApertura = stockVigente(i);
    const delSabor = id => inv.filter(l => vendible(l, i) && l.recetaId === id).reduce((s, l) => s + l.disp, 0);
    const finDeSemana = ['vie', 'sab', 'dom'].includes(claveDia(f));
    let guardia = 0;
    while (sem.ids.length && stockVigente(i) < info.objetivo && guardia++ < 20) {
      // el sabor con menos rebanadas en vitrina; fruta y Oreo (3 días) de preferencia hacia el fin de semana
      const id = [...sem.ids].sort((a, b) => delSabor(a) - delSabor(b)
        || (veces.get(a) || 0) - (veces.get(b) || 0) // rota: primero el que menos se ha hecho
        || ((vidaVenta(R.get(a)) <= 3) === finDeSemana ? 0 : 1) - ((vidaVenta(R.get(b)) <= 3) === finDeSemana ? 0 : 1)
        || (R.get(a).num - R.get(b).num))[0];
      veces.set(id, (veces.get(id) || 0) + 1);
      necesidades.push({ recetaId: id, due: i, motivo: 'mostrador' });
      inv.push({ recetaId: id, disp: P.rebanadas, dia: i - 1, vida: vidaVenta(R.get(id)) });
      info.faltaMostrador += P.rebanadas;
    }
    tomar(i, Math.round(info.objetivo * (P.mostrador.ventaEsperadaPct ?? 100) / 100)); // venta esperada del día
  }

  // ===== B. Colocar armados (con su crema y sus soletas) =====
  const cremaLotes = lotes.filter(l => !l.deleted && l.tipo === 'crema' && l.disponible > 0).map(l => ({ dia: diasEntre(hoy, l.fechaProduccion), v: -1, cant: l.disponible }));
  const soletaLotes = lotes.filter(l => !l.deleted && l.tipo === 'soletas' && l.disponible > 0).map(l => ({ dia: diasEntre(hoy, l.fechaProduccion), v: -1, cant: l.disponible }));

  // Horneadas que harán falta en todo el horizonte: sirve para hornear varias tandas por sesión.
  const soletasPedidas = P.soletasCompradas ? 0 : necesidades.filter(n => (R.get(n.recetaId) || {}).usaSoletas !== false).length * P.soletasPorMolde;
  const tandasObjetivo = Math.ceil(Math.max(0, soletasPedidas - soletaLotes.filter(l => -l.dia <= P.soletasVidaDias).reduce((t, l) => t + l.cant, 0)) / P.horneadaSoletas);

  /** Simula el consumo en orden de tiempo. Devuelve el primer faltante o null. */
  const faltante = d => {
    const crema = cremaLotes.map(x => ({ ...x })), sol = soletaLotes.map(x => ({ ...x }));
    d.forEach((dia, i) => dia.ventanas.forEach((w, j) => {
      if (w.batches) crema.push({ dia: i, v: j, cant: w.batches * P.cremaRinde });
      if (w.tandas) sol.push({ dia: i, v: j, cant: w.tandas * P.horneadaSoletas });
    }));
    const usar = (lots, i, j, n, vida) => {
      for (const l of lots.filter(l => l.cant > 0 && (l.dia < i || (l.dia === i && l.v < j)) && i - l.dia <= vida).sort((a, b) => a.dia - b.dia || a.v - b.v)) {
        const k = Math.min(l.cant, n); l.cant -= k; n -= k; if (!n) break;
      }
      return n;
    };
    for (let i = 0; i < d.length; i++) for (let j = 0; j < d[i].ventanas.length; j++) for (const s of d[i].ventanas[j].sesiones) {
      const botes = s.moldes.filter(m => !(R.get(m.recetaId) || {}).sinBatch).length;
      const piezas = P.soletasCompradas ? 0 : s.moldes.filter(m => (R.get(m.recetaId) || {}).usaSoletas !== false).length * P.soletasPorMolde;
      if (usar(crema, i, j, botes, P.cremaVidaDias - 1)) return { tipo: 'crema', i, j };
      if (usar(sol, i, j, piezas, P.soletasVidaDias)) return { tipo: 'soletas', i, j };
    }
    return null;
  };
  /** Programa batch de crema u horneadas hasta que no falte nada. false = no hay dónde. */
  const resolver = d => {
    for (let vuelta = 0; vuelta < 300; vuelta++) {
      const f = faltante(d);
      if (!f) return true;
      let puesto = false;
      const antes = (i, j) => (i < f.i) || (i === f.i && j < f.j);
      if (f.tipo === 'crema') {
        const dur = P.cremaBatchMin + P.lavadoCremaMin;
        for (let i = f.i; i >= Math.max(0, f.i - (P.cremaVidaDias - 1)) && !puesto; i--) for (let j = d[i].ventanas.length - 1; j >= 0 && !puesto; j--) {
          const w = d[i].ventanas[j];
          if (antes(i, j) && w.largo >= dur && w.libre >= dur && w.batidora >= P.cremaBatchMin) { w.libre -= dur; w.batidora -= P.cremaBatchMin; w.batches++; puesto = true; }
        }
      } else {
        // 1.º: un día que ya hornea (el lavado ya está pagado), el más cercano al armado.
        for (let i = f.i; i >= 0 && !puesto; i--) {
          if (!d[i].lavadoHorno) continue;
          for (let j = d[i].ventanas.length - 1; j >= 0 && !puesto; j--) {
            const w = d[i].ventanas[j];
            if (antes(i, j) && w.libre >= P.horneadaMin && w.horno >= P.horneadaMin) { w.libre -= P.horneadaMin; w.horno -= P.horneadaMin; w.tandas++; puesto = true; }
          }
        }
        // 2.º: abrir una sesión de horneado donde quepan más tandas de un jalón (las soletas duran 30 días
        //      y así se lava menos veces). En empate, el día más cercano al armado.
        if (!puesto) {
          const programadas = d.reduce((t, dia) => t + dia.ventanas.reduce((x, w) => x + w.tandas, 0), 0);
          const tope = Math.max(1, Math.min(P.tandasPorSesion, tandasObjetivo - programadas));
          let mejor = null;
          for (let i = f.i; i >= 0; i--) for (let j = d[i].ventanas.length - 1; j >= 0; j--) {
            const w = d[i].ventanas[j];
            if (!antes(i, j)) continue;
            for (let t = tope; t >= 1; t--) {
              if (w.libre < t * P.horneadaMin || w.horno < t * P.horneadaMin) continue;
              const wl = [...d[i].ventanas].reverse().find(x => x.libre >= P.lavadoHorneadoMin + (x === w ? t * P.horneadaMin : 0));
              if (!wl) continue;
              if (!mejor || t > mejor.t) mejor = { i, j, t, wl: d[i].ventanas.indexOf(wl) };
              break;
            }
          }
          if (mejor) {
            const w = d[mejor.i].ventanas[mejor.j], wl = d[mejor.i].ventanas[mejor.wl];
            wl.libre -= P.lavadoHorneadoMin; wl.lavadoHorno += P.lavadoHorneadoMin; d[mejor.i].lavadoHorno = true;
            w.libre -= mejor.t * P.horneadaMin; w.horno -= mejor.t * P.horneadaMin; w.tandas += mejor.t; puesto = true;
          }
        }
      }
      if (!puesto) return false;
    }
    return false;
  };
  /** Opciones para armar un molde el día a: unirse a una sesión (solo +armado) o abrir una (armado + lavado). */
  const opciones = (d, a) => {
    const out = [];
    if (d[a].moldes >= P.moldesFisicos) return out;
    d[a].ventanas.forEach((w, j) => {
      w.sesiones.forEach((s, k) => {
        if (s.moldes.length < P.sesionMoldes && w.libre >= P.armadoMin && (s.moldes.length + 1) * P.armadoMin + P.lavadoArmadoMin <= w.largo) out.push({ j, k, costo: P.armadoMin });
      });
      const dur = P.armadoMin + P.lavadoArmadoMin;
      if (w.libre >= dur && w.largo >= dur) out.push({ j, k: -1, costo: dur });
    });
    return out.sort((x, y) => x.costo - y.costo || y.j - x.j);
  };
  const colocar = n => {
    const vida = vidaVenta(R.get(n.recetaId));
    const desde = Math.max(0, n.due - vida);
    const cerca = [], lejos = [];
    for (let a = n.due - 1; a >= desde; a--) (n.due - a <= P.adelantoArmadoDias ? cerca : lejos).push(a);
    const candidatos = [];
    for (const a of cerca) for (const o of opciones(D, a)) candidatos.push({ a, ...o });
    candidatos.sort((x, y) => x.costo - y.costo || y.a - x.a); // lo que menos horas suma; en empate, lo más fresco
    for (const a of lejos) for (const o of opciones(D, a)) candidatos.push({ a, ...o });
    for (const c of candidatos) {
      const copia = structuredClone(D);
      const w = copia[c.a].ventanas[c.j];
      if (c.k >= 0) w.sesiones[c.k].moldes.push(n); else w.sesiones.push({ moldes: [n] });
      w.libre -= c.costo; copia[c.a].moldes++;
      if (resolver(copia)) { D = copia; return c.a; }
    }
    return -1;
  };
  const orden = [...necesidades.filter(n => n.motivo === 'pedido'), ...necesidades.filter(n => n.motivo === 'mostrador')]; // 3a: pedidos primero
  const noCaben = [];
  for (const n of orden) {
    n.armado = n.due >= 1 ? colocar(n) : -1;
    if (n.armado < 0) noCaben.push(n);
  }
  // avisos
  const porPedido = new Map();
  for (const n of noCaben.filter(n => n.motivo === 'pedido')) { if (!porPedido.has(n.pedidoId)) porPedido.set(n.pedidoId, []); porPedido.get(n.pedidoId).push(n); }
  for (const [pedidoId, ns] of porPedido) {
    const hoyMismo = ns[0].due === 0;
    alertas.push({ tipo: 'no-cabe', pedidoId, folio: ns[0].folio, fecha: fechas[ns[0].due], moldes: ns.length,
      texto: `${ns[0].folio || 'El pedido'} no cabe el ${fechas[ns[0].due]}: ${hoyMismo ? 'es para hoy y no hay rebanadas suficientes en vitrina' : `falta tiempo para ${ns.length === 1 ? '1 molde' : ns.length + ' moldes'}`}.` });
  }
  const cortos = new Map();
  for (const n of noCaben.filter(n => n.motivo === 'mostrador')) cortos.set(n.due, (cortos.get(n.due) || 0) + 1);
  for (const [due, k] of cortos) {
    alertas.push({ tipo: 'mostrador-corto', fecha: fechas[due], moldes: k,
      texto: due === 0 ? `Hoy la vitrina abre con ${demanda[0].stockApertura} rebanadas; el mínimo son ${demanda[0].objetivo}.` : `Mostrador corto el ${fechas[due]}: ${k === 1 ? 'no cabe 1 molde' : 'no caben ' + k + ' moldes'} del mínimo.` });
  }

  // ===== C. Tareas con hora =====
  const tareas = [];
  D.forEach((dia, i) => dia.ventanas.forEach((w, j) => {
    let t = w.ini;
    const push = (tipo, dur, extra) => { tareas.push({ id: `${dia.fecha}|${j}|${tipo}|${tareas.length}`, fecha: dia.fecha, ventana: j, tipo, inicio: aHora(t), inicioMin: t, duracionMin: dur, ...extra }); t += dur * w.largo / w.cap; };
    if (w.batches) for (let b = 0; b < w.batches; b++) push('crema', P.cremaBatchMin + P.lavadoCremaMin, { trabajoMin: P.cremaBatchMin, lavadoMin: P.lavadoCremaMin, cantidad: P.cremaRinde });
    if (w.tandas) push('horneado', w.tandas * P.horneadaMin, { trabajoMin: w.tandas * P.horneadaMin, lavadoMin: 0, tandas: w.tandas, cantidad: w.tandas * P.horneadaSoletas });
    if (w.lavadoHorno) push('lavado', w.lavadoHorno, { trabajoMin: 0, lavadoMin: w.lavadoHorno });
    for (const s of w.sesiones) push('armado', s.moldes.length * P.armadoMin + P.lavadoArmadoMin, {
      trabajoMin: s.moldes.length * P.armadoMin, lavadoMin: P.lavadoArmadoMin,
      moldes: s.moldes.map(m => ({ recetaId: m.recetaId, motivo: m.motivo, pedidoId: m.pedidoId || null, folio: m.folio || null, para: fechas[m.due] })),
    });
  }));

  // ===== D. Resumen por semana =====
  const semanas = new Map();
  const sem = f => { const l = lunesDe(f); if (!semanas.has(l)) semanas.set(l, { lunes: l, horneadoMin: 0, cremaMin: 0, armadoMin: 0, lavadoMin: 0, totalMin: 0, moldes: 0, moldesPedido: 0, moldesMostrador: 0, tandas: 0, batches: 0 }); return semanas.get(l); };
  for (const t of tareas) {
    const s = sem(t.fecha);
    if (t.tipo === 'horneado') { s.horneadoMin += t.trabajoMin; s.tandas += t.tandas; }
    if (t.tipo === 'crema') { s.cremaMin += t.trabajoMin; s.batches++; }
    if (t.tipo === 'armado') { s.armadoMin += t.trabajoMin; s.moldes += t.moldes.length; s.moldesPedido += t.moldes.filter(m => m.motivo === 'pedido').length; s.moldesMostrador += t.moldes.filter(m => m.motivo === 'mostrador').length; }
    s.lavadoMin += t.lavadoMin; s.totalMin += t.duracionMin;
  }
  const dias = D.map((dia, i) => {
    const total = dia.ventanas.reduce((s, w) => s + w.cap, 0), libre = dia.ventanas.reduce((s, w) => s + w.libre, 0);
    const logrados = orden.filter(n => n.motivo === 'mostrador' && n.due === i && n.armado >= 0).length;
    return { fecha: dia.fecha, disponibleMin: total, usadoMin: total - libre, saturado: total > 0 && libre < P.armadoMin + P.lavadoArmadoMin, moldes: dia.moldes, ...demanda[i], stockPlaneado: demanda[i].stockApertura + logrados * P.rebanadas };
  });
  return { hoy, tareas, alertas, dias, necesidades: orden, semanas: [...semanas.values()], noCaben: noCaben.length };
}

/** ¿Cabe este pedido? Corre el plan con el pedido incluido y busca la primera fecha en que sí cabe. */
export function cabePedido(e, pedido) {
  const otros = (e.pedidos || []).filter(p => p.id !== pedido.id);
  const probar = fecha => {
    const p = { ...pedido, id: pedido.id || '__nuevo__', folio: pedido.folio || 'Este pedido', fechaEntrega: fecha, estatus: 'pendiente', deleted: false };
    const antes = planificar({ ...e, pedidos: otros });
    const plan = planificar({ ...e, pedidos: [...otros, p] });
    const propio = plan.alertas.filter(a => a.pedidoId === p.id);
    const nuevos = plan.alertas.filter(a => a.tipo === 'no-cabe' && a.pedidoId !== p.id && !antes.alertas.some(b => b.pedidoId === a.pedidoId));
    const mostrador = plan.alertas.filter(a => a.tipo === 'mostrador-corto').reduce((s, a) => s + a.moldes, 0) - antes.alertas.filter(a => a.tipo === 'mostrador-corto').reduce((s, a) => s + a.moldes, 0);
    return { cabe: !propio.length && !nuevos.length, motivo: propio[0] ? propio[0].texto : nuevos[0] ? `Desplaza a ${nuevos[0].folio}.` : '', mostradorCorto: Math.max(0, mostrador) };
  };
  const fuera = diasEntre(e.hoy, pedido.fechaEntrega);
  if (fuera < 0) return { cabe: false, motivo: 'La fecha ya pasó.', alternativa: null, mostradorCorto: 0 };
  if (fuera >= (e.dias || 14)) return { cabe: true, motivo: '', alternativa: null, mostradorCorto: 0, lejano: true };
  const r = probar(pedido.fechaEntrega);
  if (r.cabe) return { ...r, alternativa: null };
  let alternativa = null;
  for (let i = 1; i <= 7 && !alternativa; i++) {
    const f = sumarDias(pedido.fechaEntrega, i);
    if (diasEntre(e.hoy, f) < (e.dias || 14) && probar(f).cabe) alternativa = f;
  }
  return { ...r, alternativa };
}

/** Insumos que pide el plan en los próximos `dias` días: batches, horneadas y grenetina. */
export function consumoDelPlan(plan, dias, recetas, bases) {
  const R = new Map(recetas.map(r => [r.id, r]));
  const hasta = sumarDias(plan.hoy, dias - 1);
  const uso = new Map();
  const sumar = (id, n) => uso.set(id, (uso.get(id) || 0) + n);
  let batches = 0, tandas = 0, moldes = 0;
  for (const t of plan.tareas) {
    if (t.fecha > hasta) continue;
    if (t.tipo === 'crema' && bases.crema) { batches++; for (const l of bases.crema.insumos) sumar(l.insumoId, l.cantidad); }
    if (t.tipo === 'horneado' && bases.soletas) { tandas += t.tandas; for (const l of bases.soletas.insumos) sumar(l.insumoId, l.cantidad * t.tandas); }
    if (t.tipo === 'armado') for (const m of t.moldes) { moldes++; const r = R.get(m.recetaId); if (r && r.grenetinaG) sumar('insumo-grenetina', r.grenetinaG); }
  }
  return { uso, batches, tandas, moldes };
}
