import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Wrench, TriangleAlert, Settings, FileText, Trash2, Printer, Save } from 'lucide-react';
import { useData } from '../data/DataContext.jsx';
import AnalisisIATickets from './AnalisisIATickets.jsx';

// Solapa "Asistente IA": conversación con Claude sobre los datos del tablero.
// El backend arma el contexto y ejecuta las consultas (tool use); acá solo se
// muestra la conversación. Visible para todos; los datos se filtran por rol.
//
// 07/10 bis (pedido de Leonardo: «interfaz más humana, nos queda todo un
// costado»): la pantalla pasa a DOS columnas — chat a la izquierda (bienvenida
// con nombre, sugerencias agrupadas por tema según el perfil) y panel de
// INFORMES a la derecha (cards estilo Marketing): ahí quedan archivados los
// Análisis IA de tickets (cada generación, ya no solo el último) y las
// respuestas del chat que se guardan con «Guardar como informe». Cada card se
// abre como vista previa con membrete y se descarga como PDF (patrón del
// Reporte semanal OV: el iframe ES el documento y se imprime tal cual).

// Sugerencias agrupadas por tema; roles:null = todos los que ven la solapa.
const GRUPOS_SUGERENCIAS = [
  { titulo: 'Horas y equipo', emoji: '🕐', roles: null, items: [
    '¿Cuántas horas se destinaron a Reconecta este año?',
    '¿Quién hizo más horas extra este mes?',
  ] },
  { titulo: 'Tareas y prioridades', emoji: '📋', roles: null, items: [
    '¿Qué tarea me conviene tomar ahora?',
    '¿Cómo viene el avance de los objetivos?',
  ] },
  { titulo: 'Comercial', emoji: '💼', roles: null, items: [
    '¿Cómo está el pipeline comercial?',
    '¿Cuántas consultas entraron por la web este mes?',
  ] },
  { titulo: 'Tickets y soporte', emoji: '🎫', roles: ['manager', 'gerencial', 'collaborator'], items: [
    '¿Cuántos tickets abiertos hay en el Inbox?',
    '¿Qué tickets entraron esta semana?',
  ] },
  { titulo: 'Costos', emoji: '💰', roles: ['manager', 'gerencial'], items: [
    '¿Cuál fue el costo laboral del mes pasado?',
  ] },
];

