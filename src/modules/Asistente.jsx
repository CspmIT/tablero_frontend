import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Wrench, TriangleAlert, Settings } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';

// Solapa "Asistente IA": conversación con Claude sobre los datos del tablero.
// El backend arma el contexto y ejecuta las consultas (tool use); acá solo se
// muestra la conversación. Visible para todos; los datos se filtran por rol.

const SUGERENCIAS = [
  '¿Cuántas horas se destinaron a Reconecta este año?',
  '¿Qué tarea me conviene tomar ahora?',
  '¿Cómo está el pipeline comercial?',
];

export default function Asistente() {
  const { api, me } = useData();
  const [estado, setEstado] = useState(null); // { configurado, origen, mascara } | null = consultando
  const [configOpen, setConfigOpen] = useState(false);
  const [mensajes, setMensajes] = useState([]);         // { role, content, herramientas? }
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const finRef = useRef(null);

  const cargarEstado = () => api.asistente.estado().then(setEstado).catch(() => setEstado({ configurado: false }));
  useEffect(() => { cargarEstado(); }, [api]);
  const esManager = me?.tipo === 'manager';

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  const enviar = async (contenido) => {
    const pregunta = String(contenido ?? texto).trim();
    if (!pregunta || pensando) return;
    setError(null);
    setTexto('');
    const historia = [...mensajes, { role: 'user', content: pregunta }];
    setMensajes(historia);
    setPensando(true);
    try {
      const r = await api.asistente.chat(historia.map(({ role, content }) => ({ role, content })));
      setMensajes([...historia, { role: 'assistant', content: r.respuesta, herramientas: r.herramientas }]);
    } catch (e) {
      setError(e.message || 'No se pudo consultar al asistente');
      setMensajes(historia); // la pregunta queda; se puede reintentar
    } finally {
      setPensando(false);
    }
  };

  if (estado && !estado.configurado) {
    return (
      <div className="max-w-2xl">
        <Encabezado onConfig={esManager ? () => setConfigOpen(true) : null} />
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex gap-2">
          <TriangleAlert size={18} className="shrink-0 mt-0.5" />
          <p>El asistente todavía no está configurado (falta la clave de la API de Claude).
            {esManager
              ? ' Cargala desde el engranaje de arriba: se valida y guarda cifrada, sin tocar el servidor.'
              : ' Pedile al manager que la cargue desde esta solapa.'}</p>
        </div>
        {configOpen && <ConfigClaveModal estado={estado} api={api} onClose={() => { setConfigOpen(false); cargarEstado(); }} />}
      </div>
    );
  }

  return (
    <div className="max-w-3xl flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>
      <Encabezado onConfig={esManager ? () => setConfigOpen(true) : null} />
      {configOpen && <ConfigClaveModal estado={estado} api={api} onClose={() => { setConfigOpen(false); cargarEstado(); }} />}

      {/* Conversación */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {mensajes.length === 0 && (
          <div className="text-sm text-slate-500">
            <p className="mb-3">Preguntale al tablero en lenguaje natural. Algunas ideas:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} onClick={() => enviar(s)}
                  className="px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:border-coop-azul hover:text-coop-azul text-sm">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-coop-azul text-white rounded-br-sm'
                : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
            }`}>
              {m.content}
              {m.role === 'assistant' && m.herramientas?.length > 0 && (
                <p className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1">
                  <Wrench size={11} /> Consultó: {m.herramientas.join(', ')}
                </p>
              )}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-slate-400 shadow-sm">
              Consultando el tablero…
            </div>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}
        <div ref={finRef} />
      </div>

      {/* Entrada */}
      <div className="mt-3 flex gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
          rows={1}
          placeholder={`Preguntá sobre los datos del tablero, ${me?.nombre?.split(' ')[0] || ''}…`}
          className="flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul"
        />
        <button onClick={() => enviar()} disabled={pensando || !texto.trim()}
          className="rounded-xl bg-coop-azul text-white px-4 disabled:opacity-40 hover:bg-[#1a2d6b]">
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

function Encabezado({ onConfig }) {
  return (
    <div className="mb-4 flex items-start justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Sparkles size={20} className="text-coop-naranja" /> Asistente IA
        </h1>
        <p className="text-sm text-slate-500">
          Respuestas con datos reales del tablero. Lo que ve depende de tu perfil.
        </p>
      </div>
      {onConfig && (
        <button onClick={onConfig} title="Configurar clave de API"
          className="p-2 rounded-lg text-slate-400 hover:text-coop-azul hover:bg-slate-100">
          <Settings size={18} />
        </button>
      )}
    </div>
  );
}

// Modal de configuración de la clave (solo manager). La clave se valida con una
// llamada real antes de guardarse, viaja una sola vez y se almacena cifrada;
// acá solo se muestra enmascarada.
function ConfigClaveModal({ estado, api, onClose }) {
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msj, setMsj] = useState(null); // { tipo: 'ok'|'error', texto }

  const guardar = async () => {
    if (!clave.trim() || guardando) return;
    setGuardando(true); setMsj(null);
    try {
      const r = await api.asistente.setClave(clave.trim());
      setMsj({ tipo: 'ok', texto: `Clave validada y guardada (${r.mascara}).` });
      setClave('');
    } catch (e) {
      setMsj({ tipo: 'error', texto: e.message || 'No se pudo guardar la clave' });
    } finally { setGuardando(false); }
  };

  const quitar = async () => {
    if (!confirm('¿Quitar la clave guardada? El asistente quedará inactivo (salvo respaldo en el servidor).')) return;
    setGuardando(true); setMsj(null);
    try {
      await api.asistente.borrarClave();
      setMsj({ tipo: 'ok', texto: 'Clave quitada.' });
    } catch (e) {
      setMsj({ tipo: 'error', texto: e.message || 'No se pudo quitar' });
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold mb-1">Clave de API del asistente</h3>
        <p className="text-sm text-slate-500 mb-3">
          {estado?.configurado
            ? <>Clave actual: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{estado.mascara}</code>
                <span className="text-xs text-slate-400"> ({estado.origen === 'db' ? 'cargada desde la app' : 'variable de entorno del servidor'})</span></>
            : 'Sin clave configurada.'}
        </p>
        <input
          type="password" value={clave} onChange={(e) => setClave(e.target.value)}
          placeholder="sk-ant-…" autoComplete="off"
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono
                     focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
        <p className="text-[11px] text-slate-400 mt-2">
          Al guardar se hace una llamada de prueba: si Anthropic la rechaza, no se guarda.
          Se almacena cifrada en la base; nunca vuelve a mostrarse completa.
        </p>
        {msj && (
          <p className={`text-sm mt-3 rounded-lg p-2 ${msj.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msj.texto}
          </p>
        )}
        <div className="flex justify-between items-center mt-4">
          {estado?.origen === 'db'
            ? <button onClick={quitar} disabled={guardando} className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40">Quitar clave</button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
            <button onClick={guardar} disabled={guardando || !clave.trim()}
              className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
              {guardando ? 'Validando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
