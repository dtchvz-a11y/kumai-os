// KUMAI OS · Simulador: "¿y si…?" con los datos reales, sin tocarlos
import { esc } from '../util.js';
import { palancasDe, comparar, aConfig } from '../simulador.js';

function estado(app) { return app.ui.sim || (app.ui.sim = palancasDe(app.motorEntrada(14).P)); }
const num = (id, etq, v, paso = 1, min = 0) => `<div><label for="${id}">${etq}</label><input id="${id}" type="number" inputmode="decimal" min="${min}" step="${paso}" value="${v}" data-entrada="simulador.campo" data-campo="${id.slice(1)}"></div>`;

export function render(app) {
  const x = estado(app), e = app.motorEntrada(14), base = palancasDe(e.P);
  const meta = (app.cfg().metas || {}).moldesSemana || 35;
  const r = comparar(e, x, meta), a = r.actual, s = r.escenario;
  const cambio = JSON.stringify(x) !== JSON.stringify(base);
  const fila = (etq, k, mejorAlto = true, sufijo = '') => {
    const d = s[k] - a[k], mejor = d !== 0 && (d > 0) === mejorAlto;
    return `<tr><td>${etq}</td><td class="r">${a[k]}${sufijo}</td><td class="r"><b style="${d === 0 ? '' : mejor ? 'color:#3f7a3e' : 'color:var(--terracota)'}">${s[k]}${sufijo}</b></td></tr>`;
  };
  return `<h2 class="viewtitle">Simulador</h2>
    <div class="mini">Cambia recursos y mira qué pasa con tu capacidad. Usa tus pedidos, vitrina y lotes reales, y no guarda nada hasta que tú lo decidas.</div>
    <div class="chips" style="margin-top:12px">
      <button class="chip ${x.ayudanteH === 4 ? 'on' : ''}" data-accion="simulador.rapido" data-que="ayudante">Ayudante 4 h al día</button>
      <button class="chip ${x.batidoras === 2 ? 'on' : ''}" data-accion="simulador.rapido" data-que="batidora">2.ª batidora</button>
      <button class="chip ${x.moldes === 10 && x.sesion === 10 ? 'on' : ''}" data-accion="simulador.rapido" data-que="sesion10">10 moldes y sesiones de 10</button>
      <button class="chip ${x.soletasCompradas ? 'on' : ''}" data-accion="simulador.rapido" data-que="soletas">Comprar las soletas</button>
      <button class="chip" data-accion="simulador.reiniciar">Volver a lo actual</button></div>
    <div class="tres">${num('sayudanteH', 'Ayudante h/día', x.ayudanteH, 0.5)}${num('sextraH', 'Tus horas extra', x.extraH, 0.5)}${num('sarmadoMin', 'Min por molde', x.armadoMin, 1, 5)}</div>
    <div class="tres">${num('smoldes', 'Moldes físicos', x.moldes, 1, 1)}${num('ssesion', 'Moldes por sesión', x.sesion, 1, 1)}${num('shornos', 'Hornos', x.hornos, 1, 1)}</div>
    <div class="smallnote">Ayudante: de lunes a sábado. Horas extra: se alarga tu tarde de lunes a viernes.</div>
    <div class="taskday"><h3>Actual contra escenario</h3>
      <table class="tabla"><tr><th></th><th class="r">Actual</th><th class="r">Escenario</th></tr>
      ${fila('Horas disponibles por semana', 'disponiblesH', true, ' h')}
      ${fila('Techo: moldes por semana', 'techo')}
      ${fila('Límite por horas', 'techoPorHoras')}
      ${fila('Límite por moldes y ventanas', 'techoPorMoldes')}
      <tr><td colspan="3" class="mini" style="padding-top:14px">Con tu demanda real de los próximos 7 días</td></tr>
      ${fila('Moldes que se logran armar', 'moldes')}
      ${fila('Horas de trabajo', 'horasPlan', false, ' h')}
      ${fila('De las cuales, lavado', 'lavadoH', false, ' h')}
      ${fila('De las cuales, horno', 'horneadoH', false, ' h')}
      ${fila('Pedidos que no caben', 'pedidosNoCaben', false)}
      ${fila('Moldes de vitrina que faltan', 'moldesCortos', false)}
      ${fila('Días llenos', 'diasLlenos', false)}</table></div>
    <div class="taskday"><h3>Lectura</h3>${r.frases.map(f => `<div class="difrow">${esc(f)}</div>`).join('')}</div>
    <div class="acciones"><button class="primary" ${cambio ? '' : 'disabled'} data-accion="simulador.aplicar">Ya lo tengo: usar este escenario como mi operación</button></div>
    <div class="mini">El simulador supone que el ayudante puede hacer cualquier tarea. No calcula sueldo ni el costo del equipo: compara horas y moldes.</div>`;
}

export const acciones = {
  rapido(app, d) {
    const x = estado(app);
    if (d.que === 'ayudante') x.ayudanteH = x.ayudanteH === 4 ? 0 : 4;
    if (d.que === 'batidora') x.batidoras = x.batidoras === 2 ? 1 : 2;
    if (d.que === 'sesion10') { const on = x.moldes === 10 && x.sesion === 10; x.moldes = on ? 5 : 10; x.sesion = on ? 5 : 10; }
    if (d.que === 'soletas') x.soletasCompradas = !x.soletasCompradas;
    app.render();
  },
  reiniciar: app => { app.ui.sim = null; app.render(); },
  aplicar(app) {
    app.modal(`<h3>Usar este escenario</h3><p>Se guardan como tu operación real los moldes, el tamaño de sesión, los minutos por molde, el ayudante, las horas extra, la batidora, el horno y la compra de soletas que tienes en el simulador.</p>
      <div class="alert soft"><div>El plan de producción y el "cabe / no cabe" van a usar estos valores desde ahora. Hazlo solo si ya es verdad: si todavía no compras los moldes o no llega el ayudante, la app te va a prometer capacidad que no tienes.</div></div>
      <div class="modal-actions"><button class="secondary" data-accion="app.cerrarModal">Cancelar</button><button class="primary" data-accion="simulador.confirmar">Sí, ya es mi operación</button></div>`);
  },
  async confirmar(app) {
    await app.base.guardar('config', aConfig(app.cfg(), estado(app)));
    app.ui.sim = null; app.cerrarModal(); app.render(); app.toast('Operación actualizada. Plan recalculado.');
  },
};
export const entradas = {
  campo(app, d, el) {
    const v = Number(el.value); if (!Number.isFinite(v) || el.value === '') return;
    const x = estado(app); x[d.campo] = d.campo === 'ayudanteH' || d.campo === 'extraH' ? Math.max(0, v) : Math.max(1, Math.round(v));
    app._renderPendiente = true; // se repinta al soltar el campo, para no perder el foco mientras escribes
  },
};
