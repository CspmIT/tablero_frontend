import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cooptechAdmin, OFIVIR_URL, sincronizarConOficinaVirtual } from '../api/cooptech.js';
import { PERFILES_PRODUCTO } from './UsuariosOrganizacion.jsx';

// Alta, vinculación y edición de un usuario dentro de una organización.
//
// Tres modos, que en la API son tres endpoints distintos:
//   nuevo      -> POST  /register              (crea la persona y la vincula)
//   vincular   -> POST  /addUserExistToClient  (ya tiene cuenta en Cooptech)
//   editar     -> PATCH /updateUser
//
// Si el usuario queda con acceso a Oficina Virtual, además hay que darlo de alta
// del lado de la OV (relationUserCooptech), que mantiene su propia tabla de
// usuarios por esquema de cliente.

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
const GEOREF = 'https://apis.datos.gob.ar/georef/api';
const PERFIL_OPERADOR = 4; // users.profile de un usuario común de una cooperativa
const oNulo = (v) => (v === '' || v === undefined ? null : v);

function Campo({ label, obligatorio, children, ayuda }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">
        {label} {obligatorio && <span className="text-red-500">*</span>}
      </label>
      {children}
      {ayuda && <p className="text-[11px] text-slate-400 mt-0.5">{ayuda}</p>}
    </div>
  );
}

