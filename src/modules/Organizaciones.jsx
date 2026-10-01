import { useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Power, Search, Users } from 'lucide-react';
import { cooptechAdmin } from '../api/cooptech.js';
import { useData } from '../data/DataContext.jsx'; // 28/09: cola «Pendientes de crear» (viene del CRM, vive en el backend propio)
import OrganizacionModal from './OrganizacionModal.jsx';
import UsuariosOrganizacion from './UsuariosOrganizacion.jsx';

// Administración de las organizaciones (cooperativas) de Cooptech.
//
// Viene del sitio cooptech.com.ar, que queda sólo como sitio institucional.
// A diferencia del resto del tablero, estos datos NO son del backend propio:
// salen de la API central de Cooptech (Laravel), con el token que quedó
// guardado al iniciar sesión. Por eso no pasa por DataContext.

const estadoActivo = (c) => Number(c.status) === 1;

// Nombre de los productos que la organización tiene activos.
const productosActivos = (c) =>
  (c.relation_products || [])
    .filter((p) => Number(p.status) === 1)
    .map((p) => p.product?.name)
    .filter(Boolean);

export default function Organizaciones() {
  const [clientes, setClientes] = useState(null); // null = cargando
  const [productos, setProductos] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(undefined); // undefined = cerrado, null = nueva
  const [cambiandoEstado, setCambiandoEstado] = useState(null);
  // Organización cuyos usuarios se están mirando. Antes esto exigía entrar con
  // el usuario administrador de esa cooperativa; ahora se entra desde acá.
  const [viendoUsuarios, setViendoUsuarios] = useState(null);
  // Conector CRM Ganado → acá (28/09): leads ganados con Reconecta/+Agua que
  // esperan su organización. NADA se crea solo: el alta la hace una persona.
  const { api } = useData();
  const [pendientes, setPendientes] = useState([]);
  const [inicial, setInicial] = useState(null); // precarga del modal al crear desde un pendiente
  const [descartandoPend, setDescartandoPend] = useState(null);
  const cargarPendientes = () => api.organizacionesPendientes.list().then((r) => setPendientes(r?.pendientes || [])).catch(() => {});

  const cargar = async () => {
    setError('');
    try {
      const [resClientes, resProductos] = await Promise.all([
        cooptechAdmin.clientes(),
        cooptechAdmin.productos(),
      ]);
      setClientes(resClientes.data || []);
      setProductos(resProductos.data || []);
    } catch (e) {
      setClientes([]);
      setError(e.message || 'No se pudieron traer las organizaciones de Cooptech.');
    }
  };

  useEffect(() => {
    cargar();
    cargarPendientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const lista = clientes || [];
    if (!texto) return lista;
    return lista.filter((c) =>
      [c.name, c.name_city, c.name_state]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texto))
    );
  }, [clientes, q]);

  const alternarEstado = async (cliente) => {
    const activa = estadoActivo(cliente);
    const texto = activa
      ? `¿Desactivar «${cliente.name}»? Sus usuarios dejan de poder entrar a los productos.`
      : `¿Reactivar «${cliente.name}»?`;
    if (!confirm(texto)) return;
    setCambiandoEstado(cliente.id);
    try {
      await cooptechAdmin.cambiarEstado(cliente.id, activa ? 0 : 1);
      await cargar();
    } catch (e) {
      setError(e.message || 'No se pudo cambiar el estado.');
    } finally {
      setCambiandoEstado(null);
    }
  };

  const guardado = async () => {
    setEditando(undefined);
    // 28/09: si el alta nació de un pendiente del CRM, marcarlo creado.
    if (inicial?.leadId) {
      api.organizacionesPendientes.actualizar(inicial.leadId, 'creada').then(cargarPendientes).catch(() => {});
      setInicial(null);
    }
    await cargar();
  };

  if (viendoUsuarios) {
    return (
      <UsuariosOrganizacion
        cliente={viendoUsuarios}
        productos={productos}
        onVolver={() => setViendoUsuarios(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Building2 size={20} className="text-coop-azul" />
          {/* 25/09: renombrada (pedido de Leonardo); el id de permisos sigue siendo 'organizaciones' */}
          Gestión de Organizaciones y Usuarios
        </h2>
        <span className="text-sm text-slate-400">
          {clientes === null ? '' : `${visibles.length} de ${clientes.length}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o localidad"
              className="border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56"
            />
          </div>
          <button
            onClick={() => setEditando(null)}
            className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white flex items-center gap-1.5"
          >
            <Plus size={15} /> Nueva
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* PENDIENTES DE CREAR (28/09): leads GANADOS del CRM con Reconecta/+Agua.
          El conector no crea nada solo: propone, y el alta la hace una persona
          con el formulario precargado. */}
      {pendientes.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm font-medium text-amber-800 mb-2">Pendientes de crear ({pendientes.length}) — leads ganados en el CRM que todavía no tienen organización</p>
          <div className="grid gap-2">
            {pendientes.map((pd) => (
              <div key={pd.leadId} className="bg-white border border-amber-100 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-coop-negro">{pd.organizacion}</span>
                {(pd.productos || []).map((pr) => <span key={pr} className="text-[10.5px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{pr}</span>)}
                <span className="text-xs text-slate-400">{[pd.ciudad, pd.contacto, pd.email || pd.telefono].filter(Boolean).join(' · ')}</span>
                <span className="text-[11px] text-slate-300 ml-auto">{pd.fecha ? new Date(pd.fecha).toLocaleDateString('es-AR') : ''}</span>
                <button onClick={() => { setInicial(pd); setEditando(null); }}
                  className="text-xs bg-coop-azul text-white rounded-lg px-2.5 py-1.5 hover:opacity-90">Crear organización</button>
                {descartandoPend === pd.leadId ? (
                  <span className="flex items-center gap-1 text-xs">
                    <button onClick={() => { api.organizacionesPendientes.actualizar(pd.leadId, 'descartada').then(cargarPendientes).catch(() => {}); setDescartandoPend(null); }}
                      className="px-2 py-1 rounded bg-red-600 text-white">Sí</button>
                    <button onClick={() => setDescartandoPend(null)} className="px-2 py-1 rounded border border-slate-300 text-slate-500">No</button>
                  </span>
                ) : (
                  <button onClick={() => setDescartandoPend(pd.leadId)} title="Quitar de pendientes (p. ej. la organización ya existe)"
                    className="text-xs text-slate-400 hover:text-red-500 px-1.5 py-1.5">Descartar</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {clientes === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 760 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Organización</th>
                <th className="px-3 py-2 font-semibold">Localidad</th>
                <th className="px-3 py-2 font-semibold">Productos activos</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Sin organizaciones{q ? ` para «${q.trim()}»` : ''}.
                  </td>
                </tr>
              )}
              {visibles.map((c) => {
                const activos = productosActivos(c);
                const activa = estadoActivo(c);
                return (
                  <tr key={c.id} className={`group hover:bg-slate-50/60 ${activa ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">{c.name}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {c.name_city || <span className="text-slate-300">—</span>}
                      {c.name_state && <div className="text-[11px] text-slate-400">{c.name_state}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {activos.map((nombre) => (
                          <span key={nombre} className="text-[10px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul">
                            {nombre}
                          </span>
                        ))}
                        {activos.length === 0 && <span className="text-slate-300">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${activa ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <span className="flex items-center gap-1 justify-end">
                        <button onClick={() => setViendoUsuarios(c)} title="Usuarios de esta organización"
                          className="p-2 rounded-lg text-slate-500 hover:text-coop-azul hover:bg-coop-azul/10">
                          <Users size={20} />
                        </button>
                        <button onClick={() => setEditando(c)} title="Editar"
                          className="p-2 rounded-lg text-slate-500 hover:text-coop-azul hover:bg-coop-azul/10">
                          <Pencil size={20} />
                        </button>
                        <button
                          onClick={() => alternarEstado(c)}
                          disabled={cambiandoEstado === c.id}
                          title={activa ? 'Desactivar' : 'Reactivar'}
                          className={`p-2 rounded-lg text-slate-500 disabled:opacity-40 ${activa ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-emerald-600 hover:bg-emerald-50'}`}
                        >
                          <Power size={20} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando !== undefined && (
        <OrganizacionModal
          cliente={editando}
          productos={productos}
          inicial={editando === null ? inicial : null}
          onClose={() => { setEditando(undefined); setInicial(null); }}
          onSaved={guardado}
        />
      )}
    </div>
  );
}
