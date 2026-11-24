// KUMAI OS · carga inicial guiada (especificación v1.2, sección 7): lista para operar en menos de 15 min
import { esc, dinero, sumarDias } from '../util.js';
import { costoReceta, margen } from '../costeo.js';
import { existencia } from '../modelo.js';

const PASOS = 4;
function estado(app) {
  return app.ui.carga || (app.ui.carga = {
    paso: 0, ruta: 'nuevo', stock: {}, soletas: '', soletasFecha: app.hoy(), botes: '', botesFecha: app.hoy(),
    url: app.base.meta.syncUrl || '', clave: app.base.meta.syncClave || '', nombre: app.base.meta.nombreDispositivo || (/Android|iPhone/i.test(navigator.userAgent) ? 'Celular' : 'PC'),
    avisos: [], ocupado: false,
  });
}
const barra = n => `<div class="pasos">${Array.from({ length: PASOS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</div>`;

export function render(app) {
  const u = estado(app);
  let h = '<div class="asistente">';
  if (u.paso === 0) {
    h += `<h2>Bienvenido a KUMAI OS</h2>
      <p>Una sola app para recetario, pedidos, producción y dinero. Funciona sin señal y se sincroniza con tu hoja de Google cuando hay conexión.</p>
      <p>La app arranca vacía: no trae pedidos ni ventas de la versión anterior. El recetario se carga desde Recetario_KUMAI.md.</p>
      <div class="acciones"><button class="primary" data-accion="carga.empezar">Empezar en este equipo</button>
      <button class="secondary" data-accion="carga.existente">Ya uso KUMAI OS en otro equipo</button></div>`;
  } else if (u.paso === 1) {
    const ctx = app.ctx(), sab = app.sabores(), oper = sab.filter(r => r.menu === 'operativo');
    h += barra(1) + `<h2>1 · Recetario</h2>
      <p>Cargué <b>${sab.length} sabores</b> del Recetario v${esc(app.cfg().recetarioVersion || '—')}: ${oper.length} en el menú operativo y ${sab.length - oper.length} de reserva. ${app.cfg().soletasPorMolde} soletas por molde.</p>
      <table class="tabla"><tr><th>Operativo</th><th class="r">Molde</th><th class="r">Margen</th></tr>
      ${oper.map(r => { const c = costoReceta(r, ctx); const p = (app.producto(r.id, 'rebanada') || { precios: {} }).precios.WhatsApp || 0; return `<tr><td>#${r.num} ${esc(r.nombre)}</td><td class="r">${dinero(c.molde)}</td><td class="r">${margen(p, c.rebanada).pct}%</td></tr>`; }).join('')}</table>
      ${u.avisos.length ? `<div class="alert soft"><div><b>Para que lo sepas</b><ul style="margin:6px 0 0;padding-left:18px">${u.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div></div>` : ''}
      <p class="mini">Si el .md cambia después, lo importas desde Recetario y la app te enseña las diferencias antes de aplicar.</p>
      <div class="acciones"><button class="primary" data-accion="carga.sig">Continuar</button></div>`;
  } else if (u.paso === 2) {
    const ins = app.base.lista('insumos').sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '') || a.nombre.localeCompare(b.nombre));
    h += barra(2) + `<h2>2 · Insumos en casa</h2><p>Escribe lo que tienes hoy. Lo que dejes vacío queda en cero y lo ajustas después.</p>
      ${ins.map(i => { const p = i.presentacion || { nombre: i.unidad, cantidad: 1 }; return `<div class="stockfila"><div><b>${esc(i.nombre)}</b><span>en ${esc(p.nombre)}${p.cantidad > 1 ? ` de ${p.cantidad} ${esc(i.unidad)}` : ''}</span></div>
        <input type="number" inputmode="decimal" min="0" step="any" placeholder="0" value="${esc(u.stock[i.id] ?? '')}" data-entrada="carga.stock" data-id="${esc(i.id)}" aria-label="${esc(i.nombre)}"></div>`; }).join('')}
      <div class="acciones h"><button class="secondary" data-accion="carga.ant">Atrás</button><button class="primary" data-accion="carga.sig">Continuar</button></div>`;
  } else if (u.paso === 3) {
    h += barra(3) + `<h2>3 · Soletas y crema</h2><p>Lo que ya tienes hecho. La app lleva la cuenta de su caducidad: crema 7 días, soletas 30.</p>
      <div class="dos"><div><label for="cSol">Soletas (piezas)</label><input id="cSol" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(u.soletas)}" data-entrada="carga.campo" data-campo="soletas"></div>
        <div><label for="cSolF">Se hornearon el</label><input id="cSolF" type="date" max="${app.hoy()}" value="${esc(u.soletasFecha)}" data-entrada="carga.campo" data-campo="soletasFecha"></div></div>
      <div class="dos"><div><label for="cBot">Botes de crema base</label><input id="cBot" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(u.botes)}" data-entrada="carga.campo" data-campo="botes"></div>
        <div><label for="cBotF">Fecha del batch</label><input id="cBotF" type="date" max="${app.hoy()}" value="${esc(u.botesFecha)}" data-entrada="carga.campo" data-campo="botesFecha"></div></div>
      <p class="mini" style="margin-top:12px">Si hay botes de dos batches distintos, captura el más viejo: es el que caduca primero.</p>
      <div class="acciones h"><button class="secondary" data-accion="carga.ant">Atrás</button><button class="primary" data-accion="carga.sig">Continuar</button></div>`;
  } else {
    h += barra(4) + `<h2>${u.ruta === 'existente' ? 'Conectar este equipo' : '4 · Sincronización'}</h2>
      <p>${u.ruta === 'existente' ? 'Pon la misma dirección y clave que usas en el otro equipo. Se descargan tus datos y este equipo recibe su propia letra de folio.' : 'Conecta tu hoja de Google para ver los mismos datos en el celular y la PC. Puedes saltarlo y hacerlo después en Ajustes; mientras tanto todo queda guardado en este equipo.'}</p>
      <label for="cUrl">Dirección del Apps Script</label><input id="cUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(u.url)}" data-entrada="carga.campo" data-campo="url">
      <label for="cClave">Clave</label><input id="cClave" autocomplete="off" autocapitalize="off" value="${esc(u.clave)}" data-entrada="carga.campo" data-campo="clave">
      <label for="cNom">Nombre de este equipo</label><input id="cNom" value="${esc(u.nombre)}" data-entrada="carga.campo" data-campo="nombre">
      <p class="mini" style="margin-top:12px">La guía paso a paso está en GUIA_SYNC.md, dentro de la carpeta de la app.</p>
      <div class="acciones"><button class="primary" data-accion="carga.conectar" ${u.ocupado ? 'disabled' : ''}>${u.ocupado ? 'Conectando…' : 'Conectar y terminar'}</button>
      ${u.ruta === 'existente' ? `<button class="secondary" data-accion="carga.inicio">Atrás</button>` : `<button class="secondary" data-accion="carga.terminar">Terminar sin sincronizar</button><button class="ghost" data-accion="carga.ant">Atrás</button>`}</div>`;
  }
  return h + '</div>';
}

async function guardarStock(app) {
  const u = estado(app), b = app.base, hoy = app.hoy();
  const movs = [];
  const actuales = b.lista('movimientos');
  for (const i of b.lista('insumos')) {
    if (u.stock[i.id] === undefined || u.stock[i.id] === '') continue;
    const objetivo = (Number(u.stock[i.id]) || 0) * ((i.presentacion && i.presentacion.cantidad) || 1);
    const dif = Math.round((objetivo - existencia(i.id, actuales)) * 1000) / 1000;
    if (dif !== 0) movs.push({ insumoId: i.id, tipo: 'ajuste', cantidad: dif, fecha: hoy, referencia: 'Carga inicial' });
  }
  if (movs.length) await b.guardarVarios('movimientos', movs);
  const lotes = [];
  if (Number(u.soletas) > 0) lotes.push({ tipo: 'soletas', cantidadProducida: Number(u.soletas), disponible: Number(u.soletas), fechaProduccion: u.soletasFecha || hoy, caducidad: sumarDias(u.soletasFecha || hoy, app.cfg().motor.soletasVidaDias), referencia: 'Carga inicial' });
  if (Number(u.botes) > 0) lotes.push({ tipo: 'crema', cantidadProducida: Number(u.botes), disponible: Number(u.botes), fechaProduccion: u.botesFecha || hoy, caducidad: sumarDias(u.botesFecha || hoy, app.cfg().motor.cremaVidaDias - 1), referencia: 'Carga inicial' });
  if (lotes.length) await b.guardarVarios('lotes', lotes);
}

async function terminar(app) {
  const u = estado(app);
  if (u.ruta === 'nuevo') await guardarStock(app);
  await app.base.metaSet('cargaInicial', true);
  app.ui.carga = null; app.vista = 'hoy'; app.render();
  app.toast('KUMAI OS está lista');
}

export const acciones = {
  async empezar(app) { const u = estado(app); const s = await app.sembrar(); u.avisos = s.avisos; u.ruta = 'nuevo'; u.paso = 1; app.render(); },
  existente: app => { const u = estado(app); u.ruta = 'existente'; u.paso = 4; app.render(); },
  inicio: app => { estado(app).paso = 0; app.render(); },
  sig: app => { estado(app).paso++; app.render(); window.scrollTo(0, 0); },
  ant: app => { estado(app).paso--; app.render(); window.scrollTo(0, 0); },
  terminar: app => terminar(app),
  async conectar(app) {
    const u = estado(app);
    if (!u.url.trim() || !u.clave.trim()) return app.toast('Faltan la dirección y la clave');
    u.ocupado = true; app.render();
    try {
      await app.base.metaSet('syncUrl', u.url.trim()); await app.base.metaSet('syncClave', u.clave.trim()); await app.base.metaSet('nombreDispositivo', u.nombre.trim() || 'Equipo');
      app.configurarSync();
      const r = await app.sync.sincronizar();
      if (r.fase !== 'ok') { app.toast(r.fase === 'sin-conexion' ? 'No pude conectar. Revisa la dirección y tu señal.' : (r.error || 'No se pudo sincronizar'), 5000); return; }
      if (!app.sabores().length) await app.sembrar(); // hoja nueva o vacía: este equipo pone el recetario
      await app.registrarDispositivo();
      await terminar(app);
      app.sincronizar();
    } finally { u.ocupado = false; if (!app.base.meta.cargaInicial) app.render(); }
  },
};

export const entradas = {
  campo: (app, d, el) => { estado(app)[d.campo] = el.value; },
  stock: (app, d, el) => { estado(app).stock[d.id] = el.value; },
};
