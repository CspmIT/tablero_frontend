import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cooptechAdmin } from '../api/cooptech.js';

// Alta y edición de una organización de Cooptech.
//
// El formulario pide sólo lo que se usa: nombre, domicilio, el usuario
// administrador y qué productos tiene contratados. Los campos que traía el sitio
// viejo y nadie completaba (CUIL, código postal, número de cuenta por producto,
// fechas de aprobación y puesta en marcha, y los contactos) se sacaron el 16/09,
// y el número de cliente después, porque el dato cargado no era confiable.
//
// Lo que se sacó de la pantalla NO se borra de la base: esas claves simplemente
// no viajan en el payload, y la API sólo escribe lo que recibe. Una organización
// que hoy tenga CUIL o contactos los conserva.

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
const GEOREF = 'https://apis.datos.gob.ar/georef/api';
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

export default function OrganizacionModal({ cliente, productos, onClose, onSaved }) {
  const esNueva = !cliente;
  const [datos, setDatos] = useState({ name: '', address: '', id_state: '', id_cities: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [idUsuarioAdmin, setIdUsuarioAdmin] = useState(null);
  // Por producto del catálogo: { activo, id } (id = fila de client_products si ya existe).
  const [contratos, setContratos] = useState({});

  const [provincias, setProvincias] = useState([]);
  const [localidades, setLocalidades] = useState([]);
  const [cargando, setCargando] = useState(!esNueva);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }));

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
    if (esNueva) {
      setContratos(Object.fromEntries(productos.map((p) => [p.id, { activo: false, id: 0 }])));
      return;
    }
    (async () => {
      try {
        const res = await cooptechAdmin.cliente(cliente.id);
        const c = (res.data || [])[0];
        if (!c) throw new Error('La organización ya no existe.');
        setDatos({
          name: c.name || '', address: c.address || '',
          id_state: c.id_state ?? '', id_cities: c.id_cities ?? '',
        });
        setEmail(c.email || '');
        setIdUsuarioAdmin(c.id_user ?? null);
        // Se cruza por id_product, no por posición: una organización puede no
        // tener fila para todos los productos del catálogo.
        const relaciones = c.relation_products || [];
        setContratos(
          Object.fromEntries(
            productos.map((p) => {
              const fila = relaciones.find((r) => Number(r.id_product) === Number(p.id));
              return [p.id, { activo: Number(fila?.status) === 1, id: fila?.id ?? 0, number_account: fila?.number_account }];
            })
          )
        );
      } catch (e) {
        setError(e.message || 'No se pudo cargar la organización.');
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente?.id, productos]);

  const setContrato = (idProducto, valor) =>
    setContratos((c) => ({ ...c, [idProducto]: { ...c[idProducto], activo: valor } }));

  // --- Guardado -------------------------------------------------------------

  const validar = () => {
    if (!datos.name.trim()) return 'Falta el nombre de la organización.';
    if (!email.trim()) return 'Falta el email del usuario administrador.';
    if (esNueva) {
      if (password.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.';
    } else if (!idUsuarioAdmin) {
      return 'Esta organización no tiene usuario administrador, y la API exige uno para poder editarla. Hay que crearlo antes desde el ABM de usuarios.';
    }
    return '';
  };

  // La API exige `number_account` en cada producto y es NOT NULL en la base.
  // Ya no se pide en la pantalla, así que se manda 0 en los nuevos y se respeta
  // el que ya tenga la fila, para no pisar datos viejos.
  //
  // En el alta van todos los productos del catálogo (la API exige al menos uno y
  // así queda la grilla completa). En la edición van sólo los que ya tienen fila
  // más los que se acaban de activar: mandar todos le creaba filas en estado 0
  // por cada producto que esa organización nunca había contratado.
  const armarProductos = () =>
    productos
      .filter((p) => esNueva || contratos[p.id]?.id || contratos[p.id]?.activo)
      .map((p) => {
        const c = contratos[p.id] || {};
        const fila = {
          id_client: esNueva ? null : cliente.id,
          status: c.activo ? 1 : 0,
          id_product: p.id,
          number_account: parseInt(c.number_account, 10) || 0,
        };
        // En la edición la API exige `id` en cada elemento; 0 significa "todavía
        // no existe esta fila" y la crea.
        if (!esNueva) fila.id = c.id || 0;
        return fila;
      });

  const guardar = async () => {
    const problema = validar();
    if (problema) {
      setError(problema);
      return;
    }
    setError('');
    setGuardando(true);

    const provincia = provincias.find((p) => String(p.id) === String(datos.id_state));
    const localidad = localidades.find((l) => String(l.id) === String(datos.id_cities));
    const comunes = {
      name: datos.name.trim(),
      address: oNulo(datos.address.trim()),
      id_state: datos.id_state ? parseInt(datos.id_state, 10) : null,
      id_cities: datos.id_cities ? parseInt(datos.id_cities, 10) : null,
      name_state: provincia?.nombre ?? null,
      name_city: localidad?.nombre ?? null,
      clientProducts: armarProductos(),
    };

    try {
      if (esNueva) {
        // La API valida el email y la contraseña con `confirmed`, así que espera
        // el campo repetido. Se manda el mismo valor en vez de pedirlo dos veces.
        await cooptechAdmin.crearCliente({
          ...comunes,
          email: email.trim(),
          email_confirmation: email.trim(),
          password,
          password_confirmation: password,
          status: 1,
        });
      } else {
        await cooptechAdmin.actualizarCliente({ ...comunes, id: cliente.id, id_user: idUsuarioAdmin, email: email.trim() });
      }
      onSaved();
    } catch (e) {
      const msg = e.message === 'The email has already been taken.' ? 'Ese email ya está registrado en Cooptech.' : e.message;
      setError(msg || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  // --- Vista ----------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">
            {esNueva ? 'Nueva organización' : `Editar ${cliente.name}`}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        {cargando ? (
          <p className="px-5 py-8 text-sm text-slate-400">Cargando…</p>
        ) : (
          <div className="px-5 py-4 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Nombre" obligatorio>
                <input value={datos.name} onChange={set('name')} className={inputCls} />
              </Campo>
              <Campo label="Dirección">
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

            <section>
              <p className="text-sm font-medium text-slate-700 mb-2">Usuario administrador</p>
              {!esNueva && !idUsuarioAdmin && (
                <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  Esta organización no tiene un usuario administrador (perfil 3) asociado. La API de Cooptech
                  exige uno para poder editarla, así que hay que crearlo antes desde el ABM de usuarios.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Email" obligatorio ayuda={esNueva ? 'Se le envía el correo de activación de la cuenta.' : 'Cambiarlo cambia el email de acceso del administrador.'}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </Campo>
                {esNueva && (
                  <Campo label="Contraseña" obligatorio ayuda="Mínimo 8 caracteres.">
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
                  </Campo>
                )}
              </div>
            </section>

            <section>
              <p className="text-sm font-medium text-slate-700 mb-2">Productos contratados</p>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {productos.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!contratos[p.id]?.activo}
                      onChange={(e) => setContrato(p.id, e.target.checked)}
                      className="accent-coop-azul"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                La base de datos de cada producto (schema_name) y su conexión de InfluxDB no se configuran acá:
                las usan las aplicaciones de cada producto y se cargan por separado.
              </p>
            </section>
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">
            Cancelar
          </button>
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