const saludoDe = (nombre) => {
  const h = new Date().getHours();
  const momento = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${momento}, ${nombre}` : momento;
};

const dmyhm = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-AR')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dmy = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

export default function Asistente() {
  const { api, me } = useData();
  const [estado, setEstado] = useState(null); // { configurado, origen, mascara } | null = consultando
  const [configOpen, setConfigOpen] = useState(false);
  const [mensajes, setMensajes] = useState([]);         // { role, content, herramientas? }
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const finRef = useRef(null);

  // Panel de informes (07/10 bis)
  const [informes, setInformes] = useState(null); // null = cargando
  const [analisisOpen, setAnalisisOpen] = useState(false);
  const [viendo, setViendo] = useState(null);     // meta del informe abierto
  const [guardandoDe, setGuardandoDe] = useState(null); // índice del mensaje del chat a guardar
  // Regla de UX (Leonardo 07/10): toda acción de guardar confirma VISUALMENTE
  // — si no, el usuario toca varias veces. La card recién creada queda
  // resaltada unos segundos y el botón del mensaje pasa a «✓ Guardado».
  const [resaltada, setResaltada] = useState(null); // id de la card recién guardada
  useEffect(() => {
    if (!resaltada) return undefined;
    const t = setTimeout(() => setResaltada(null), 5000);
    return () => clearTimeout(t);
  }, [resaltada]);

  const esManager = me?.tipo === 'manager';
  const esConduccion = ['manager', 'gerencial'].includes(me?.tipo);
  // El panel es del equipo interno (mismos roles que las tools de tickets).
  const vePanel = ['manager', 'gerencial', 'collaborator'].includes(me?.tipo);

  const cargarEstado = () => api.asistente.estado().then(setEstado).catch(() => setEstado({ configurado: false }));
  const cargarInformes = () => api.asistente.informes().then((r) => setInformes(r?.informes || [])).catch(() => setInformes([]));
  useEffect(() => {
    cargarEstado();
    if (vePanel) cargarInformes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

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

  const sugerencias = GRUPOS_SUGERENCIAS.filter((g) => !g.roles || g.roles.includes(me?.tipo));

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
    <div>
      <Encabezado onConfig={esManager ? () => setConfigOpen(true) : null} />
      {configOpen && <ConfigClaveModal estado={estado} api={api} onClose={() => { setConfigOpen(false); cargarEstado(); }} />}

      <div className="flex flex-col xl:flex-row gap-4 items-stretch">
        {/* ====================== CHAT ====================== */}
        <div className="flex-1 min-w-0 flex flex-col" style={{ height: 'calc(100vh - 11rem)' }}>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {mensajes.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-base font-medium text-slate-800 mb-1">
                  {saludoDe(me?.nombre?.split(' ')[0])} 👋
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  Preguntame lo que quieras sobre los datos del tablero — respondo con números reales y te digo qué consulté. Algunas ideas para arrancar:
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {sugerencias.map((g) => (
                    <div key={g.titulo}>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">{g.emoji} {g.titulo}</p>
                      <div className="flex flex-col items-start gap-1.5">
                        {g.items.map((s) => (
                          <button key={s} onClick={() => enviar(s)}
                            className="text-left px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:border-coop-azul hover:text-coop-azul text-sm text-slate-600">
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mensajes.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <span className="w-7 h-7 rounded-full bg-coop-naranja/15 text-coop-naranja flex items-center justify-center shrink-0 mr-2 mt-1">
                    <Sparkles size={14} />
                  </span>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-coop-azul text-white rounded-br-sm'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                }`}>
                  {m.content}
                  {m.role === 'assistant' && (m.herramientas?.length > 0 || vePanel) && (
                    <p className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      {m.herramientas?.length > 0 && (
                        <span className="flex items-center gap-1"><Wrench size={11} /> Consultó: {m.herramientas.join(', ')}</span>
                      )}
                      {vePanel && (m.guardado ? (
                        <span className="flex items-center gap-1 text-emerald-600 ml-auto">✓ Guardado en Informes</span>
                      ) : (
                        <button onClick={() => setGuardandoDe(i)} title="Queda en el panel de informes, con descarga en PDF"
                          className="flex items-center gap-1 text-coop-azul/70 hover:text-coop-azul ml-auto">
                          <Save size={11} /> Guardar como informe
                        </button>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {pensando && (
              <div className="flex justify-start">
                <span className="w-7 h-7 rounded-full bg-coop-naranja/15 text-coop-naranja flex items-center justify-center shrink-0 mr-2 mt-1">
                  <Sparkles size={14} />
                </span>
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

        {/* ====================== PANEL DE INFORMES ====================== */}
        {vePanel && (
          <div className="xl:w-[380px] shrink-0">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 xl:max-h-[calc(100vh-11rem)] flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-coop-azul" />
                <h3 className="text-sm font-semibold text-slate-800">Informes</h3>
                {informes?.length > 0 && <span className="text-xs text-slate-400">{informes.length}</span>}
                {esConduccion && (
                  <button onClick={() => setAnalisisOpen(true)} title="Agrupa con IA los tickets repetidos del Inbox y propone soluciones de fondo"
                    className="ml-auto text-xs px-2.5 py-1.5 rounded-lg border border-coop-azul text-coop-azul hover:bg-coop-azul/5">
                    ✨ Analizar tickets
                  </button>
                )}
              </div>

              <div className="overflow-y-auto grid gap-2 content-start flex-1">
                {informes === null && <p className="text-xs text-slate-400">Cargando…</p>}
                {informes?.length === 0 && (
                  <div className="text-xs text-slate-400 leading-relaxed border border-dashed border-slate-200 rounded-xl p-3">
                    Acá quedan archivados los informes, listos para descargar en PDF cuando los necesites:
                    los <b>Análisis IA de tickets</b> (cada generación queda guardada{esConduccion ? ' — probá «✨ Analizar tickets»' : ''})
                    y las respuestas del chat que guardes con <b>«Guardar como informe»</b>.
                  </div>
                )}
                {(informes || []).map((inf) => (
                  <TarjetaInforme key={inf.id} inf={inf} api={api} puedeBorrar={esConduccion}
                    destacada={inf.id === resaltada}
                    onVer={() => setViendo(inf)} onBorrado={cargarInformes} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {analisisOpen && (
        <AnalisisIATickets api={api} puedeGenerar={esConduccion} onGenerado={cargarInformes}
          onClose={() => setAnalisisOpen(false)} />
      )}
      {viendo && (
        <VistaInformeModal api={api} meta={viendo} onClose={() => setViendo(null)} />
      )}
      {guardandoDe != null && (
        <GuardarInformeModal api={api}
          pregunta={[...mensajes.slice(0, guardandoDe)].reverse().find((m) => m.role === 'user')?.content || ''}
          respuesta={mensajes[guardandoDe]?.content || ''}
          herramientas={mensajes[guardandoDe]?.herramientas || []}
          onClose={() => setGuardandoDe(null)}
          onGuardado={(creado) => {
            const idx = guardandoDe;
            setGuardandoDe(null);
            // Confirmación visible por triplicado: el modal avisó, el mensaje
            // queda con «✓ Guardado» y la card nueva aparece resaltada.
            setMensajes((ms) => ms.map((m, i2) => (i2 === idx ? { ...m, guardado: true } : m)));
            if (creado?.id) setResaltada(creado.id);
            cargarInformes();
          }} />
      )}
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

// ─────────────────────── Panel: tarjeta de un informe ───────────────────────
function TarjetaInforme({ inf, api, puedeBorrar, destacada, onVer, onBorrado }) {
  const [borrando, setBorrando] = useState(false);
  const esTickets = inf.tipo === 'tickets';
  return (
    <div className={`border rounded-xl px-3 py-2.5 hover:border-coop-azul/50 group transition-colors ${destacada ? 'border-emerald-400 bg-emerald-50/60 ring-2 ring-emerald-200' : 'border-slate-200'}`}>
      <div className="flex items-start gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-sm ${esTickets ? 'bg-amber-50' : 'bg-coop-azul/10'}`}>
          {esTickets ? '✨' : '💬'}
        </span>
        <div className="min-w-0 flex-1">
          <button onClick={onVer} className="text-left text-sm font-medium text-slate-800 hover:text-coop-azul leading-snug block w-full">
            {inf.titulo}
          </button>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {esTickets
              ? `${inf.grupos} ${inf.grupos === 1 ? 'grupo' : 'grupos'} · ${inf.totalAnalizados} tickets`
              : 'Consulta del chat'}
            {' · '}{inf.generadoPor || '—'} · {dmyhm(inf.generadoEl)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-1.5 pl-9">
        <button onClick={onVer} className="text-[11px] px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:border-coop-azul hover:text-coop-azul flex items-center gap-1">
          <Printer size={11} /> Ver / PDF
        </button>
        {puedeBorrar && (borrando ? (
          <span className="flex items-center gap-1 ml-auto text-[11px]">
            <button onClick={() => { api.asistente.borrarInforme(inf.id).then(onBorrado).catch(() => {}); setBorrando(false); }}
              className="px-2 py-1 rounded bg-red-600 text-white">Sí, borrar</button>
            <button onClick={() => setBorrando(false)} className="px-2 py-1 rounded border border-slate-300 text-slate-500">No</button>
          </span>
        ) : (
          <button onClick={() => setBorrando(true)} title="Quitar del archivo (no se puede deshacer)"
            className="ml-auto p-1.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100">
            <Trash2 size={13} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────── Vista previa con membrete + Imprimir / PDF ─────────────
// Mismo patrón del Reporte semanal OV: el iframe ES el documento (srcDoc) y
// «Imprimir / PDF» dispara el print del iframe — sale en A4 tal cual se ve.
function VistaInformeModal({ api, meta, onClose }) {
  const [informe, setInforme] = useState(null); // null = cargando
  const [error, setError] = useState('');
  const iframeRef = useRef(null);

  useEffect(() => {
    api.asistente.informe(meta.id)
      .then((r) => setInforme(r?.informe || null))
      .catch((e) => setError(e.message || 'No se pudo abrir el informe.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id]);

  const imprimir = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center overflow-y-auto p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-6">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm truncate">{meta.titulo}</h3>
          <button onClick={imprimir} disabled={!informe}
            className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5">
            <Printer size={14} /> Imprimir / PDF
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 px-2">✕</button>
        </div>
        <div className="p-3">
          {error && <p className="text-sm text-red-600 p-3">{error}</p>}
          {!informe && !error && <p className="text-sm text-slate-400 p-3">Abriendo…</p>}
          {informe && (
            <>
              <iframe ref={iframeRef} srcDoc={informeHtml(informe)} title={meta.titulo}
                className="w-full bg-white border border-slate-200 rounded-xl" style={{ height: '65vh' }} />
              <p className="text-[11px] text-slate-400 mt-2 px-1">
                La vista previa ES el documento: «Imprimir / PDF» abre el diálogo del sistema — elegí <b>«Guardar como PDF»</b> y sale tal cual se ve (A4).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────── Guardar una respuesta del chat como informe ─────────────
function GuardarInformeModal({ api, pregunta, respuesta, herramientas, onClose, onGuardado }) {
  const [titulo, setTitulo] = useState(pregunta.slice(0, 80));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true); setError('');
    try {
      const r = await api.asistente.guardarInforme({ titulo: titulo.trim(), pregunta, respuesta, herramientas });
      onGuardado(r?.informe || null);
    } catch (e) {
      setError(e.message || 'No se pudo guardar.');
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl w-full max-w-md p-5">
        <h3 className="font-semibold mb-1 text-slate-800">Guardar como informe</h3>
        <p className="text-sm text-slate-500 mb-3">Queda en el panel de informes (lo ve el equipo interno) con descarga en PDF.</p>
        <label className="text-xs text-slate-500">Título</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} autoFocus
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mt-1
                     focus:outline-none focus:ring-2 focus:ring-coop-azul/40 focus:border-coop-azul" />
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !titulo.trim()}
            className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── HTML del informe (membrete Cooptech, A4) ─────────────
const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Markdown MUY ligero para las respuestas del chat: negritas y saltos de línea.
const mdLigero = (s) => escHtml(s)
  .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  .replace(/^- (.+)$/gm, '&bull; $1')
  .replace(/\n/g, '<br/>');

const NAVY = '#1F3864';
const IMPACTO_COLOR = { alto: '#C0392B', medio: '#B9770E', bajo: '#7F8C8D' };

function informeHtml(inf) {
  const esTickets = inf.tipo === 'tickets';
  const cuerpo = esTickets ? cuerpoTickets(inf) : cuerpoChat(inf);
  const sub = [
    `Generado por ${escHtml(inf.generadoPor || '—')} el ${escHtml(dmyhm(inf.generadoEl))}`,
    esTickets && inf.periodo ? `Período ${dmy(inf.periodo.desde)} → ${dmy(inf.periodo.hasta)}` : null,
    esTickets ? `${inf.totalAnalizados} tickets analizados` : null,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  // El <title> es el nombre de archivo que propone el navegador al guardar PDF.
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(inf.titulo)}</title><style>
    *{box-sizing:border-box} body{font-family:Calibri,'Segoe UI',sans-serif;color:#222;margin:0;background:#fff;padding:24px}
    .mem{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid ${NAVY};padding-bottom:6px;margin-bottom:12px}
    .mem b{color:${NAVY};font-size:15px;letter-spacing:.5px} .mem span{color:#888;font-size:11px}
    h1{font-size:18px;color:${NAVY};margin:0 0 2px} .sub{color:#666;font-size:11px;margin-bottom:14px}
    .res{background:#EEF1FA;border-left:4px solid ${NAVY};padding:8px 12px;font-size:12.5px;margin-bottom:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .g{border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
    .g h2{font-size:13.5px;margin:0 0 4px;color:#222} .badge{font-size:10px;font-weight:bold;padding:1px 6px;border-radius:8px;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .fila{font-size:12px;margin:3px 0} .fila b{color:${NAVY}}
    .fondo{background:#EAF7EF;border-left:4px solid #1E8449;padding:6px 10px;font-size:12px;margin-top:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .ids{font-size:10.5px;color:#888;margin-top:5px} .preg{background:#F4F5F7;border-radius:6px;padding:8px 12px;font-size:12.5px;margin-bottom:12px}
    .resp{font-size:12.5px;line-height:1.5} .pie{margin-top:16px;border-top:1px solid #ddd;padding-top:6px;font-size:10px;color:#999}
    @page{size:A4;margin:14mm 12mm} @media print{body{padding:0}}
  </style></head><body>
  <div class="mem"><b>COOPTECH &middot; Tablero de Mando</b><span>Asistente IA</span></div>
  <h1>${escHtml(inf.titulo)}</h1>
  <div class="sub">${sub}</div>
  ${cuerpo}
  <div class="pie">Informe generado con IA sobre los datos reales del tablero Cooptech${esTickets ? ' — el agrupado es semántico: verificar los números de ticket citados antes de tomar decisiones' : ''}.${inf.recortado ? ' Contenido recortado al archivar (superó el tamaño máximo).' : ''}</div>
  </body></html>`;
}

function cuerpoTickets(inf) {
  const informe = inf.informe || {};
  const grupos = informe.grupos || [];
  return `
  <div class="res"><b>Resumen:</b> ${mdLigero(informe.resumen || '—')}</div>
  ${grupos.length === 0 ? '<p style="font-size:12.5px;color:#666">No se encontraron problemas que se repitan en el período.</p>' : ''}
  ${grupos.map((g, i) => `
    <div class="g">
      <h2>${i + 1}. ${escHtml(g.patron)} &nbsp;
        <span class="badge" style="background:${NAVY}">${g.frecuencia} tickets</span>
        <span class="badge" style="background:${IMPACTO_COLOR[g.impacto] || IMPACTO_COLOR.medio}">impacto ${escHtml(g.impacto)}</span></h2>
      <div class="fila"><b>Síntoma:</b> ${escHtml(g.sintoma)}</div>
      ${g.solucionTipica ? `<div class="fila"><b>Cómo se viene resolviendo:</b> ${escHtml(g.solucionTipica)}</div>` : ''}
      <div class="fondo"><b>Solución de fondo propuesta:</b> ${escHtml(g.propuestaDeFondo)}</div>
      ${g.ticketIds?.length ? `<div class="ids">Tickets: ${g.ticketIds.map((id) => '#' + id).join(', ')}</div>` : ''}
    </div>`).join('')}`;
}

function cuerpoChat(inf) {
  return `
  <div class="preg"><b>Pregunta:</b> ${mdLigero(inf.pregunta || '—')}</div>
  <div class="resp">${mdLigero(inf.respuesta || '')}</div>
  ${inf.herramientas?.length ? `<div class="ids" style="margin-top:10px">Datos consultados: ${inf.herramientas.map(escHtml).join(', ')}</div>` : ''}`;
}

// Modal de configuración de la clave (solo manager). La clave se valida con una
// llamada real antes de guardarse, viaja una sola vez y se almacena cifrada;
// acá solo se muestra enmascarada.
function ConfigClaveModal({ estado, api, onClose }) {
  const [clave, setClave] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false); // confirmación propia (regla: sin confirm() nativo)
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
    setQuitando(false);
    setGuardando(true); setMsj(null);
    try {
      await api.asistente.borrarClave();
      setMsj({ tipo: 'ok', texto: 'Clave quitada.' });
    } catch (e) {
      setMsj({ tipo: 'error', texto: e.message || 'No se pudo quitar' });
    } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
            ? (quitando ? (
                <span className="flex items-center gap-1.5 text-sm">
                  <span className="text-xs text-slate-500">¿Quitar? El asistente queda inactivo.</span>
                  <button onClick={quitar} disabled={guardando} className="px-2 py-1 rounded bg-red-600 text-white text-xs">Sí</button>
                  <button onClick={() => setQuitando(false)} className="px-2 py-1 rounded border border-slate-300 text-slate-500 text-xs">No</button>
                </span>
              ) : (
                <button onClick={() => setQuitando(true)} disabled={guardando} className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40">Quitar clave</button>
              ))
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
