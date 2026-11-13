// KUMAI OS · Más: Recetario y Ajustes (para dejar la barra en 7 pestañas)
export function render(app) {
  const cfg = app.cfg();
  return `<h2 class="viewtitle">Más</h2>
    <div class="recrow" data-accion="app.ir" data-vista="recetario"><div class="crece"><b>Recetario</b><span>Sabores, insumos, bases e importador del .md · v${cfg.recetarioVersion || '—'}</span></div><div class="der"><span class="num">›</span></div></div>
    <div class="recrow" data-accion="app.ir" data-vista="simulador"><div class="crece"><b>Simulador</b><span>¿Y si tengo ayudante, más moldes u otra batidora? Compara tu capacidad sin tocar tus datos</span></div><div class="der"><span class="num">›</span></div></div>
    <div class="recrow" data-accion="app.ir" data-vista="ajustes"><div class="crece"><b>Ajustes</b><span>Sincronización, mostrador, precios, costeo, respaldo y datos de prueba</span></div><div class="der"><span class="num">›</span></div></div>
    <div class="mini" style="margin-top:14px">KUMAI OS ${app.version}</div>`;
}
export const acciones = {};
