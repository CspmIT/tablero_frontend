import { useState } from 'react';
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
import Deseos from './modules/Deseos.jsx';
import Configuracion from './modules/Configuracion.jsx';
import { MODULOS, INFO, CONFIGURACION } from './nav.js';
import VisitasTecnicas from './modules/VisitasTecnicas.jsx';
import MiMes from './modules/MiMes.jsx';

// Navegación: definida en src/nav.js (compartida con el panel de permisos).

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
  if (activo === 'deseos') return <Deseos />;
  if (activo === 'visitas') return <VisitasTecnicas />;
  if (activo === 'configuracion') return <Configuracion />;
  if (activo === 'importar') return <Importar />;
  if (activo === 'importar_grilla') return <ImportarGrilla />;
  return <p className="text-slate-400">Este módulo todavía no está migrado.</p>;
}

export default function App() {
  const [activo, setActivo] = useState('grilla'); // inicio: la grilla (pedido 15/07)
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
      <Layout modulos={MODULOS} infoGrupo={INFO} configuracion={CONFIGURACION} activo={activo} onSelect={setActivo} onLogout={cerrarSesion}>
        <Contenido activo={activo} />
      </Layout>
      <UpdateManager />
    </DataProvider>
  );
}
