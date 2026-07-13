import { useState } from 'react';
import { Gauge, CalendarDays, CalendarCheck, CalendarMinus, LayoutGrid, Shield, SquareKanban, Handshake, Target, Users, Wallet, Upload, FileSpreadsheet, Sparkles, BarChart3 } from 'lucide-react';
import { DataProvider, useData } from './data/DataContext.jsx';
import { isAuthenticated, logout } from './api/auth.js';
import LoginFlow from './modules/Login/LoginFlow.jsx';
import Layout from './components/Layout.jsx';
import UpdateManager from './components/UpdateManager.jsx';
import Equipo from './modules/Equipo.jsx';
import Grilla from './modules/Grilla.jsx';
import MiSemana from './modules/MiSemana.jsx';
import Guardias from './modules/Guardias.jsx';
import Francos from './modules/Francos.jsx';
import FechasEspeciales from './modules/FechasEspeciales.jsx';
import Kanban from './modules/Kanban.jsx';
import CRM from './modules/CRM.jsx';
import Objetivos from './modules/Objetivos.jsx';
import Costos from './modules/Costos.jsx';
import Dashboard from './modules/Dashboard.jsx';
import Importar from './modules/Importar.jsx';
import ImportarGrilla from './modules/ImportarGrilla.jsx';
import Asistente from './modules/Asistente.jsx';
import Analisis from './modules/Analisis.jsx';
import MiMes from './modules/MiMes.jsx';

// Navegación principal.
// `roles`: si está, sólo esos tipos de colaborador ven el ítem; si falta, lo ven todos.
const MODULOS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, listo: true, roles: ['manager', 'gerencial'] },
  { id: 'grilla', label: 'Grilla', icon: CalendarDays, listo: true },
  { id: 'guardias', label: 'Guardias', icon: Shield, listo: true },
  { id: 'crm', label: 'CRM', icon: Handshake, listo: true },
  { id: 'kanban', label: 'Kanban', icon: SquareKanban, listo: true },
  { id: 'objetivos', label: 'Objetivos', icon: Target, listo: true },
  { id: 'asistente', label: 'Asistente IA', icon: Sparkles, listo: true },
  { id: 'analisis', label: 'Análisis', icon: BarChart3, listo: true, roles: ['manager', 'gerencial', 'externo'] },
];

// Agrupados bajo "Información adicional" (igual que el standalone).
// El grupo es sólo para manager, salvo Francos que lo ve todo el mundo.
const INFO = [
  { id: 'equipo', label: 'Equipo', icon: Users, listo: true, roles: ['manager'] },
  { id: 'costos', label: 'Costos op.', icon: Wallet, listo: true, roles: ['manager'] },
  { id: 'francos', label: 'Francos', icon: CalendarMinus, listo: true },
  { id: 'feriados', label: 'Fechas especiales', icon: CalendarCheck, listo: true, roles: ['manager'] },
  { id: 'importar', label: 'Importar datos', icon: Upload, listo: true, roles: ['manager'] },
  { id: 'importar_grilla', label: 'Importar grilla', icon: FileSpreadsheet, listo: true, roles: ['manager'] },
];

function Contenido({ activo }) {
  const { cargando, error } = useData();
  const [subVista, setSubVista] = useState('grilla');
  if (cargando) return <p className="text-slate-500">Cargando…</p>;
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      No se pudo conectar con el backend: {error}
      <p className="text-red-500 text-xs mt-1">Verificá que el backend esté corriendo y la dirección en el archivo .env.</p>
    </div>
  );
  if (activo === 'equipo') return <Equipo />;
  if (activo === 'grilla') {
    if (subVista === 'mimes') return <MiMes vista={subVista} setVista={setSubVista} />;
    return subVista === 'misemana'
      ? <MiSemana vista={subVista} setVista={setSubVista} />
      : <Grilla vista={subVista} setVista={setSubVista} />;
  }
  if (activo === 'guardias') return <Guardias />;
  if (activo === 'francos') return <Francos />;
  if (activo === 'feriados') return <FechasEspeciales />;
  if (activo === 'kanban') return <Kanban />;
  if (activo === 'crm') return <CRM />;
  if (activo === 'objetivos') return <Objetivos />;
  if (activo === 'costos') return <Costos />;
  if (activo === 'dashboard') return <Dashboard />;
  if (activo === 'asistente') return <Asistente />;
  if (activo === 'analisis') return <Analisis />;
  if (activo === 'importar') return <Importar />;
  if (activo === 'importar_grilla') return <ImportarGrilla />;
  return <p className="text-slate-400">Este módulo todavía no está migrado.</p>;
}

export default function App() {
  const [activo, setActivo] = useState('kanban');
  const [autenticado, setAutenticado] = useState(isAuthenticated());

  if (!autenticado) {
    return <LoginFlow onLogged={() => setAutenticado(true)} />;
  }

  const cerrarSesion = () => {
    logout();
    setAutenticado(false);
  };

  return (
    <DataProvider>
      <Layout modulos={MODULOS} infoGrupo={INFO} activo={activo} onSelect={setActivo} onLogout={cerrarSesion}>
        <Contenido activo={activo} />
      </Layout>
      <UpdateManager />
    </DataProvider>
  );
}
