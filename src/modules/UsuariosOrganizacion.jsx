import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Link2, MailCheck, Pencil, Plus, Power, Search } from 'lucide-react';
import { cooptechAdmin } from '../api/cooptech.js';
import UsuarioOrganizacionModal from './UsuarioOrganizacionModal.jsx';

// Usuarios de una organización de Cooptech.
//
// Antes esto sólo se podía hacer entrando con el usuario administrador de cada
// cooperativa. La restricción era del frontend viejo, que tomaba el cliente de
// la sesión: la API siempre recibió el id_client por parámetro. Acá el cliente
// es el que se está mirando, así que el administrador de Cooptech da de alta
// usuarios en cualquier organización sin cambiar de sesión.

const PERFILES_PRODUCTO = [
  { valor: 0, texto: 'Sin permiso' },
  { valor: 1, texto: 'Moderador' },
  { valor: 2, texto: 'Lector' },
  { valor: 3, texto: 'Operario' },
];

export const perfilProductoTexto = (v) =>
  PERFILES_PRODUCTO.find((p) => p.valor === Number(v))?.texto || `Perfil ${v}`;

export { PERFILES_PRODUCTO };

export default function UsuariosOrganizacion({ cliente, productos, onVolver }) {
  const [usuarios, setUsuarios] = useState(null);
  // Productos que esta organización tiene contratados, con su schema_name.
  const [contratados, setContratados] = useState([]);
  // { [idUsuario]: [{ id_product, profile, name }] } — se carga por usuario.
  const [perfiles, setPerfiles] = useState({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(undefined); // undefined = cerrado, null = nuevo
  const [vinculando, setVinculando] = useState(false);
  const [cambiando, setCambiando] = useState(null);

  const cargar = async () => {
    setError('');
    try {
      const [resUsuarios, resProductos] = await Promise.all([
        cooptechAdmin.usuarios(cliente.id),
        cooptechAdmin.productosDeCliente(cliente.id),
      ]);
      const lista = resUsuarios.data || [];
      setContratados(resProductos.data || []);
      setUsuarios(
        [...lista].sort((a, b) => {
          if (Number(a.status) !== Number(b.status)) return Number(b.status) - Number(a.status);
          return (a.first_name || '').localeCompare(b.first_name || '');
        })
      );
      // Los perfiles por producto vienen de a un usuario por vez; se piden todos
      // juntos para poder mostrarlos en la tabla.
      const detalle = await Promise.all(
        lista.map((u) =>
          cooptechAdmin
            .productosDeUsuario(u.id, cliente.id)
            .then((r) => [u.id, r.data || []])
            .catch(() => [u.id, []])
        )
      );
      setPerfiles(Object.fromEntries(detalle));
    } catch (e) {
      setUsuarios([]);
      setError(e.message || 'No se pudieron traer los usuarios.');
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const lista = usuarios || [];
    if (!texto) return lista;
    return lista.filter((u) =>
      [u.first_name, u.last_name, u.email, u.dni]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(texto))
    );
  }, [usuarios, q]);

  const alternarEstado = async (usuario) => {
    const activo = Number(usuario.status) === 1;
    if (!confirm(activo ? `¿Dar de baja a ${usuario.first_name} ${usuario.last_name}?` : `¿Reactivar a ${usuario.first_name}?`)) return;
    setCambiando(usuario.id);
    try {
      await cooptechAdmin.actualizarUsuario({ id: usuario.id, status: activo ? 0 : 1 });
      await cargar();
    } catch (e) {
      setError(e.message || 'No se pudo cambiar el estado.');
    } finally {
      setCambiando(null);
    }
  };

  // Activar la cuenta a mano. Hace falta seguido: la persona no recibió el
  // correo de alta o ya no tiene acceso a esa casilla, y sin activar no puede
  // entrar a ningún producto.
  const validarCuenta = async (usuario) => {
    const texto = `¿Dar por activada la cuenta de ${usuario.first_name} ${usuario.last_name} (${usuario.email})?\n\n`
      + 'Es lo mismo que si hubiera hecho clic en el link del correo de alta. '
      + 'La contraseña no cambia: sigue siendo la que se le puso al crearlo.';
    if (!confirm(texto)) return;
    setCambiando(usuario.id);
    try {
      await cooptechAdmin.validarCuenta(usuario.id);
      await cargar();
    } catch (e) {
      setError(e.message || 'No se pudo activar la cuenta.');
    } finally {
      setCambiando(null);
    }
  };

  const guardado = async () => {
    setEditando(undefined);
    setVinculando(false);
    await cargar();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={onVolver} className="text-slate-400 hover:text-coop-azul" title="Volver a organizaciones">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-slate-800">
          Usuarios de <span className="text-coop-azul">{cliente.name}</span>
        </h2>
        <span className="text-sm text-slate-400">
          {usuarios === null ? '' : `${visibles.length} de ${usuarios.length}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, email o DNI"
              className="border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56"
            />
          </div>
          <button
            onClick={() => setVinculando(true)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 flex items-center gap-1.5"
            title="Dar acceso a alguien que ya tiene cuenta en Cooptech"
          >
            <Link2 size={15} /> Vincular existente
          </button>
          <button onClick={() => setEditando(null)} className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white flex items-center gap-1.5">
            <Plus size={15} /> Nuevo
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {usuarios === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 820 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Nombre</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">DNI</th>
                <th className="px-3 py-2 font-semibold">Accesos</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    Sin usuarios{q ? ` para «${q.trim()}»` : ''}.
                  </td>
                </tr>
              )}
              {visibles.map((u) => {
                const activo = Number(u.status) === 1;
                const accesos = (perfiles[u.id] || []).filter((p) => Number(p.profile) > 0);
                return (
                  <tr key={u.id} className={`group hover:bg-slate-50/60 ${activo ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {u.first_name} {u.last_name}
                      {Number(u.profile) === 3 && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Admin</span>
                      )}
                      {Number(u.account_validate) === 0 && (
                        <div className="text-[11px] font-normal text-amber-600">Cuenta sin activar</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600 break-all">{u.email}</td>
                    <td className="px-3 py-2 text-slate-600">{u.dni || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1">
                        {accesos.map((p) => (
                          <span key={p.id_product} className="text-[10px] px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul"
                            title={perfilProductoTexto(p.profile)}>
                            {p.name}
                          </span>
                        ))}
                        {accesos.length === 0 && <span className="text-slate-300">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${activo ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                        {activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <span className="flex items-center gap-1 justify-end">
                        {Number(u.account_validate) === 0 && (
                          <button onClick={() => validarCuenta(u)} disabled={cambiando === u.id}
                            title="Activar la cuenta sin esperar el correo"
                            className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-40">
                            <MailCheck size={20} />
                          </button>
                        )}
                        <button onClick={() => setEditando(u)} title="Editar"
                          className="p-2 rounded-lg text-slate-500 hover:text-coop-azul hover:bg-coop-azul/10">
                          <Pencil size={20} />
                        </button>
                        <button
                          onClick={() => alternarEstado(u)}
                          disabled={cambiando === u.id}
                          title={activo ? 'Dar de baja' : 'Reactivar'}
                          className={`p-2 rounded-lg text-slate-500 disabled:opacity-40 ${activo ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-emerald-600 hover:bg-emerald-50'}`}
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

      {(editando !== undefined || vinculando) && (
        <UsuarioOrganizacionModal
          cliente={cliente}
          usuario={vinculando ? undefined : editando}
          modoVincular={vinculando}
          productos={productos}
          contratados={contratados}
          onClose={() => { setEditando(undefined); setVinculando(false); }}
          onSaved={guardado}
        />
      )}
    </div>
  );
}
