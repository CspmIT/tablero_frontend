// Navegación del tablero — definiciones compartidas (App + panel de permisos).
// `roles`: si está, sólo esos tipos ven el ítem por defecto; si falta, todos.
// El panel de Configuración puede otorgar (extra) u ocultar (ocultas) solapas
// por usuario, por encima de estos defaults.
import { Gauge, CalendarDays, CalendarCheck, CalendarMinus, Shield, SquareKanban, Handshake, Target, Users, Wallet, Upload, FileSpreadsheet, Sparkles, BarChart3, Lightbulb, Settings } from 'lucide-react';
import IconoTecnico from './components/IconoTecnico.jsx';

export const MODULOS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, listo: true, roles: ['manager', 'gerencial'] },
  { id: 'grilla', label: 'Grilla', icon: CalendarDays, listo: true },
  { id: 'guardias', label: 'Guardias', icon: Shield, listo: true },
  { id: 'crm', label: 'CRM', icon: Handshake, listo: true },
  { id: 'kanban', label: 'Kanban', icon: SquareKanban, listo: true },
  { id: 'objetivos', label: 'Objetivos', icon: Target, listo: true },
  { id: 'asistente', label: 'Asistente IA', icon: Sparkles, listo: true },
  { id: 'deseos', label: 'Mis deseos', icon: Lightbulb, listo: true },
  { id: 'visitas', label: 'Visitas técnicas', icon: IconoTecnico, listo: true, roles: ['manager', 'gerencial', 'collaborator', 'tercerizado'] },
];

// Agrupados bajo "Información adicional".
export const INFO = [
  { id: 'analisis', label: 'Análisis', icon: BarChart3, listo: true, roles: ['manager', 'gerencial', 'externo'] },
  { id: 'costos', label: 'Costos op.', icon: Wallet, listo: true, roles: ['manager'] },
  { id: 'francos', label: 'Francos', icon: CalendarMinus, listo: true },
  { id: 'feriados', label: 'Fechas especiales', icon: CalendarCheck, listo: true, roles: ['manager'] },
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
export const SOLAPAS_GESTIONABLES = [...MODULOS, ...INFO];

// Visibilidad efectiva: rol default + extra − ocultas (overrides del panel).
export function puedeVerSolapa(item, me) {
  const solapas = me?.solapas || { extra: [], ocultas: [] };
  if (solapas.ocultas?.includes(item.id)) return false;
  if (!item.roles || item.roles.includes(me?.tipo)) return true;
  return !!solapas.extra?.includes(item.id);
}
