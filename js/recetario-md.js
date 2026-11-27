// KUMAI OS · lector de Recetario_KUMAI.md
// Fuente de verdad de costos: si la app y el .md no coinciden, gana el .md.
// Función pura: recibe el texto del .md y devuelve datos; no toca la base.

const limpia = s => String(s || '').replace(/\*\*/g, '').replace(/(^|[^*])\*(?!\*)/g, '$1').replace(/\s+/g, ' ').trim();
const celdas = linea => linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const esFilaTabla = l => /^\s*\|/.test(l) && !/^\s*\|\s*-{3}/.test(l);

/** "$30–40" → {min:30,max:40}; "$119" → {min:119,max:119}; sin precio → null */
export function leerCosto(txt) {
  const m = String(txt).replace(/,/g, '').match(/\$\s*(\d+(?:\.\d+)?)(?:\s*[–-]\s*\$?(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const min = Number(m[1]);
  return { min, max: m[2] ? Number(m[2]) : min };
}

/** "1.9 kg = 10 barras" → {cantidad:1900, unidad:'g'}; "2,860 ml" → ml; "6 piezas" → pza */
export function leerCantidad(txt) {
  const m = limpia(txt).replace(/(\d),(\d{3})/g, '$1$2').match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|cditas?|cdas?|piezas?|pzas?)\b/i);
  if (!m) return null;
  let cantidad = Number(m[1]); let u = m[2].toLowerCase();
  if (u === 'kg') { cantidad *= 1000; u = 'g'; }
  else if (u === 'l') { cantidad *= 1000; u = 'ml'; }
  else if (u.startsWith('cdita')) u = 'cdita';
  else if (u.startsWith('cda')) u = 'cda';
  else if (u.startsWith('pieza') || u.startsWith('pza')) u = 'pza';
  return { cantidad, unidad: u };
}

const CATEGORIAS = [
  [/PERMANENTE/, 'Permanente'], [/INVIERNO/, 'Invierno'], [/PRIMAVERA/, 'Primavera'], [/VERANO/, 'Verano'],
  [/OTOÑO/, 'Otoño'], [/PREMIUM/, 'Premium'], [/TIER S/, 'Tier S'], [/EN VALIDACIÓN/, 'En validación'],
];

export function leerRecetario(md) {
  const lineas = md.replace(/\r\n/g, '\n').split('\n');
  const avisos = [];
  const out = {
    version: (md.match(/Recetario Maestro \(v([\d.]+)\)/) || [])[1] || null,
    cremaBase: null, grenetina: null, soletas: null, precios: {}, recetas: [], resumen: {}, avisos,
  };

  /** Pasos numerados ("**1. **texto") desde la línea `desde` hasta que `fin(l)` sea verdadero. */
  const pasosDesde = (desde, fin) => {
    const ps = [];
    if (desde < 0) return ps;
    for (let i = desde + 1; i < lineas.length && !fin(lineas[i]); i++) {
      const m = lineas[i].match(/^\*\*(\d+)\.\s*\*\*(.*)$/);
      if (m) ps.push(limpia(m[2]));
    }
    return ps;
  };

  // ---------- batch de crema base ----------
  const iBatch = lineas.findIndex(l => /^## Batch de crema base/.test(l));
  if (iBatch >= 0) {
    const rinde = Number((lineas[iBatch].match(/rinde (\d+)/) || [])[1]) || 10;
    const insumos = []; let total = null;
    for (let i = iBatch + 1; i < lineas.length && !/^## /.test(lineas[i]); i++) {
      if (!esFilaTabla(lineas[i])) continue;
      const c = celdas(lineas[i]);
      if (c.length < 4 || /Ingrediente/.test(c[0])) continue;
      const costo = leerCosto(c[3]);
      if (/^\**Total/.test(c[0])) { total = costo && costo.min; continue; }
      const q = leerCantidad(c[1]);
      if (!q || !costo) { avisos.push(`Batch de crema: no pude leer la fila "${limpia(c[0])}"`); continue; }
      insumos.push({ nombre: limpia(c[0]).replace(/\s*\(.*\)$/, ''), cantidad: q.cantidad, unidad: q.unidad, costo: costo.min });
    }
    const iProc = lineas.findIndex((l, i) => i > iBatch && /^\*\*Procedimiento del batch\*\*/.test(l));
    out.cremaBase = { rinde, insumos, total, pasos: pasosDesde(iProc, l => /^#{1,2} /.test(l)) };
  } else avisos.push('No encontré la tabla del batch de crema base.');

  // ---------- grenetina ----------
  const mg = md.match(/Grenetina \((\d+) cubos, (\d+) g\)\s*\|\s*\**\$(\d+)/);
  if (mg) out.grenetina = { gramos: Number(mg[2]), costo: Number(mg[3]), cubos: Number(mg[1]) };
  else avisos.push('No encontré el costo de la grenetina (tabla "Economía del batch").');

  // ---------- grenetina en cubos (preparación) ----------
  const iGc = lineas.findIndex(l => /^## Grenetina en cubos/.test(l));
  if (iGc >= 0) {
    const fin = l => /^#{1,2} /.test(l);
    const pasos = [], notas = [], porCubos = [];
    let lote = null, cubos = null;
    for (let i = iGc + 1; i < lineas.length && !fin(lineas[i]); i++) {
      const l = lineas[i], t = limpia(l);
      let m;
      if ((m = l.match(/^\*\*(\d+)\.\s*\*\*(.*)$/))) { pasos.push(limpia(m[2])); continue; }
      if (/^Ratio:/.test(t)) { notas.push(t); continue; }
      if (/^•/.test(t)) { notas.push(t.replace(/^•\s*/, '')); continue; }
      if (/^\*\*[^*]+\.\*\*/.test(l.trim()) && t.length > 40) { notas.push(t); continue; } // párrafo con entrada en negritas
      if (!esFilaTabla(l)) continue;
      const c = celdas(l).map(limpia);
      if (/Concepto|Cubos/.test(c[0]) && /Cantidad|Grenetina/.test(c[1])) continue;
      if (/^Lote/.test(c[0]) && (m = c[1].match(/(\d+) g de grenetina \+ (\d+) ml de agua/))) lote = { grenetinaG: Number(m[1]), aguaMl: Number(m[2]) };
      else if (/^Charola/.test(c[0]) && (m = c[1].match(/(\d+) cavidades/))) cubos = Number(m[1]);
      else if ((m = c[0].match(/^(\d+) cubos?/))) porCubos.push(`${c[0]} (${c[1]}): ${c[2]}`);
      else if (c[0] && c[1]) notas.push(`${c[0]}: ${c[1]}`);
    }
    out.grenetinaCubos = { lote, cubos: cubos || 20, pasos, notas, porCubos };
  }

  // ---------- soletas ----------
  const iSol = lineas.findIndex(l => /^# Soletillas KUMAI/.test(l));
  if (iSol >= 0) {
    const insumos = []; let total = null, rinde = 42, porMolde = null;
    for (let i = iSol + 1; i < lineas.length && !/^\*\*Equipo\*\*/.test(lineas[i]) && !/^# /.test(lineas[i]); i++) {
      if (!esFilaTabla(lineas[i])) continue;
      const c = celdas(lineas[i]);
      if (c.length < 3 || /Concepto/.test(c[0])) continue;
      const nombre = limpia(c[0]); const costo = leerCosto(c[2]);
      let m;
      if ((m = nombre.match(/Total por tanda de (\d+)/))) { rinde = Number(m[1]); total = costo && costo.min; continue; }
      if ((m = nombre.match(/Costo por molde \((\d+) pzas?\)/))) { porMolde = Number(m[1]); continue; }
      if (/Rendimiento|Costo por soletilla/.test(nombre)) continue;
      const q = leerCantidad(c[1]);
      if (q && costo) insumos.push({ nombre, cantidad: q.cantidad, unidad: q.unidad, costo: costo.min });
    }
    const iProc = lineas.findIndex((l, i) => i > iSol && /^\*\*Procedimiento\*\*/.test(l));
    out.soletas = { rinde, porMolde, insumos, total, pasos: pasosDesde(iProc, l => /^\*\*Almacenamiento\*\*|^# /.test(l)) };
  } else avisos.push('No encontré la sección de soletillas.');

  // ---------- precios de lista ----------
  const mp = md.match(/Molde completo[^$]*\$(\d+)\s*\/\s*Premium \$(\d+)/);
  if (mp) out.precios = { molde: Number(mp[1]), moldePremium: Number(mp[2]) };
  const mpromo = md.match(/Precio promo:[^$]*\$(\d+)/);
  if (mpromo) out.precios.promo = Number(mpromo[1]);

  // ---------- otras líneas (no tiramisú): tabla de la sección "Otras líneas" ----------
  out.otros = [];
  const iOtros = lineas.findIndex(l => /^# Otras líneas/.test(l));
  if (iOtros >= 0) for (let i = iOtros + 1; i < lineas.length && !/^# /.test(lineas[i]); i++) {
    const l = lineas[i];
    if (!/^\|/.test(l) || /^\|\s*-/.test(l) || /Producto/.test(l)) continue;
    const c = celdas(l).map(limpia), num = t => { const m = String(t).replace(/,/g, '').match(/\$(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
    if (!c[0] || num(c[3]) === null) continue;
    out.otros.push({ nombre: c[0], presentacion: c[1], costo: num(c[2]), precio: num(c[3]), rappi: num(c[4]), conRebanada: /rebanada/i.test(c[2]) });
  }

  // ---------- sabores en validación y alérgenos ----------
  const enValidacion = new Set();
  const mv = md.match(/Sabores en validación:([^.]*)\./);
  if (mv) for (const n of mv[1].matchAll(/#(\d+)/g)) enValidacion.add(Number(n[1]));
  const alergenos = {};
  const ma = md.match(/Alérgenos a declarar[^\n]*/);
  if (ma) for (const n of ma[0].matchAll(/#(\d+) \(([^)]+)\)/g)) alergenos[Number(n[1])] = n[2];

  // ---------- familia de los operativos ----------
  const familia = {};
  const iOp = lineas.findIndex(l => /^# .*MENÚ OPERATIVO/.test(l));
  if (iOp >= 0) for (let i = iOp + 1; i < lineas.length && !/^# /.test(lineas[i]); i++) {
    if (!esFilaTabla(lineas[i])) continue;
    const c = celdas(lineas[i]);
    if (/^\d+$/.test(c[0]) && c.length >= 3) familia[Number(c[0])] = limpia(c[2]);
  }

  // ---------- resumen general (nombres cortos y cifras de control) ----------
  const iRes = lineas.findIndex(l => /^# Resumen General/.test(l));
  if (iRes >= 0) for (let i = iRes + 1; i < lineas.length && !/^# /.test(lineas[i]); i++) {
    if (!esFilaTabla(lineas[i])) continue;
    const c = celdas(lineas[i]);
    const m = limpia(c[0]).match(/^(\d+)\.\s+(.+?)\s*(?:🆕)?$/u);
    if (!m || c.length < 5) continue;
    const ed = m[2].match(/\(edición limitada ([^)]+)\)/i);
    out.resumen[Number(m[1])] = {
      nombre: m[2].replace(/🆕/gu, '').replace(/\(edición limitada [^)]+\)/i, '').replace(/\s+/g, ' ').trim(), edicion: ed ? ed[1].trim() : null, costoMolde: leerCosto(c[1]), costoRebanada: leerCosto(c[2]),
      precio: (leerCosto(c[3]) || {}).min, margen: limpia(c[4]),
    };
  }

  // ---------- recetas ----------
  let menu = null, categoria = null, r = null, seccion = null;
  const cerrar = () => {
    if (!r) return;
    // "Vida de venta: 3 días" en las notas manda sobre la regla general del motor.
    const vv = r.notas.join(' ').match(/Vida de venta:\s*(\d+)\s*d[ií]as/i);
    if (vv) r.vidaVentaDias = Number(vv[1]);
    if (r.subreceta && r.subreceta.filas.length) r.notas.unshift(`${r.subreceta.titulo}: ${r.subreceta.filas.join(' · ')}`);
    delete r.subreceta;
    out.recetas.push(r); r = null;
  };
  for (const l of lineas) {
    if (/^# /.test(l)) {
      const mr = l.match(/^# (\d+)\.\s+(.*)$/);
      if (mr) {
        cerrar();
        const num = Number(mr[1]);
        r = {
          num, titulo: limpia(mr[2]), nombre: (out.resumen[num] || {}).nombre || limpia(mr[2]).replace(/^Tiramisú (de )?/, ''),
          menu, categoria: menu === 'operativo' ? (familia[num] || 'Operativo') : categoria,
          descripcion: '', componentes: [], grenetinaG: null, pesoRango: null, sinBatch: false, usaSoletas: false,
          precio: null, declarado: null, pasos: [], notas: [],
          validacion: enValidacion.has(num), alergeno: alergenos[num] || null, edicion: (out.resumen[num] || {}).edicion || null,
        };
        seccion = null;
        continue;
      }
      cerrar();
      if (/MENÚ OPERATIVO/.test(l)) menu = 'operativo';
      else if (/MENÚ DE RESERVA/.test(l)) menu = 'reserva';
      else if (!/^# (\d+)\./.test(l) && menu && /Resumen General|Rotación|Anexo/.test(l)) menu = null;
      continue;
    }
    const mc = l.match(/^\*\*[^\p{L}\d]*\s*([^*]+)\*\*\s*$/u);
    if (mc) { const hit = CATEGORIAS.find(([re]) => re.test(mc[1])); if (hit) { categoria = hit[1]; continue; } }
    if (!r) continue;

    if (/^\*\*Ingredientes y Costos\*\*/.test(l)) { seccion = 'ing'; continue; }
    // Sub-receta antes de los ingredientes (p. ej. la pasta de speculoos del #28): va a notas.
    if (seccion === null) {
      const ms = l.match(/^\*\*([^*]+)\*\*\s*(?:—\s*(.*))?$/);
      if (ms && !/Procedimiento|Resumen/.test(ms[1])) { r.subreceta = { titulo: limpia(ms[1]), filas: [] }; continue; }
      if (r.subreceta && esFilaTabla(l)) {
        const c = celdas(l).map(limpia);
        if (c[0] && !/Ingrediente|^-+$/.test(c[0]) && !/^-/.test(c[0])) r.subreceta.filas.push(c.slice(0, 3).filter(Boolean).join(' '));
        continue;
      }
    }
    if (/^\*\*Procedimiento\*\*/.test(l)) { seccion = 'proc'; continue; }
    if (/^\*\*Resumen de Costos\*\*/.test(l)) { seccion = 'res'; continue; }

    if (!r.descripcion && seccion === null && /^\*[^*].*\*$/.test(l.trim())) { r.descripcion = limpia(l); continue; }

    if (seccion === 'ing' && esFilaTabla(l)) {
      const c = celdas(l);
      if (c.length < 3 || /Componente/.test(c[0])) continue;
      const nombre = limpia(c[0]), detalle = limpia(c[1]), costo = leerCosto(c[2]);
      if (!costo) { avisos.push(`#${r.num} ${r.nombre}: el componente "${nombre}" no trae costo.`); continue; }
      const comp = { nombre, detalle, costo: costo.max, modo: 'fijo' };
      if (costo.min !== costo.max) comp.rango = [costo.min, costo.max];
      if (/^Crema base/.test(nombre)) {
        comp.clave = 'crema';
        const g = (nombre + ' ' + detalle).match(/(\d+) g(?: de)? grenetina/) || detalle.match(/grenetina \((\d+) g\)/);
        r.grenetinaG = g ? Number(g[1]) : null;
        if (/^Crema base universal/.test(nombre)) comp.modo = 'batch'; else r.sinBatch = true;
      } else if (/^Base$/.test(nombre)) {
        comp.clave = 'base';
        if (/soletillas/i.test(detalle)) { comp.modo = 'soletas'; r.usaSoletas = true; }
      }
      r.componentes.push(comp);
      continue;
    }
    if (seccion === 'proc') {
      const mpaso = l.match(/^\*\*(\d+)\.\s*\*\*(.*)$/);
      if (mpaso) {
        const t = limpia(mpaso[2]); r.pasos.push(t);
        const mpeso = t.match(/Verificar peso:\s*(\d+)[–-](\d+) g/);
        if (mpeso) r.pesoRango = [Number(mpeso[1]), Number(mpeso[2])];
        continue;
      }
    }
    if (seccion === 'res' && esFilaTabla(l)) {
      const c = celdas(l);
      if (/Costo total/.test(c[0]) || c.length < 4) continue;
      r.declarado = { costoMolde: leerCosto(c[0]), costoRebanada: leerCosto(c[1]), margen: limpia(c[3]) };
      r.precio = (leerCosto(c[2]) || {}).min || null;
      seccion = 'notas';
      continue;
    }
    if (/^• /.test(l)) r.notas.push(limpia(l.slice(2)));
  }
  cerrar();

  if (out.recetas.length === 0) avisos.push('No encontré ninguna receta con el formato "# N. Nombre".');
  for (const x of out.recetas) {
    if (!x.declarado) avisos.push(`#${x.num} ${x.nombre}: no trae tabla "Resumen de Costos".`);
    if (!x.componentes.some(c => c.clave === 'crema')) avisos.push(`#${x.num} ${x.nombre}: no encontré el renglón de crema base.`);
  }
  return out;
}
