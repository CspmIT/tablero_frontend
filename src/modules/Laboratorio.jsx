// Laboratorio (28/08, pedido de Leonardo): funciones IoT migradas desde la
// Oficina Virtual — administración de servidores InfluxDB / MQTT y borrado de
// datos en InfluxDB. ESTA OLA: solo la parte visual + guardado de datos; la
// ejecución real de la delete query la conecta el equipo (proceso que lee las
// solicitudes 'pendiente' de LabBorrado y reporta por PATCH).
// Diseño congelado: claude/Laboratorio_y_Guardias_diseno_28_08.md
// Decisiones 28/08: interno (manager+gerencial+collaborator); MQTT = mismo ABM
// sin buckets; contraseñas visibles con 👁; borrados como cola con historial.
import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fmtFH = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const ESTADO_CHIP = {
  pendiente: 'bg-amber-100 text-amber-700',
  ejecutado: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
};

const SOLAPAS = [
  { id: 'influx', label: 'InfluxDB' },
  { id: 'mqtt', label: 'Servidores MQTT' },
];

export default function Laboratorio() {
  const { api } = useData();
  const [solapa, setSolapa] = useState('influx');
  const [servidores, setServidores] = useState(null); // null = cargando
  const [borrados, setBorrados] = useState([]);
  const [modal, setModal] = useState(null); // { tipo, servidor|null }
  const [error, setError] = useState('');

  const cargarServidores = () => api.laboratorio.servidores().then((r) => setServidores(r.servidores || [])).catch(() => setServidores([]));
  const cargarBorrados = () => api.laboratorio.borrados().then((r) => setBorrados(r.borrados || [])).catch(() => {});
  useEffect(() => { cargarServidores(); cargarBorrados(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const influx = useMemo(() => (servidores || []).filter((s) => s.tipo === 'influx'), [servidores]);
  const mqtt = useMemo(() => (servidores || []).filter((s) => s.tipo === 'mqtt'), [servidores]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="text-xl font-semibold text-coop-negro flex items-center gap-2">
          <FlaskConical size={20} className="text-coop-naranja" /> Laboratorio
        </h2>
        <div className="flex gap-1.5 flex-wrap">
          {SOLAPAS.map((s) => (
            <button key={s.id} onClick={() => setSolapa(s.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm ${solapa === s.id ? 'bg-coop-azul text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-coop-azul hover:text-coop-azul'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {servidores === null ? <p className="text-sm text-slate-400">Cargando…</p> : (
        <>
          <TablaServidores
            titulo={solapa === 'influx' ? 'Administración de InfluxDB' : 'Administración de servidores MQTT'}
            tipo={solapa}
            servidores={solapa === 'influx' ? influx : mqtt}
            onNuevo={() => setModal({ tipo: solapa, servidor: null })}
            onEditar={(s) => setModal({ tipo: solapa, servidor: s })}
            onBorrar={async (s) => {
              try { await api.laboratorio.borrarServidor(s.id); setError(''); cargarServidores(); }
              catch (e) { setError(e.message || 'No se pudo eliminar el servidor'); }
            }}
          />

          {solapa === 'influx' && (
            <BorradoInflux
              mqtt={mqtt}
              influx={influx}
              borrados={borrados}
              onError={setError}
              recargar={cargarBorrados}
            />
          )}
        </>
      )}

      {modal && (
        <ServidorModal
          tipo={modal.tipo}
          servidor={modal.servidor}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); cargarServidores(); }}
        />
      )}
    </div>
  );
}

// ---- ABM de servidores ------------------------------------------------------
function TablaServidores({ titulo, tipo, servidores, onNuevo, onEditar, onBorrar }) {
  const [q, setQ] = useState('');
  const [reveladas, setReveladas] = useState(() => new Set()); // ids con 👁 abierta
  const [borrando, setBorrando] = useState(null);

  const visibles = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return servidores;
    return servidores.filter((s) => [s.nombre, s.url, s.usuario, ...(Array.isArray(s.buckets) ? s.buckets : [])].some((x) => norm(x).includes(n)));
  }, [servidores, q]);

  const toggleOjo = (id) => setReveladas((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="font-semibold text-coop-negro">{titulo}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-56" />
        <div className="flex-1" />
        <button onClick={onNuevo}
          className="bg-emerald-600 text-white text-sm font-medium px-3 py-2 rounded-lg hover:opacity-90 flex items-center gap-1.5">
          <Plus size={15} /> Agregar
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: 760 }}>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
              <th className="px-3 py-2 font-semibold">Nombre</th>
              <th className="px-3 py-2 font-semibold">URL</th>
              <th className="px-3 py-2 font-semibold">Usuario</th>
              <th className="px-3 py-2 font-semibold">Contraseña</th>
              <th className="px-3 py-2 font-semibold">Puerto</th>
              {tipo === 'influx' && <th className="px-3 py-2 font-semibold">Buckets</th>}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={tipo === 'influx' ? 7 : 6} className="px-3 py-6 text-center text-slate-400">
                {servidores.length === 0 ? 'Sin servidores cargados todavía — agregá el primero con el botón verde.' : 'Nada coincide con la búsqueda.'}
              </td></tr>
            )}
            {visibles.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60 align-top">
                <td className="px-3 py-2 font-medium text-slate-700">{s.nombre}</td>
                <td className="px-3 py-2 text-slate-600 break-all">{s.url}</td>
                <td className="px-3 py-2 text-slate-600">{s.usuario || '—'}</td>
                <td className="px-3 py-2 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={reveladas.has(s.id) ? '' : 'tracking-widest'}>
                      {s.contrasena ? (reveladas.has(s.id) ? s.contrasena : '••••••••') : '—'}
                    </span>
                    {s.contrasena && (
                      <button onClick={() => toggleOjo(s.id)} title={reveladas.has(s.id) ? 'Ocultar' : 'Mostrar'}
                        className="text-slate-400 hover:text-coop-azul">
                        {reveladas.has(s.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{s.puerto ?? '—'}</td>
                {tipo === 'influx' && (
                  <td className="px-3 py-2 text-slate-600">
                    {Array.isArray(s.buckets) && s.buckets.length
                      ? s.buckets.map((b) => <div key={b} className="font-medium text-slate-700">{b}</div>)
                      : '—'}
                  </td>
                )}
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {borrando === s.id ? (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="text-red-600">¿Eliminar?</span>
                      <button onClick={() => { setBorrando(null); onBorrar(s); }} className="px-2 py-1 rounded bg-red-600 text-white">Sí</button>
                      <button onClick={() => setBorrando(null)} className="px-2 py-1 rounded border border-slate-300 text-slate-500">No</button>
                    </span>
                  ) : (
                    <>
                      <button onClick={() => onEditar(s)} title="Editar" className="text-slate-400 hover:text-coop-azul p-1"><Pencil size={15} /></button>
                      <button onClick={() => setBorrando(s.id)} title="Eliminar" className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={15} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Modal de alta/edición. Backdrop con onMouseDown + chequeo de origen (patrón
// obligatorio 27/08: el click tras una selección arrastrada NO debe cerrar).
function ServidorModal({ tipo, servidor, onClose, onGuardado }) {
  const { api } = useData();
  const [f, setF] = useState(() => ({
    nombre: servidor?.nombre || '',
    url: servidor?.url || '',
    usuario: servidor?.usuario || '',
    contrasena: servidor?.contrasena || '',
    puerto: servidor?.puerto ?? '',
    buckets: Array.isArray(servidor?.buckets) ? servidor.buckets.join('\n') : '',
  }));
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    if (!f.nombre.trim() || !f.url.trim()) { setError('Nombre y URL son obligatorios.'); return; }
    setGuardando(true);
    try {
      const body = { tipo, nombre: f.nombre, url: f.url, usuario: f.usuario, contrasena: f.contrasena, puerto: f.puerto, buckets: f.buckets };
      if (servidor) await api.laboratorio.editarServidor(servidor.id, body);
      else await api.laboratorio.crearServidor(body);
      onGuardado();
    } catch (e) { setError(e.message || 'No se pudo guardar'); setGuardando(false); }
  };

  const campo = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5">
        <p className="font-semibold text-coop-negro mb-3">
          {servidor ? 'Editar servidor' : 'Nuevo servidor'} · {tipo === 'influx' ? 'InfluxDB' : 'MQTT'}
        </p>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label className="text-xs text-slate-500 sm:col-span-2">Nombre *
            <input value={f.nombre} onChange={set('nombre')} className={campo} />
          </label>
          <label className="text-xs text-slate-500 sm:col-span-2">URL / host *
            <input value={f.url} onChange={set('url')} placeholder="200.63.120.50 ó https://…" className={campo} />
          </label>
          <label className="text-xs text-slate-500">Usuario
            <input value={f.usuario} onChange={set('usuario')} className={campo} />
          </label>
          <label className="text-xs text-slate-500">Contraseña
            <span className="flex items-center gap-1.5">
              <input value={f.contrasena} onChange={set('contrasena')} type={verClave ? 'text' : 'password'} className={campo} />
              <button onClick={() => setVerClave((v) => !v)} className="text-slate-400 hover:text-coop-azul" title={verClave ? 'Ocultar' : 'Mostrar'}>
                {verClave ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {servidor && <span className="text-[11px] text-slate-400">Dejar vacío conserva la actual.</span>}
          </label>
          <label className="text-xs text-slate-500">Puerto
            <input value={f.puerto} onChange={set('puerto')} type="number" min="1" className={campo} />
          </label>
          {tipo === 'influx' && (
            <label className="text-xs text-slate-500 sm:col-span-2">Buckets (uno por línea)
              <textarea value={f.buckets} onChange={set('buckets')} rows={3} className={campo} />
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-500">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !f.nombre.trim() || !f.url.trim()}
            className="px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white disabled:opacity-40">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Borrado de datos en InfluxDB (cola con historial) ----------------------
const FORM_BORRADO = { desde: '', hasta: '', servidorMqttId: '', bucketRef: '', topico: '' };

function BorradoInflux({ mqtt, influx, borrados, onError, recargar }) {
  const { api } = useData();
  const [f, setF] = useState({ ...FORM_BORRADO });
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => { setConfirmando(false); setF((x) => ({ ...x, [k]: e.target.value })); };

  // bucketRef = "<servidorInfluxId>|<bucket>" (el bucket pertenece a un influx).
  const opcionesBucket = influx.flatMap((s) => (Array.isArray(s.buckets) ? s.buckets : []).map((b) => ({ ref: `${s.id}|${b}`, bucket: b, servidor: s })));
  const completo = f.desde && f.hasta && f.servidorMqttId && f.bucketRef && f.topico.trim();
  const rangoValido = completo && new Date(f.hasta) > new Date(f.desde);

  const solicitar = async () => {
    if (!rangoValido) { onError('Revisá el rango: la fecha de fin debe ser posterior a la de inicio.'); return; }
    const [servidorInfluxId, bucket] = f.bucketRef.split('|');
    setEnviando(true);
    try {
      await api.laboratorio.crearBorrado({
        desde: new Date(f.desde).toISOString(),
        hasta: new Date(f.hasta).toISOString(),
        servidorMqttId: Number(f.servidorMqttId),
        servidorInfluxId: Number(servidorInfluxId),
        bucket,
        topico: f.topico.trim(),
      });
      setF({ ...FORM_BORRADO }); setConfirmando(false); onError('');
      recargar();
    } catch (e) { onError(e.message || 'No se pudo registrar la solicitud'); }
    finally { setEnviando(false); }
  };

  const cancelar = async (b) => {
    try { await api.laboratorio.cancelarBorrado(b.id); onError(''); recargar(); }
    catch (e) { onError(e.message || 'No se pudo cancelar'); }
  };

  const campo = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="font-semibold text-coop-negro mb-1">Borrado de datos en InfluxDB</p>
      <p className="text-xs text-slate-400 mb-3">
        Cada solicitud queda registrada acá y la ejecuta un proceso del área contra InfluxDB (no borra al instante).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-3xl">
        <label className="text-xs text-slate-500">Fecha de inicio *
          <input type="datetime-local" value={f.desde} onChange={set('desde')} className={campo} />
        </label>
        <label className="text-xs text-slate-500">Fecha de fin *
          <input type="datetime-local" value={f.hasta} onChange={set('hasta')} className={campo} />
        </label>
        <label className="text-xs text-slate-500">Servidor MQTT *
          <select value={f.servidorMqttId} onChange={set('servidorMqttId')} className={campo}>
            <option value="">Seleccionar…</option>
            {mqtt.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {mqtt.length === 0 && <span className="text-[11px] text-amber-600">No hay servidores MQTT cargados (solapa «Servidores MQTT»).</span>}
        </label>
        <label className="text-xs text-slate-500">Bucket *
          <select value={f.bucketRef} onChange={set('bucketRef')} className={campo}>
            <option value="">Seleccionar…</option>
            {influx.map((s) => {
              const bs = Array.isArray(s.buckets) ? s.buckets : [];
              return bs.length ? (
                <optgroup key={s.id} label={s.nombre}>
                  {bs.map((b) => <option key={`${s.id}|${b}`} value={`${s.id}|${b}`}>{b}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          {opcionesBucket.length === 0 && <span className="text-[11px] text-amber-600">Cargá buckets en algún servidor InfluxDB.</span>}
        </label>
        <label className="text-xs text-slate-500 sm:col-span-2">Tópico *
          <input value={f.topico} onChange={set('topico')} placeholder="coop/energia/…" className={campo} />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {confirmando ? (
          <span className="inline-flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex-wrap">
            Se registrará el borrado de <b>{f.bucketRef.split('|')[1]}</b> · tópico <b>{f.topico.trim()}</b> del {fmtFH(f.desde)} al {fmtFH(f.hasta)}. ¿Confirmás?
            <button onClick={solicitar} disabled={enviando} className="px-3 py-1 rounded-lg bg-red-600 text-white disabled:opacity-40">{enviando ? 'Enviando…' : 'Sí, solicitar'}</button>
            <button onClick={() => setConfirmando(false)} className="px-3 py-1 rounded-lg border border-slate-300 text-slate-500">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmando(true)} disabled={!rangoValido}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-40">
            Solicitar borrado
          </button>
        )}
      </div>

      <p className="font-medium text-slate-700 text-sm mt-5 mb-2">Historial de solicitudes</p>
      {borrados.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay solicitudes.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 860 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Solicitado</th>
                <th className="px-3 py-2 font-semibold">Rango a borrar</th>
                <th className="px-3 py-2 font-semibold">Servidor MQTT</th>
                <th className="px-3 py-2 font-semibold">Bucket</th>
                <th className="px-3 py-2 font-semibold">Tópico</th>
                <th className="px-3 py-2 font-semibold">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {borrados.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtFH(b.createdAt)}{b.solicitadoPor ? <div className="text-xs text-slate-400">{b.solicitadoPor}</div> : null}</td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtFH(b.desde)} → {fmtFH(b.hasta)}</td>
                  <td className="px-3 py-2 text-slate-600">{b.servidorNombre || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{b.bucket}{b.servidorInfluxNombre ? <div className="text-xs text-slate-400">{b.servidorInfluxNombre}</div> : null}</td>
                  <td className="px-3 py-2 text-slate-600 break-all">{b.topico}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_CHIP[b.estado] || ESTADO_CHIP.pendiente}`} title={b.resultado || ''}>{b.estado}</span>
                    {b.estado === 'error' && b.resultado ? <div className="text-xs text-red-600 mt-0.5 max-w-[220px]">{b.resultado}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {b.estado === 'pendiente' && (
                      <button onClick={() => cancelar(b)} className="text-xs px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-600">Cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
