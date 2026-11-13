// KUMAI OS · modelo de datos (14 entidades de la especificación v1.2, sección 4)
import { uid, ymd, sumarDias, soloDigitos } from './util.js';

export const VERSION_APP = '4.0-F4';

/** Una hoja de Google por entidad. El orden no importa; los nombres sí (son los de las hojas). */
export const ENTIDADES = [
  'recetas', 'productos', 'insumos', 'movimientos', 'lotes', 'clientes', 'pedidos',
  'eventos', 'cortes', 'tareas', 'recursos', 'gastos', 'config', 'bitacora',
];

export const CANALES = ['WhatsApp', 'Mostrador', 'Rappi', 'Evento'];
export const ESTATUS = ['pendiente', 'preparando', 'refrigerando', 'decorado', 'entregado', 'cancelado'];
export const ESTATUS_ETIQUETA = {
  pendiente: 'Pendiente', preparando: 'Preparando', refrigerando: 'Refrigerando',
  decorado: 'Decorado', entregado: 'Entregado', cancelado: 'Cancelado',
};
export const PRESENTACIONES = {
  rebanada: { etiqueta: 'Rebanada', plural: 'rebanadas', rebanadas: 1 },
  molde: { etiqueta: 'Molde completo', plural: 'moldes completos', rebanadas: 5 },
  rappi: { etiqueta: 'Porción Rappi', plural: 'porciones Rappi', rebanadas: 1 },
};

/** Sello de los registros que vienen de la semilla: cualquier edición real es más reciente. */
export const SELLO_SEMILLA = 1;

/** Campos de control de la sección 3: id, createdAt, updatedAt, deviceId, deleted. */
export function sellar(datos, deviceId, previo = null, ahora = Date.now()) {
  const base = previo ? previo.updatedAt || 0 : 0;
  return {
    ...datos,
    id: datos.id || (previo && previo.id) || uid(),
    createdAt: (previo && previo.createdAt) || datos.createdAt || ahora,
    updatedAt: Math.max(ahora, base + 1), // siempre avanza, aunque el reloj del equipo vaya atrasado
    deviceId,
    deleted: !!datos.deleted,
  };
}

// ---------- folios: IND-A0007 / EVT-B0002 (la letra es del dispositivo) ----------
export function siguienteFolio(pedidos, tipo, letra, contadorLocal = 0) {
  const re = new RegExp(`^${tipo}-${letra}(\\d+)$`);
  let max = contadorLocal;
  for (const p of pedidos) { const m = re.exec(p.folio || ''); if (m) max = Math.max(max, Number(m[1])); }
  const n = max + 1;
  return { folio: `${tipo}-${letra}${String(n).padStart(4, '0')}`, contador: n };
}
/** Primera letra libre para un dispositivo nuevo. */
export function letraLibre(dispositivos = {}, deviceId) {
  if (dispositivos[deviceId]) return dispositivos[deviceId].letra;
  const usadas = new Set(Object.values(dispositivos).map(d => d.letra));
  for (const l of 'ABCDEFGHJKLMNPQRSTUVWXYZ') if (!usadas.has(l)) return l;
  return 'Z';
}

// ---------- pedidos ----------
export function totalLineas(p) { return (p.lineas || []).reduce((s, l) => s + l.cantidad * l.precioUnit, 0); }
export function totalPedido(p) { return totalLineas(p) + (Number(p.envio) || 0) - (Number(p.descuento) || 0); }
export function pagado(p) { return (p.pagos || []).reduce((s, x) => s + (Number(x.monto) || 0), 0); }
export function saldo(p) { return totalPedido(p) - pagado(p); }
export function estadoPago(p) {
  const s = saldo(p), pg = pagado(p);
  if (totalPedido(p) > 0 && s <= 0) return 'pagado';
  return pg > 0 ? 'parcial' : 'pendiente';
}
/** Rebanadas equivalentes de un pedido (molde completo = 5). */
export function rebanadasPedido(p, porMolde = 5) {
  return (p.lineas || []).reduce((s, l) => s + l.cantidad * (l.presentacion === 'molde' ? porMolde : 1), 0);
}
export function moldesPedido(p, porMolde = 5) { return rebanadasPedido(p, porMolde) / porMolde; }
export function pedidoActivo(p) { return !p.deleted && p.estatus !== 'cancelado'; }
export function pedidoAbierto(p) { return pedidoActivo(p) && p.estatus !== 'entregado'; }

export function textoLinea(l, recetasPorId) {
  const r = recetasPorId.get(l.recetaId);
  const pres = PRESENTACIONES[l.presentacion] || PRESENTACIONES.rebanada;
  const unidad = l.cantidad === 1 ? pres.etiqueta.toLowerCase() : pres.plural;
  return `${l.cantidad} ${unidad} de ${r ? r.nombre : 'sabor eliminado'}`;
}

// ---------- clientes ----------
export function normalizarTelefono(t) {
  let d = soloDigitos(t);
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  return d;
}
/** Primera y última compra, número de pedidos y gasto, calculados desde los pedidos. */
export function resumenCliente(clienteId, pedidos) {
  const suyos = pedidos.filter(p => p.clienteId === clienteId && pedidoActivo(p));
  const fechas = suyos.map(p => p.fechaEntrega).sort();
  return {
    pedidos: suyos.length, primeraCompra: fechas[0] || null, ultimaCompra: fechas[fechas.length - 1] || null,
    gastado: suyos.reduce((s, p) => s + totalPedido(p), 0),
  };
}

