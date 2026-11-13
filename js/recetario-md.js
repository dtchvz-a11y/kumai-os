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
    out.cremaBase = { rinde, insumos, total };
  } else avisos.push('No encontré la tabla del batch de crema base.');

  // ---------- grenetina ----------
  const mg = md.match(/Grenetina \((\d+) cubos, (\d+) g\)\s*\|\s*\**\$(\d+)/);
  if (mg) out.grenetina = { gramos: Number(mg[2]), costo: Number(mg[3]), cubos: Number(mg[1]) };
  else avisos.push('No encontré el costo de la grenetina (tabla "Economía del batch").');

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
    out.soletas = { rinde, porMolde, insumos, total };
  } else avisos.push('No encontré la sección de soletillas.');

  // ---------- precios de lista ----------
  const mp = md.match(/Molde completo[^$]*\$(\d+)\s*\/\s*Premium \$(\d+)/);
  if (mp) out.precios = { molde: Number(mp[1]), moldePremium: Number(mp[2]) };

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
    out.resumen[Number(m[1])] = {
      nombre: m[2].trim(), costoMolde: leerCosto(c[1]), costoRebanada: leerCosto(c[2]),
      precio: (leerCosto(c[3]) || {}).min, margen: limpia(c[4]),
    };
  }

  // ---------- recetas ----------
  let menu = null, categoria = null, r = null, seccion = null;
  const cerrar = () => { if (r) { out.recetas.push(r); r = null; } };
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
          validacion: enValidacion.has(num), alergeno: alergenos[num] || null,
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
