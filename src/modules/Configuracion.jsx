// Configuración — panel de administración del tablero (solo manager).
// Pestañas: Permisos de vistas (qué ve cada usuario, sin tocar código) +
// los ajustes del sistema que antes vivían sueltos en Información adicional
// (Equipo, Importar datos, Importar grilla).
import { useEffect, useState, useCallback } from 'react';
import { Settings, ShieldCheck, Tags, CalendarClock } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import { SOLAPAS_GESTIONABLES, AJUSTES } from '../nav.js';
import Equipo from './Equipo.jsx';
import Importar from './Importar.jsx';
import ImportarGrilla from './ImportarGrilla.jsx';
import RevisionEtiquetas from './RevisionEtiquetas.jsx';
import GrillaTipica from './GrillaTipica.jsx';
import { Bell } from 'lucide-react';
import { pushEstado, activarNotificaciones } from '../utils/pushClient.js';

const PESTANIAS = [
  { id: 'permisos', label: 'Permisos de vistas', icon: ShieldCheck },
  ...AJUSTES,
  // Semana default + vacaciones por rango (19/08, pedido de los colaboradores).
  { id: 'grilla_tipica', label: 'Grilla Típica', icon: CalendarClock },
  // Ajuste sobre los datos de la propia app (antes vivía en Análisis/Reportes).
  { id: 'etiquetas', label: 'Revisión de Etiquetas', icon: Tags },
  { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
];

export default function Configuracion() {
  const { me } = useData();
  const esManager = me?.tipo === 'manager';
  // No-managers: Configuración existe solo para sus preferencias personales.
  const pestanias = esManager ? PESTANIAS : PESTANIAS.filter((t) => t.id === 'notificaciones');
  const [pest, setPest] = useState(esManager ? 'permisos' : 'notificaciones');
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2 mb-3">
        <Settings size={20} className="text-coop-naranja" /> Configuración
      </h2>
      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto">
        {pestanias.map((p) => (
          <button key={p.id} onClick={() => setPest(p.id)}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              pest === p.id ? 'border-coop-azul text-coop-azul font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {p.label}
          </button>
        ))}
      </div>
      {pest === 'permisos' && <PanelPermisos />}
      {pest === 'equipo' && <Equipo />}
      {pest === 'importar' && <Importar />}
      {pest === 'importar_grilla' && <ImportarGrilla />}
      {pest === 'grilla_tipica' && <GrillaTipica />}
      {pest === 'etiquetas' && <RevisionEtiquetas />}
      {pest === 'notificaciones' && <NotifPrefs />}
    </div>
  );
}