// ---------- inventario ----------
/** Existencia de un insumo = suma de sus movimientos (compra y ajuste suman; consumo y merma restan). */
export function existencia(insumoId, movimientos) {
  let t = 0;
  for (const m of movimientos) {
    if (m.deleted || m.insumoId !== insumoId) continue;
    t += (m.tipo === 'consumo' || m.tipo === 'merma') ? -Math.abs(m.cantidad) : m.cantidad;
  }
  return Math.round(t * 1000) / 1000;
}

// ---------- pedidos de prueba realistas (10 y 35 moldes por semana) ----------
// Reparto que imita la semana real: WhatsApp entre semana, Rappi sábado y domingo,
// Andador el domingo y, en la semana de 35, un pedido de evento. Determinista: no usa azar.
export function pedidosDePrueba(moldes, lunes, ctx) {
  const { recetas, productos } = ctx;
  const oper = recetas.filter(r => r.tipo === 'sabor' && r.menu === 'operativo' && !r.deleted);
  const prod = (recetaId, pres) => productos.find(p => p.recetaId === recetaId && p.presentacion === pres);
  const precio = (recetaId, pres, canal) => { const p = prod(recetaId, pres); return p ? (p.precios[canal] ?? Object.values(p.precios)[0]) : 0; };
  const meta = moldes * 5;
  const nombres = ['Mariana López', 'Karla Esparza', 'Daniel Ruiz', 'Paola Medina', 'Jorge Macías', 'Fernanda Reyes', 'Luis Romo',
    'Andrea Díaz de León', 'Sofía Padilla', 'Ricardo Luévano', 'Valeria Muñoz', 'Héctor Serna', 'Ximena Guzmán', 'Brenda Ávila'];
  const clientes = [], pedidos = [];
  let reb = 0, k = 0;
  const cliente = (nombre, canal) => {
    let c = clientes.find(x => x.nombre === nombre);
    if (!c) { c = { id: 'prueba-cli-' + clientes.length, nombre, telefono: '44910000' + String(10 + clientes.length), canalOrigen: canal, notas: '', prueba: true }; clientes.push(c); }
    return c;
  };
  const agregar = (dia, hora, canal, lineasDef, extra = {}) => {
    const lineas = [];
    for (const [idx, pres, cant] of lineasDef) {
      const cabe = pres === 'molde' ? Math.floor((meta - reb) / 5) : meta - reb;
      const n = Math.min(cant, cabe);
      if (n <= 0) continue;
      const r = oper[idx % oper.length];
      lineas.push({ recetaId: r.id, presentacion: pres, cantidad: n, precioUnit: precio(r.id, pres, canal) });
      reb += n * (pres === 'molde' ? 5 : 1);
    }
    if (!lineas.length) return;
    const c = canal === 'Rappi' ? cliente('Rappi', 'Rappi') : canal === 'Mostrador' ? cliente('Mostrador Andador', 'Mostrador') : cliente(nombres[k++ % nombres.length], canal);
    const p = {
      id: 'prueba-ped-' + pedidos.length, tipo: extra.tipo || 'IND', folio: `${extra.tipo || 'IND'}-P${String(pedidos.length + 1).padStart(4, '0')}`,
      clienteId: c.id, clienteNombre: c.nombre, canal, fechaEntrega: sumarDias(lunes, dia), horaEntrega: hora,
      lineas, envio: extra.envio || 0, descuento: 0, pagos: [], estatus: 'pendiente', notas: extra.notas || 'Pedido de prueba', prueba: true,
    };
    const total = totalPedido(p);
    if (extra.anticipo) p.pagos.push({ fecha: lunes, monto: Math.round(total * extra.anticipo), metodo: 'transferencia' });
    pedidos.push(p);
  };
  // Ronda base (≈10 moldes): se repite con otros sabores hasta llegar a la meta.
  for (let ronda = 0; reb < meta && ronda < 12; ronda++) {
    const s = ronda * 3;
    if (ronda === 1) agregar(5, '11:00', 'Evento', [[0, 'molde', 4], [3, 'molde', 2], [6, 'molde', 2]], { tipo: 'EVT', anticipo: 0.5, notas: 'Pedido de prueba · mesa de postres, 8 moldes' });
    agregar(2, '17:00', 'WhatsApp', [[s, 'rebanada', 2], [s + 1, 'rebanada', 2]], { envio: 40, anticipo: 0.5 });
    agregar(3, '18:00', 'WhatsApp', [[s + 2, 'molde', 1]], { anticipo: 0.5 });
    agregar(4, '17:30', 'WhatsApp', [[s + 3, 'rebanada', 3]], { envio: 55 });
    agregar(5, '13:00', 'Rappi', [[s, 'rappi', 3], [s + 4, 'rappi', 2]]);
    agregar(5, '16:00', 'WhatsApp', [[s + 5, 'molde', 1], [s + 6, 'rebanada', 2]], { envio: 40, anticipo: 1 });
    agregar(6, '10:00', 'Mostrador', [[s, 'rebanada', 6], [s + 2, 'rebanada', 5], [s + 4, 'rebanada', 5], [s + 7, 'rebanada', 4]], { notas: 'Pedido de prueba · Andador Raíces Hidrocálidas' });
    agregar(6, '14:00', 'Rappi', [[s + 1, 'rappi', 3], [s + 5, 'rappi', 3]]);
  }
  return { clientes, pedidos, rebanadas: reb, moldes: reb / 5 };
}

export function lunesDe(fecha = ymd()) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return sumarDias(fecha, -((dt.getDay() + 6) % 7));
}