export default function UsuarioOrganizacionModal({
  cliente, usuario, modoVincular, productos, contratados, onClose, onSaved,
}) {
  const editando = !!usuario;
  const [datos, setDatos] = useState({
    first_name: '', last_name: '', type_sex: '',
    id_state: '', id_cities: '', address: '', email: '',
  });
  const [password, setPassword] = useState('');
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('');
  // En modo vincular: usuario encontrado por email.
  const [encontrado, setEncontrado] = useState(null);
  const [emailBusqueda, setEmailBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  // { [idProducto]: perfil }
  const [accesos, setAccesos] = useState({});
  const [provincias, setProvincias] = useState([]);
  const [localidades, setLocalidades] = useState([]);
  const [cargando, setCargando] = useState(editando);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const set = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

  // Productos que la organización tiene contratados y activos: son los únicos
  // a los que se le puede dar acceso a alguien.
  const disponibles = productos
    .map((p) => {
      const contrato = contratados.find((c) => Number(c.id_product) === Number(p.id));
      return contrato && Number(contrato.status) === 1
        ? { ...p, schema_name: contrato.schema_name, id_client_product: contrato.id }
        : null;
    })
    .filter(Boolean);

  const oficinaVirtual = disponibles.find((p) => p.name === 'Oficina Virtual');

  // --- Carga inicial --------------------------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${GEOREF}/provincias?orden=nombre`);
        const json = await res.json();
        setProvincias(json.provincias || []);
      } catch {
        setProvincias([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!datos.id_state) {
      setLocalidades([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${GEOREF}/localidades?provincia=${datos.id_state}&campos=id,nombre&orden=nombre&max=5000`);
        const json = await res.json();
        setLocalidades(json.localidades || []);
      } catch {
        setLocalidades([]);
      }
    })();
  }, [datos.id_state]);

  useEffect(() => {
    if (!editando) {
      setAccesos(Object.fromEntries(disponibles.map((p) => [p.id, 0])));
      return;
    }
    (async () => {
      try {
        const [resUsuario, resAccesos] = await Promise.all([
          cooptechAdmin.usuario(usuario.id),
          cooptechAdmin.productosDeUsuario(usuario.id, cliente.id),
        ]);
        const u = resUsuario.data;
        setDatos({
          first_name: u.first_name || '', last_name: u.last_name || '',
          type_sex: u.type_sex ?? '', id_state: u.id_state ?? '', id_cities: u.id_cities ?? '',
          address: u.address || '', email: u.email || '',
        });
        const porProducto = Object.fromEntries((resAccesos.data || []).map((p) => [p.id_product, Number(p.profile) || 0]));
        setAccesos(Object.fromEntries(disponibles.map((p) => [p.id, porProducto[p.id] ?? 0])));
        // La API sólo actualiza las relaciones que ya existen: si el producto se
        // contrató después de darle el alta a esta persona, no hay fila que tocar.
        const sinRelacion = disponibles.filter((p) => porProducto[p.id] === undefined);
        if (sinRelacion.length) {
          setAviso(
            `No se le puede dar acceso desde acá a ${sinRelacion.map((p) => p.name).join(', ')}: ` +
            'la API sólo modifica accesos que ya existen, y este usuario se dio de alta antes de que ' +
            'la organización contratara ese producto. Hay que volver a vincularlo o corregirlo en la base.'
          );
        }
      } catch (e) {
        setError(e.message || 'No se pudo cargar el usuario.');
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id]);

  // --- Buscar un usuario que ya existe en Cooptech --------------------------

  const buscar = async () => {
    setError('');
    setBuscando(true);
    try {
      const res = await cooptechAdmin.buscarUsuarioPorEmail(emailBusqueda.trim(), cliente.id);
      const u = res.data;
      setEncontrado(u);
      setDatos((d) => ({ ...d, first_name: u.first_name || '', last_name: u.last_name || '', email: u.email || '' }));
      setAccesos(Object.fromEntries(disponibles.map((p) => [p.id, 0])));
    } catch (e) {
      // La API contesta con el motivo: no existe, el perfil no lo permite, o ya
      // pertenece a esta organización.
      setError(e.message || 'No se encontró el usuario.');
      setEncontrado(null);
    } finally {
      setBuscando(false);
    }
  };

  // --- Guardado -------------------------------------------------------------

  const validar = () => {
    if (modoVincular && !encontrado) return 'Primero hay que buscar el usuario por su email.';
    if (!modoVincular) {
      if (!datos.first_name.trim()) return 'Falta el nombre.';
      if (!datos.last_name.trim()) return 'Falta el apellido.';
      if (!datos.email.trim()) return 'Falta el email.';
      if (!editando) {
        if (password.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.';
        if (password !== passwordConfirmacion) return 'Las dos contraseñas no coinciden.';
      }
    }
    // Un producto sin esquema configurado no puede recibir usuarios.
    const sinEsquema = disponibles.filter((p) => Number(accesos[p.id]) > 0 && !p.schema_name);
    if (sinEsquema.length) {
      return `Falta configurar la base de datos (schema_name) de: ${sinEsquema.map((p) => p.name).join(', ')}.`;
    }
    if (Number(accesos[oficinaVirtual?.id]) > 0 && !OFIVIR_URL) {
      return 'No se puede dar acceso a Oficina Virtual: falta configurar VITE_OFIVIR_URL para poder darlo de alta allá.';
    }
    return '';
  };

  // Se mandan TODOS los productos del catálogo, no sólo los contratados: la API
  // crea una relación por cada uno y son esas filas las que después se pueden
  // editar. Si acá se mandaran sólo los contratados, contratar un producto nuevo
  // dejaría a los usuarios viejos sin fila que modificar.
  const armarAccesos = () =>
    productos.map((p) => {
      const contrato = contratados.find((c) => Number(c.id_product) === Number(p.id));
      const activo = contrato && Number(contrato.status) === 1;
      return {
        id_product: p.id,
        status: activo ? 1 : 0,
        profile: activo ? Number(accesos[p.id]) || 0 : 0,
      };
    });

  const datosPersonales = () => {
    const provincia = provincias.find((p) => String(p.id) === String(datos.id_state));
    const localidad = localidades.find((l) => String(l.id) === String(datos.id_cities));
    return {
      first_name: datos.first_name.trim(),
      last_name: datos.last_name.trim(),
      // El DNI ya no se pide. En la edición tampoco se manda, y la API deja el
      // que ya tenía: `dni` toma el valor guardado cuando la clave no viene.
      type_sex: datos.type_sex === '' ? null : Number(datos.type_sex),
      id_state: datos.id_state ? parseInt(datos.id_state, 10) : null,
      id_cities: datos.id_cities ? parseInt(datos.id_cities, 10) : null,
      name_state: provincia?.nombre ?? null,
      name_city: localidad?.nombre ?? null,
      address: oNulo(datos.address.trim()),
      email: datos.email.trim(),
    };
  };

  const guardar = async () => {
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setError('');
    setGuardando(true);

    const userProduct = armarAccesos();
    try {
      let respuesta;
      if (modoVincular) {
        respuesta = await cooptechAdmin.vincularUsuario({
          id_user: encontrado.id,
          id_client: cliente.id,
          status: 1,
          userProduct,
        });
      } else if (editando) {
        respuesta = await cooptechAdmin.actualizarUsuario({
          id: usuario.id,
          id_client: cliente.id,
          ...datosPersonales(),
          userProduct,
        });
      } else {
        respuesta = await cooptechAdmin.crearUsuario({
          ...datosPersonales(),
          password,
          password_confirmation: passwordConfirmacion,
          profile: PERFIL_OPERADOR,
          status: 1,
          id_client: cliente.id,
          userProduct,
        });
      }

      // Alta en Oficina Virtual, si quedó con acceso.
      const perfilOv = oficinaVirtual ? Number(accesos[oficinaVirtual.id]) || 0 : 0;
      if (perfilOv > 0) {
        const guardado = respuesta?.data || {};
        await sincronizarConOficinaVirtual({
          name: guardado.first_name ?? datos.first_name.trim(),
          last_name: guardado.last_name ?? datos.last_name.trim(),
          dni: guardado.dni ?? null,
          email: guardado.email ?? datos.email.trim(),
          type_sex: guardado.type_sex ?? (datos.type_sex === '' ? null : Number(datos.type_sex)),
          profile: perfilOv,
          token: guardado.token_apps,
          schema_name: oficinaVirtual.schema_name,
        });
      }
      onSaved();
    } catch (e) {
      const msg = e.message === 'The email has already been taken.'
        ? 'Ese email ya está registrado en Cooptech. Usá «Vincular existente» para darle acceso a esta organización.'
        : e.message;
      setError(msg || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  // --- Vista ----------------------------------------------------------------

  const titulo = modoVincular
    ? `Vincular un usuario a ${cliente.name}`
    : editando
      ? `Editar ${usuario.first_name} ${usuario.last_name}`
      : `Nuevo usuario en ${cliente.name}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">{titulo}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {cargando ? (
          <p className="px-5 py-8 text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
            {aviso && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">{aviso}</div>}

            {modoVincular ? (
              <section>
                <p className="text-sm text-slate-600 mb-2">
                  Buscá a la persona por el email con el que ya entra a Cooptech. Se le da acceso a esta
                  organización sin crear una cuenta nueva.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailBusqueda}
                    onChange={(e) => setEmailBusqueda(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && buscar()}
                    placeholder="email@cooperativa.coop"
                    className={inputCls}
                  />
                  <button
                    onClick={buscar}
                    disabled={buscando || !emailBusqueda.trim()}
                    className="px-3 py-2 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Search size={15} /> Buscar
                  </button>
                </div>
                {encontrado && (
                  <div className="mt-3 border border-slate-200 rounded-xl px-3 py-2 text-sm">
                    <p className="font-medium text-slate-800">{encontrado.first_name} {encontrado.last_name}</p>
                    <p className="text-slate-500 text-xs">{encontrado.email}</p>
                  </div>
                )}
              </section>
            ) : (
              <>
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Campo label="Nombre" obligatorio>
                    <input value={datos.first_name} onChange={set('first_name')} className={inputCls} />
                  </Campo>
                  <Campo label="Apellido" obligatorio>
                    <input value={datos.last_name} onChange={set('last_name')} className={inputCls} />
                  </Campo>
                  <Campo label="Email" obligatorio ayuda={editando ? 'Es el usuario con el que entra.' : 'Se le manda el correo de activación de la cuenta.'}>
                    <input type="email" value={datos.email} onChange={set('email')} className={inputCls} />
                  </Campo>
                  <Campo label="Sexo">
                    <select value={datos.type_sex} onChange={set('type_sex')} className={inputCls}>
                      <option value="">—</option>
                      <option value="1">Femenino</option>
                      <option value="2">Masculino</option>
                    </select>
                  </Campo>
                  <Campo label="Domicilio">
                    <input value={datos.address} onChange={set('address')} className={inputCls} />
                  </Campo>
                  <Campo label="Provincia">
                    <select
                      value={datos.id_state}
                      onChange={(e) => setDatos((d) => ({ ...d, id_state: e.target.value, id_cities: '' }))}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {provincias.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Localidad">
                    <select value={datos.id_cities} onChange={set('id_cities')} className={inputCls} disabled={!localidades.length}>
                      <option value="">—</option>
                      {localidades.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                    </select>
                  </Campo>
                </section>

                {!editando && (
                  <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Campo label="Contraseña" obligatorio ayuda="Mínimo 8 caracteres.">
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
                    </Campo>
                    <Campo label="Repetir contraseña" obligatorio>
                      <input type="password" value={passwordConfirmacion} onChange={(e) => setPasswordConfirmacion(e.target.value)} className={inputCls} />
                    </Campo>
                  </section>
                )}
              </>
            )}

            <section>
              <p className="text-sm font-medium text-slate-700 mb-2">Accesos a los productos</p>
              {disponibles.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {cliente.name} no tiene ningún producto activo, así que no hay accesos para asignar.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {disponibles.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm text-slate-700">
                        {p.name}
                        {!p.schema_name && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">sin base configurada</span>
                        )}
                      </span>
                      <select
                        value={accesos[p.id] ?? 0}
                        onChange={(e) => setAccesos((a) => ({ ...a, [p.id]: Number(e.target.value) }))}
                        className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-40"
                      >
                        {PERFILES_PRODUCTO.map((perfil) => (
                          <option key={perfil.valor} value={perfil.valor}>{perfil.texto}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
          <button
            onClick={guardar}
            disabled={guardando || cargando}
            className="px-4 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