function PanelPermisos() {
  const { api, colaboradores, me } = useData();
  const [overrides, setOverrides] = useState(null); // { "<id>": {extra, ocultas} }
  const [guardando, setGuardando] = useState(null); // colaboradorId en guardado

  const cargar = useCallback(async () => {
    try { const r = await api.permisos.get(); setOverrides(r.overrides || {}); }
    catch { setOverrides({}); }
  }, [api]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!overrides) return <p className="text-sm text-slate-400">Cargando permisos…</p>;

  const activos = (colaboradores || []).filter((c) => c.activo !== false);

  const estadoDe = (colab, solapa) => {
    const o = overrides[String(colab.id)] || { extra: [], ocultas: [] };
    const porRol = !solapa.roles || solapa.roles.includes(colab.tipo);
    if (o.ocultas?.includes(solapa.id)) return 'oculta';
    if (porRol) return 'rol';
    if (o.extra?.includes(solapa.id)) return 'extra';
    return 'no';
  };

  const alternar = async (colab, solapa) => {
    const clave = String(colab.id);
    const o = { extra: [...(overrides[clave]?.extra || [])], ocultas: [...(overrides[clave]?.ocultas || [])] };
    const est = estadoDe(colab, solapa);
    // Ciclo intuitivo: lo visible se apaga, lo apagado se enciende.
    if (est === 'rol') o.ocultas.push(solapa.id);                       // visible por rol → ocultar
    else if (est === 'extra') o.extra = o.extra.filter((x) => x !== solapa.id); // otorgada → quitar
    else if (est === 'oculta') o.ocultas = o.ocultas.filter((x) => x !== solapa.id); // oculta → restaurar rol
    else o.extra.push(solapa.id);                                       // no visible → otorgar
    const nuevo = { ...overrides, [clave]: o };
    if (!o.extra.length && !o.ocultas.length) delete nuevo[clave];
    setOverrides(nuevo);
    setGuardando(colab.id);
    try { await api.permisos.set(colab.id, o.extra, o.ocultas); }
    catch { await cargar(); alert('No se pudo guardar el permiso'); }
    finally { setGuardando(null); }
  };

  return (
    <div>
      <p className="text-sm text-slate-500 mb-3">
        Qué ve cada usuario. <b>Tocá una celda para alternar</b>: azul = visible por su rol ·
        verde = otorgada acá · gris = no visible · rojo = ocultada. El permiso vale
        también en el servidor (Costos y Análisis), no solo la solapa.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm border-collapse min-w-full">
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 bg-white border-b border-slate-200">Colaborador</th>
              {SOLAPAS_GESTIONABLES.map((s) => (
                <th key={s.id} className="p-2 border-b border-slate-200 text-xs font-medium text-slate-500 whitespace-nowrap">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activos.map((c) => (
              <tr key={c.id} className={guardando === c.id ? 'opacity-60' : ''}>
                <td className="p-2 sticky left-0 bg-white border-b border-slate-100 whitespace-nowrap">
                  {c.nombre}{c.id === me?.colaboradorId ? ' (vos)' : ''}
                  <span className="text-xs text-slate-400 ml-1.5">{c.tipo}</span>
                </td>
                {SOLAPAS_GESTIONABLES.map((s) => {
                  const est = estadoDe(c, s);
                  const estilos = {
                    rol: 'bg-coop-azul/15 text-coop-azul',
                    extra: 'bg-emerald-100 text-emerald-700',
                    no: 'bg-slate-50 text-slate-300',
                    oculta: 'bg-red-100 text-red-600',
                  }[est];
                  const marca = { rol: '✓', extra: '✓+', no: '—', oculta: '✕' }[est];
                  return (
                    <td key={s.id} className="p-1 border-b border-slate-100 text-center">
                      <button onClick={() => alternar(c, s)} disabled={guardando === c.id}
                        title={{ rol: 'Visible por rol (tocar para ocultar)', extra: 'Otorgada (tocar para quitar)', no: 'No visible (tocar para otorgar)', oculta: 'Ocultada (tocar para restaurar)' }[est]}
                        className={`w-9 h-8 rounded-lg font-medium ${estilos} hover:ring-2 hover:ring-coop-azul/30`}>
                        {marca}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Los cambios impactan cuando el usuario recarga la aplicación. Configuración es siempre solo-manager.
      </p>
    </div>
  );
}


// --- Preferencias de notificación (30/07): qué le importa a CADA usuario ----
// El catálogo de tipos vive en el backend (TIPOS_NOTIFICACION): agregar un
// tipo allá lo hace aparecer acá solo, con su default.
function NotifPrefs() {
  const { api } = useData();
  const [tipos, setTipos] = useState([]);
  const [mias, setMias] = useState({});
  const [estadoDisp, setEstadoDisp] = useState(pushEstado());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.push.preferencias().then((r) => { setTipos(r.tipos || []); setMias(r.mias || {}); }).catch(() => {});
  }, [api]);

  const alternar = async (id) => {
    const nuevas = { ...mias, [id]: !mias[id] };
    setMias(nuevas); setGuardando(true);
    try { const r = await api.push.guardarPreferencias(nuevas); setMias(r.mias || nuevas); }
    catch { setMias(mias); alert('No se pudo guardar la preferencia'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <p className="font-medium text-slate-800 mb-1">Este dispositivo</p>
        {estadoDisp === 'granted' && <p className="text-sm text-emerald-600">✓ Notificaciones activadas en este dispositivo.</p>}
        {estadoDisp === 'denied' && <p className="text-sm text-red-500">Bloqueadas por el navegador: habilitalas desde la configuración del sitio (candado en la barra de dirección).</p>}
        {estadoDisp === 'no_soportado' && <p className="text-sm text-slate-500">Este entorno no soporta notificaciones push. Si estás en la <b>app de escritorio</b>, usá el Tablero desde Chrome/Edge (o instalalo como PWA desde el navegador) para recibirlas; en el celular, la app instalada es la mejor opción.</p>}
        {estadoDisp === 'default' && (
          <button onClick={() => activarNotificaciones(api).then(() => setEstadoDisp('granted')).catch((e) => { setEstadoDisp(pushEstado()); alert(e.message); })}
            className="text-sm px-3 py-1.5 rounded-lg bg-coop-azul text-white hover:opacity-90">🔔 Activar en este dispositivo</button>
        )}
        <p className="text-xs text-slate-400 mt-2">El permiso es por dispositivo (activalo en el celular y en la compu por separado). En Android conviene la app instalada.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="font-medium text-slate-800 mb-3">Qué querés que te notifique {guardando && <span className="text-xs text-slate-400">guardando…</span>}</p>
        <ul className="space-y-3">
          {tipos.map((t) => (
            <li key={t.id} className="flex items-start gap-3">
              <button onClick={() => alternar(t.id)} role="switch" aria-checked={!!mias[t.id]}
                className={`mt-0.5 w-10 h-6 rounded-full transition-colors shrink-0 ${mias[t.id] ? 'bg-coop-azul' : 'bg-slate-300'}`}>
                <span className={`block w-5 h-5 bg-white rounded-full shadow transform transition-transform ${mias[t.id] ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span>
                <span className="text-sm font-medium text-slate-700">{t.label}</span>
                <span className="block text-xs text-slate-400">{t.desc}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400 mt-3">Las preferencias aplican a todos tus dispositivos con notificaciones activadas.</p>
      </div>
    </div>
  );
}
