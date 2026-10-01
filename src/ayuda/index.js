// Índice de la Ayuda (28/09). Una página por ítem del menú; el contenido vive
// VERSIONADO acá (regla del método: la ola que toca un módulo actualiza su
// página de ayuda en el mismo zip — la ayuda nunca se desfasa de la app).
import dashboard from './dashboard.js';
import grilla from './grilla.js';
import crm from './crm.js';
import kanban from './kanban.js';
import objetivos from './objetivos.js';
import asistente from './asistente.js';
import deseos from './deseos.js';
import marketing from './marketing.js';
import operaciones from './operaciones.js';
import ingresos from './ingresos.js';
import costos from './costos.js';
import francos from './francos.js';
import feriados from './feriados.js';
import analisis from './analisis.js';
import metricas_ov from './metricas_ov.js';
import configuracion from './configuracion.js';

export const PAGINAS = [dashboard, grilla, crm, kanban, objetivos, asistente, deseos, marketing, operaciones, ingresos, costos, francos, feriados, analisis, metricas_ov, configuracion];
export const AYUDA_POR_ID = Object.fromEntries(PAGINAS.map((p) => [p.id, p]));

// Ids de nav/rutas que no tienen página propia → a qué página van.
const PAGINA_DE = {
  guardias: 'grilla', misemana: 'grilla', midia: 'grilla', mimes: 'grilla',
  visitas: 'operaciones', laboratorio: 'operaciones', organizaciones: 'operaciones',
  equipo: 'configuracion', importar: 'configuracion', importar_grilla: 'configuracion',
};
export const paginaDeActivo = (activo) => (AYUDA_POR_ID[activo] ? activo : PAGINA_DE[activo] || null);
