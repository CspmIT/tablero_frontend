// Laboratorio (28/08, pedido de Leonardo): funciones IoT migradas desde la
// Oficina Virtual — administración de servidores InfluxDB / MQTT y borrado de
// datos en InfluxDB. 28/08: parte visual + guardado (cola). 10/09: el borrado
// se EJECUTA al confirmar contra el servidor Influx del bucket elegido
// (consulta → borrado → reconsulta, como la pantalla vieja) y el resultado
// vuelve en la misma fila; las pendientes/errores se reintentan desde el historial.
// Diseño congelado: claude/Laboratorio_y_Guardias_diseno_28_08.md
// Decisiones 28/08: interno (manager+gerencial+collaborator); MQTT = mismo ABM
// sin buckets; contraseñas visibles con 👁; borrados con historial.
// Para servidores Influx, "usuario" es la organización y "contraseña" el token
// de API (mismos campos, otra etiqueta en pantalla).
import { useEffect, useMemo, useState } from 'react';
import { FlaskConical, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Hora de Argentina fija (UTC-3, sin horario de verano), como hacía la pantalla
// vieja de la OV (+180 min): no depende de la zona del navegador ni del servidor.
const OFFSET_AR = '-03:00';
const TZ_AR = 'America/Argentina/Cordoba';
// 'YYYY-MM-DDTHH:mm[:ss]' (input datetime-local) → ISO UTC; '' si está vacío o mal.
const isoDesdeArgentina = (local) => {
  if (!local) return '';
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}${OFFSET_AR}`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
};
const fmtFH = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_AR, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}${p.second !== '00' ? `:${p.second}` : ''}`;
};
const ESTADO = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
  ejecutado: { label: 'Borrado', cls: 'bg-emerald-100 text-emerald-700' },
  sin_datos: { label: 'Sin datos', cls: 'bg-slate-100 text-slate-600' },
  error: { label: 'Error', cls: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500' },
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
              <th className="px-3 py-2 font-semibold">{tipo === 'influx' ? 'Organización' : 'Usuario'}</th>
              <th className="px-3 py-2 font-semibold">{tipo === 'influx' ? 'Token' : 'Contraseña'}</th>
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
            <input value={f.url} onChange={set('url')} placeholder={tipo === 'influx' ? 'http://200.63.120.50:18086' : '200.63.120.50 ó https://…'} className={campo} />
          </label>
          <label className="text-xs text-slate-500">{tipo === 'influx' ? 'Organización' : 'Usuario'}
            <input value={f.usuario} onChange={set('usuario')} placeholder={tipo === 'influx' ? 'CoopMorteros' : ''} className={campo} />
            {tipo === 'influx' && <span className="text-[11px] text-slate-400">Si queda vacía se usa CoopMorteros.</span>}
          </label>
          <label className="text-xs text-slate-500">{tipo === 'influx' ? 'Token de API' : 'Contraseña'}
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

// ---- Borrado de datos en InfluxDB (se ejecuta al confirmar; historial) -------
// 10/09: la solicitud se ejecuta en el momento contra el servidor Influx del
// bucket elegido (consulta → borrado → reconsulta) y vuelve con su resultado.
// Las 'pendiente' viejas y los 'error' se reintentan con «Ejecutar».
const FORM_BORRADO = { desde: '', hasta: '', servidorMqttId: '', bucketRef: '', topico: '' };
const BANNER = {
  ejecutado: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  sin_datos: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-red-50 border-red-200 text-red-700',
};

function BorradoInflux({ mqtt, influx, borrados, onError, recargar }) {
  const { api } = useData();
  const [f, setF] = useState({ ...FORM_BORRADO });
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // última fila ejecutada (aviso arriba del historial)
  const [ejecutando, setEjecutando] = useState(null); // id en reintento
  const set = (k) => (e) => { setConfirmando(false); setF((x) => ({ ...x, [k]: e.target.value })); };

  // bucketRef = "<servidorInfluxId>|<bucket>" (el bucket pertenece a un influx).
  const opcionesBucket = influx.flatMap((s) => (Array.isArray(s.buckets) ? s.buckets : []).map((b) => ({ ref: `${s.id}|${b}`, bucket: b, servidor: s })));
  const desdeIso = isoDesdeArgentina(f.desde);
  const hastaIso = isoDesdeArgentina(f.hasta);
  const completo = desdeIso && hastaIso && f.servidorMqttId && f.bucketRef && f.topico.trim();
  const rangoValido = completo && new Date(hastaIso) > new Date(desdeIso);

  const borrar = async () => {
    if (!rangoValido) { onError('Revisá el rango: la fecha de fin debe ser posterior a la de inicio.'); return; }
    const [servidorInfluxId, bucket] = f.bucketRef.split('|');
    setEnviando(true);
    try {
      const fila = await api.laboratorio.crearBorrado({
        desde: desdeIso,
        hasta: hastaIso,
        servidorMqttId: Number(f.servidorMqttId),
        servidorInfluxId: Number(servidorInfluxId),
        bucket,
        topico: f.topico.trim(),
      });
      setResultado(fila);
      // Como la pantalla vieja: el formulario se limpia solo si efectivamente borró.
      if (fila.estado === 'ejecutado') setF({ ...FORM_BORRADO });
      setConfirmando(false); onError('');
      recargar();
    } catch (e) { onError(e.message || 'No se pudo ejecutar el borrado'); }
    finally { setEnviando(false); }
  };

  const ejecutar = async (b) => {
    setEjecutando(b.id);
    try { setResultado(await api.laboratorio.ejecutarBorrado(b.id)); onError(''); recargar(); }
    catch (e) { onError(e.message || 'No se pudo ejecutar'); }
    finally { setEjecutando(null); }
  };

  const cancelar = async (b) => {
    try { await api.laboratorio.cancelarBorrado(b.id); onError(''); recargar(); }
    catch (e) { onError(e.message || 'No se pudo cancelar'); }
  };

  const campo = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-full';
  const bucketElegido = f.bucketRef.split('|')[1];
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="font-semibold text-coop-negro mb-1">Borrado de datos en InfluxDB</p>
      <p className="text-xs text-slate-400 mb-3">
        Se ejecuta al confirmar: primero se comprueba que haya datos del tópico en el rango, se borran y se
        vuelve a comprobar. Todo queda en el historial de abajo. Las horas son de Argentina.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-3xl">
        <label className="text-xs text-slate-500">Fecha y hora de inicio *
          <input type="datetime-local" step="1" value={f.desde} onChange={set('desde')} className={campo} />
        </label>
        <label className="text-xs text-slate-500">Fecha y hora de fin *
          <input type="datetime-local" step="1" value={f.hasta} onChange={set('hasta')} className={campo} />
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
            Se van a borrar los datos de <b>{bucketElegido}</b> · tópico <b>{f.topico.trim()}</b> del {fmtFH(desdeIso)} al {fmtFH(hastaIso)} (hora de Argentina). No se puede deshacer. ¿Confirmás?
            <button onClick={borrar} disabled={enviando} className="px-3 py-1 rounded-lg bg-red-600 text-white disabled:opacity-40">{enviando ? 'Borrando…' : 'Sí, borrar'}</button>
            <button onClick={() => setConfirmando(false)} disabled={enviando} className="px-3 py-1 rounded-lg border border-slate-300 text-slate-500 disabled:opacity-40">No</button>
          </span>
        ) : (
          <button onClick={() => setConfirmando(true)} disabled={!rangoValido}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-40">
            Borrar datos
          </button>
        )}
      </div>

      {resultado && (
        <div className={`mt-4 border rounded-lg px-3 py-2 text-sm flex items-start justify-between gap-2 ${BANNER[resultado.estado] || BANNER.error}`}>
          <span>
            <b>{ESTADO[resultado.estado]?.label || resultado.estado}</b> · {resultado.bucket} · {resultado.topico}
            {resultado.resultado ? <>: {resultado.resultado}</> : null}
          </span>
          <button onClick={() => setResultado(null)} className="opacity-60 hover:opacity-100" title="Cerrar">✕</button>
        </div>
      )}

      <p className="font-medium text-slate-700 text-sm mt-5 mb-2">Historial de borrados</p>
      {borrados.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay borrados.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 900 }}>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                <th className="px-3 py-2 font-semibold">Solicitado</th>
                <th className="px-3 py-2 font-semibold">Rango (hora Argentina)</th>
                <th className="px-3 py-2 font-semibold">Servidor MQTT</th>
                <th className="px-3 py-2 font-semibold">Bucket</th>
                <th className="px-3 py-2 font-semibold">Tópico</th>
                <th className="px-3 py-2 font-semibold">Resultado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {borrados.map((b) => {
                const est = ESTADO[b.estado] || ESTADO.pendiente;
                const reintentable = ['pendiente', 'error'].includes(b.estado);
                return (
                  <tr key={b.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtFH(b.createdAt)}{b.solicitadoPor ? <div className="text-xs text-slate-400">{b.solicitadoPor}</div> : null}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtFH(b.desde)} → {fmtFH(b.hasta)}</td>
                    <td className="px-3 py-2 text-slate-600">{b.servidorNombre || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{b.bucket}{b.servidorInfluxNombre ? <div className="text-xs text-slate-400">{b.servidorInfluxNombre}</div> : null}</td>
                    <td className="px-3 py-2 text-slate-600 break-all">{b.topico}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${est.cls}`}>{est.label}</span>
                      {b.resultado ? <div className={`text-xs mt-0.5 max-w-[260px] ${b.estado === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{b.resultado}</div> : null}
                      {b.ejecutadoAt ? <div className="text-[11px] text-slate-400 mt-0.5">{fmtFH(b.ejecutadoAt)}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {reintentable && (
                        <button onClick={() => ejecutar(b)} disabled={ejecutando === b.id}
                          className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white disabled:opacity-40 mr-1">
                          {ejecutando === b.id ? 'Borrando…' : (b.estado === 'error' ? 'Reintentar' : 'Ejecutar')}
                        </button>
                      )}
                      {b.estado === 'pendiente' && (
                        <button onClick={() => cancelar(b)} className="text-xs px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-600">Cancelar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
