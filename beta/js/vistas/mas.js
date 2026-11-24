// KUMAI OS · Más: Insumos, Dinero, Recetario, Simulador y Ajustes (la barra queda en 5 pestañas)
const fila = (vista, titulo, desc) => `<div class="recrow" data-accion="app.ir" data-vista="${vista}"><div class="crece"><b>${titulo}</b><span>${desc}</span></div><div class="der"><span class="num">›</span></div></div>`;
export function render(app) {
  const cfg = app.cfg();
  return `<h2 class="viewtitle">Más</h2>
    <div class="taskday"><h3>Operación</h3>
    ${fila('inventario', 'Insumos', 'Existencias, compras y lista de compras de los próximos días')}
    ${fila('dinero', 'Dinero', 'Cobrado, gastos, por cobrar y registro fiscal')}</div>
    <div class="taskday"><h3>Configuración</h3>
    ${fila('recetario', 'Recetario', `Sabores, otras líneas, insumos, bases e importador del .md · v${cfg.recetarioVersion || '—'}`)}
    ${fila('simulador', 'Simulador', '¿Y si tengo ayudante, más moldes u otra batidora? Compara tu capacidad sin tocar tus datos')}
    ${fila('ajustes', 'Ajustes', 'Tema, sincronización, mostrador, precios, costeo, respaldo y datos de prueba')}</div>
    <div class="mini" style="margin-top:14px">KUMAI OS ${app.version}</div>`;
}
export const acciones = {};
