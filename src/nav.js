// Navegación del tablero — definiciones compartidas (App + panel de permisos).
// `roles`: si está, sólo esos tipos ven el ítem por defecto; si falta, todos.
// El panel de Configuración puede otorgar (extra) u ocultar (ocultas) solapas
// por usuario, por encima de estos defaults.
import { Gauge, CalendarDays, CalendarCheck, CalendarMinus, Shield, SquareKanban, Handshake, Target, TrendingUp, Users, Wallet, Upload, FileSpreadsheet, FileText, Sparkles, BarChart3, Inbox, Settings, Wrench, Megaphone, FlaskConical } from 'lucide-react';

// 28/08 (Leonardo: «que el menú no se vuelva inmanejable»): Guardias DEJA el
// menú lateral y pasa a ser una pestaña del selector de la Grilla (entre
// Grilla y Mi semana — es parte del día a día del área). El id NO cambia:
// sigue en SOLAPAS_GESTIONABLES para que el panel de permisos pueda seguir
// otorgando/ocultando Guardias por persona como siempre.
export const GUARDIAS_TAB = { id: 'guardias', label: 'Guardias', icon: Shield, listo: true };

export const MODULOS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, listo: true, roles: ['manager', 'gerencial'] },
  { id: 'grilla', label: 'Grilla', icon: CalendarDays, listo: true },
  { id: 'crm', label: 'CRM', icon: Handshake, listo: true },
  { id: 'kanban', label: 'Kanban', icon: SquareKanban, listo: true },
  { id: 'objetivos', label: 'Objetivos', icon: Target, listo: true },
  { id: 'asistente', label: 'Asistente IA', icon: Sparkles, listo: true },
  // 20/08: "Mis deseos" se amplía a "Inbox" (solapas Tickets + Mis deseos).
  // El id NO cambia (permisos por id intactos — lección 07/08); solo label e icono.
  { id: 'deseos', label: 'Inbox', icon: Inbox, listo: true },
  // Marketing (20/08): repositorio + planificación del material de los
  // tercerizados (Booster). Ola 1 solo interna; cuando Booster tenga usuarios,
  // se les otorga por el panel de permisos (extra por id).
  { id: 'marketing', label: 'Marketing', icon: Megaphone, listo: true, roles: ['manager', 'gerencial', 'collaborator'] },
  { id: 'visitas', label: 'Campo', icon: Wrench, listo: true, roles: ['manager', 'gerencial', 'collaborator', 'tercerizado'] },
  // Laboratorio (28/08): funciones IoT migradas desde la Oficina Virtual
  // (servidores InfluxDB/MQTT + borrado de datos). Equipo interno.
  { id: 'laboratorio', label: 'Laboratorio', icon: FlaskConical, listo: true, roles: ['manager', 'gerencial', 'collaborator'] },
];

// Agrupados bajo "Análisis" (ex "Información adicional", renombrado 07/08).
// OJO: los ids NO se tocan (los permisos extra/ocultas se guardan por id);
// solo cambian labels y orden. "Ingresos" se suma acá en la ola 3.
export const INFO = [
  { id: 'ingresos', label: 'Ingresos', icon: TrendingUp, listo: true, roles: ['manager', 'gerencial'] },
  { id: 'costos', label: 'Costos op.', icon: Wallet, listo: true, roles: ['manager'] },
  { id: 'francos', label: 'Francos', icon: CalendarMinus, listo: true },
  { id: 'feriados', label: 'Fechas especiales', icon: CalendarCheck, listo: true, roles: ['manager'] },
  { id: 'analisis', label: 'Reportes', icon: FileText, listo: true, roles: ['manager', 'gerencial', 'externo'] },
  // Métricas OV (18/08, pedido de Gerencia de Operaciones): tickets de
  // Oficina Virtual clasificados por tipo × causa. Manager + gerencial.
  // 19/08: los colaboradores internos del área ven y clasifican por default
  // (el backend acompaña; externos/tercerizados siguen afuera).
  { id: 'metricas-ov', label: 'Métricas Oficina Virtual', icon: BarChart3, listo: true, roles: ['manager', 'gerencial', 'collaborator'] },
];

// Configuración (engranaje): panel de permisos + ajustes del sistema.
// Visible para todos: los no-managers solo ven adentro la pestaña
// "Notificaciones" (sus preferencias personales); el resto sigue solo-manager.
export const CONFIGURACION = { id: 'configuracion', label: 'Configuración', icon: Settings, listo: true, roles: null };

// Ajustes que viven DENTRO de Configuración (antes en Información adicional).
export const AJUSTES = [
  { id: 'equipo', label: 'Equipo', icon: Users },
  { id: 'importar', label: 'Importar datos', icon: Upload },
  { id: 'importar_grilla', label: 'Importar grilla', icon: FileSpreadsheet },
];

// Todas las solapas gestionables desde el panel de permisos (id + label + roles
// default). Configuración no se gestiona: siempre solo manager.
// GUARDIAS_TAB va incluida: aunque ya no es ítem del menú, su visibilidad
// como pestaña de la Grilla se sigue gestionando por el mismo id de siempre.
export const SOLAPAS_GESTIONABLES = [...MODULOS, GUARDIAS_TAB, ...INFO];

// Visibilidad efectiva: rol default + extra − ocultas (overrides del panel).
export function puedeVerSolapa(item, me) {
  const solapas = me?.solapas || { extra: [], ocultas: [] };
  if (solapas.ocultas?.includes(item.id)) return false;
  if (!item.roles || item.roles.includes(me?.tipo)) return true;
  return !!solapas.extra?.includes(item.id);
}
