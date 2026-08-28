// Métricas Oficina Virtual (ola 1, 18/08) — pedido de Gerencia de Operaciones.
// Diseño congelado: OficinaVirtual_tickets_diseno_18_08.md + maqueta validada.
// Tres vistas: Tablero ejecutivo (7 KPIs + 6 gráficas) · Bandeja de
// clasificación (con sugerencias por palabras clave) · Detalle (control
// cruzado). Unidad: 1 ítem de grilla = 1 ticket (mide intervenciones).
// Horas: reales si el ítem las tiene; el resto prorrateo de la jornada
// (calculado en el backend) — SIEMPRE etiquetado como estimación.
// Nada entra al tablero sin clasificar: el KPI "Sin clasificar" evita que
// el tablero mienta por omisión.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data/DataContext.jsx';

// Paleta institucional validada (diseño §9) — orden FIJO por causa.
// 27/08 (pedido de GERENCIA vía Leonardo): renombradas y reordenadas — los ids
// NO cambian (son los guardados en la base); «No vinculado a OV» SIEMPRE 4to.
const CAUSAS = [
  { id: 'ov_interna', label: 'Falla desarrollo propio de OV', color: '#3F5BD6' },
  { id: 'procoop', label: 'Falla con integración ERP y dependencias', color: '#0E9C86' },
  { id: 'terceros', label: 'Falla botones de pago', color: '#A94FA6' },
  { id: 'interna_otra', label: 'No vinculado a OV - Otros softwares', color: '#DA5224' },
];
const CAUSA = Object.fromEntries(CAUSAS.map((c) => [c.id, c]));
const TIPOS = [
  { id: 'incidente', label: 'Incidente', color: '#D6453F' },
  { id: 'solicitud', label: 'Solicitud', color: '#4A8FBF' },
];
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));

const PERIODOS = [
  { v: 1, t: 'Último mes' },
  { v: 3, t: 'Últimos 3 meses' },
  { v: 6, t: 'Últimos 6 meses' },
  { v: 12, t: 'Últimos 12 meses' },
  { v: 0, t: 'Personalizado…' }, // 26/08: rango libre desde/hasta
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const fmtH = (h) => (h >= 100 ? Math.round(h) : Math.round(h * 10) / 10);
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');
const isoDia = (d) => d.toISOString().slice(0, 10);

// Lunes de la semana de una fecha (para la evolución semanal).
const lunesDe = (fecha) => {
  const d = new Date(String(fecha).slice(0, 10) + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return isoDia(d);
};

export default function MetricasOV() {
  const { api } = useData();
  const [vista, setVista] = useState('tablero'); // tablero | reporte | bandeja | detalle
  // 26/08 (Leonardo, orden visual): solo Tablero y Reporte como solapas; la
  // Bandeja y el Detalle son herramientas de mantenimiento → viven en el ⚙.
  const [menuAjustes, setMenuAjustes] = useState(false);
  const [meses, setMeses] = useState(3);         // default: últimos 3 meses (pedido de Operaciones)
  const [tickets, setTickets] = useState([]);
  const [reglas, setReglas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [fTipo, setFTipo] = useState('');
  // 27/08: causas TILDABLES y combinables (antes select de a una). Vacío = todas.
  const [fCausas, setFCausas] = useState([]);
  const [menuCausas, setMenuCausas] = useState(false);
  const toggleCausa = (id) => setFCausas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const [fResp, setFResp] = useState('');
  const [guardando, setGuardando] = useState(null); // itemId en vuelo
  const [seleccion, setSeleccion] = useState({});   // itemId -> { tipo, causa } (bandeja)
  // Editor del Detalle (19/08, pedido de Leonardo: re-clasificar sin volver a
  // la bandeja): itemId en edición + su borrador { tipo, causa }.
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState({ tipo: '', causa: '' });
  const [aplicandoTodas, setAplicandoTodas] = useState(false);

  const hoy = new Date();
  // Rango personalizado (26/08): meses === 0 usa desde/hasta libres.
  const [customDesde, setCustomDesde] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return isoDia(d); });
  const [customHasta, setCustomHasta] = useState(isoDia(new Date()));
  const desde = useMemo(() => {
    if (meses === 0) return customDesde;
    const d = new Date(hoy); d.setMonth(d.getMonth() - meses);
    return isoDia(d);
  }, [meses, customDesde]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasta = meses === 0 ? customHasta : isoDia(hoy);

  const cargar = () => {
    if (!desde || !hasta || hasta < desde) return; // rango a medio escribir: no pegarle al backend
    setCargando(true);
    api.analisisOv.tickets(desde, hasta)
      .then((r) => setTickets(Array.isArray(r?.tickets) ? r.tickets : []))
      .catch(() => setTickets([]))
      .finally(() => setCargando(false));
  };
  useEffect(() => { cargar(); }, [desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.analisisOv.reglas().then((r) => setReglas(Array.isArray(r?.reglas) ? r.reglas : [])).catch(() => {});
  }, [api]);

  // --- Particiones del universo (diseño §4) ---
  const activos = tickets.filter((t) => !t.ovDescartado);
  const clasificados = activos.filter((t) => t.ovTipo && t.ovCausa);
  const pendientes = activos.filter((t) => !(t.ovTipo && t.ovCausa));

  // Filtros del tablero/detalle (solo sobre clasificados).
  const visibles = clasificados.filter((t) => (
    (!fTipo || t.ovTipo === fTipo) && (!fCausas.length || fCausas.includes(t.ovCausa)) && (!fResp || t.colaborador === fResp)
  ));
  const responsables = [...new Set(activos.map((t) => t.colaborador))].sort();

  // --- Agregaciones ---
  const porCausa = CAUSAS.map((c) => {
    const del = visibles.filter((t) => t.ovCausa === c.id);
    return {
      ...c,
      n: del.length,
      horas: del.reduce((a, t) => a + (t.horas || 0), 0),
      incidentes: del.filter((t) => t.ovTipo === 'incidente').length,
      solicitudes: del.filter((t) => t.ovTipo === 'solicitud').length,
    };
  });
  const totIncidentes = visibles.filter((t) => t.ovTipo === 'incidente').length;
  const totHoras = visibles.reduce((a, t) => a + (t.horas || 0), 0);
  const personas = [...new Set(visibles.map((t) => t.colaborador))];
  const causaDominante = [...porCausa].sort((a, b) => b.n - a.n)[0];

  // Evolución semanal (lunes → conteo por causa).
  const semanas = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      const w = lunesDe(t.fecha);
      if (!mapa.has(w)) mapa.set(w, { semana: w, total: 0 });
      const fila = mapa.get(w);
      fila[t.ovCausa] = (fila[t.ovCausa] || 0) + 1;
      fila.total += 1;
    }
    return [...mapa.values()].sort((a, b) => a.semana.localeCompare(b.semana));
  }, [visibles]);
  const maxSemana = Math.max(1, ...semanas.map((s) => s.total));

  // Por responsable (apilado por causa).
  const porResp = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      if (!mapa.has(t.colaborador)) mapa.set(t.colaborador, { nombre: t.colaborador, total: 0 });
      const fila = mapa.get(t.colaborador);
      fila[t.ovCausa] = (fila[t.ovCausa] || 0) + 1;
      fila.total += 1;
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [visibles]);
  const maxResp = Math.max(1, ...porResp.map((r) => r.total));

  // ---------- Export PDF del Tablero ejecutivo (27/08, pedido de Leonardo) ----------
  // Mismo patrón que el Reporte de incidentes: un iframe oculto con el HTML del
  // informe (datos del período incluidos) y window.print → «Guardar como PDF».
  // Los gráficos van como SVG inline: el fill se imprime SIEMPRE (los background
  // CSS dependen de que el navegador imprima fondos).
  const tableroIframeRef = useRef(null);
  const escT = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dmyT = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const NAVY_T = '#1F3864';
  const cuadrito = (color) => `<svg width="9" height="9" style="vertical-align:middle;margin-right:3px"><rect width="9" height="9" rx="2" fill="${color}"/></svg>`;
  const barraSvg = (frac, color) => `<svg width="130" height="9" style="vertical-align:middle"><rect width="130" height="9" rx="4" fill="#eef1f7"/><rect width="${Math.max(2, Math.round(frac * 130))}" height="9" rx="4" fill="${color}"/></svg>`;
  const periodoLabel = meses === 0 ? 'Personalizado' : (PERIODOS.find((p) => p.v === meses)?.t || '');
  const filtrosTxt = [
    fTipo ? `Tipo: ${TIPO[fTipo]?.label}` : null,
    fCausas.length ? `Causas: ${fCausas.map((id) => CAUSA[id]?.label).join(' + ')}` : null,
    fResp ? `Responsable: ${fResp}` : null,
  ].filter(Boolean).join(' · ') || 'Sin filtros (todo el período)';
  const htmlTablero = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Métricas OV - ${dmyT(desde)} a ${dmyT(hasta)}</title><style>
    *{box-sizing:border-box} body{font-family:Calibri,'Segoe UI',sans-serif;color:#222;margin:0;background:#fff;padding:24px}
    h1{font-size:19px;color:${NAVY_T};margin:0 0 2px} .sub{color:#8a8a00;font-weight:bold;font-size:12px;margin-bottom:14px}
    .sec{background:${NAVY_T};color:#fff;font-weight:bold;font-size:12px;padding:4px 8px;margin:14px 0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #9aa3b5;padding:4px 6px;text-align:left;vertical-align:middle}
    th{background:${NAVY_T};color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    td.lbl{background:#eef1f7;font-weight:bold;width:24%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    td.num{text-align:center} .nota{font-size:10px;color:#777;margin-top:6px} .pie{margin-top:18px;font-size:9px;color:#999;text-align:right}
    @page{size:A4;margin:14mm 12mm} @media print{body{padding:0}}
  </style></head><body>
  <h1>MÉTRICAS OFICINA VIRTUAL — INFORME</h1>
  <div class="sub">Tickets clasificados por tipo × causa · Tablero de Mando Cooptech</div>

  <div class="sec">1. DATOS DEL REPORTE</div>
  <table>
    <tr><td class="lbl">Período analizado</td><td>${dmyT(desde)} a ${dmyT(hasta)} (${escT(periodoLabel)})</td><td class="lbl">Emitido</td><td>${dmyT(isoDia(new Date()))}</td></tr>
    <tr><td class="lbl">Filtros aplicados</td><td>${escT(filtrosTxt)}</td><td class="lbl">Servicio</td><td>Oficina Virtual</td></tr>
    <tr><td class="lbl">Tickets clasificados</td><td>${visibles.length}</td><td class="lbl">Sin clasificar (fuera del informe)</td><td>${pendientes.length}</td></tr>
  </table>

  <div class="sec">2. INDICADORES DEL PERÍODO</div>
  <table>
    <tr><th>Tickets</th><th>Incidentes</th><th>Solicitudes</th><th>Horas estimadas</th><th>Personas</th><th>Causa dominante</th></tr>
    <tr>
      <td class="num">${visibles.length}</td>
      <td class="num">${totIncidentes}${visibles.length ? ` (${Math.round((totIncidentes / visibles.length) * 100)}%)` : ''}</td>
      <td class="num">${visibles.length - totIncidentes}</td>
      <td class="num">${fmtH(totHoras)}</td>
      <td class="num">${personas.length}</td>
      <td>${causaDominante?.n ? `${cuadrito(causaDominante.color)}${escT(causaDominante.label)} (${causaDominante.n})` : '—'}</td>
    </tr>
  </table>
  <div class="nota">Las horas combinan las cargadas en la grilla con un prorrateo de la jornada — es una estimación, no un parte de horas.</div>

  <div class="sec">3. ORIGEN DE LOS TICKETS POR CAUSA</div>
  <table>
    <tr><th>Causa</th><th>Tickets</th><th>% del total</th><th>Incid. / Solic.</th><th>Horas</th><th>Proporción</th></tr>
    ${porCausa.map((c) => `<tr>
      <td>${cuadrito(c.color)}${escT(c.label)}</td>
      <td class="num">${c.n}</td>
      <td class="num">${visibles.length ? Math.round((c.n / visibles.length) * 100) : 0}%</td>
      <td class="num">${c.incidentes} / ${c.solicitudes}</td>
      <td class="num">${fmtH(c.horas)}</td>
      <td>${barraSvg(visibles.length ? c.n / visibles.length : 0, c.color)}</td>
    </tr>`).join('')}
  </table>

  <div class="sec">4. EVOLUCIÓN SEMANAL POR CAUSA</div>
  ${semanas.length ? `<table>
    <tr><th>Semana del</th>${CAUSAS.map((c) => `<th>${cuadrito(c.color)}${escT(c.label.split(' ').slice(0, 2).join(' '))}…</th>`).join('')}<th>Total</th><th>Volumen</th></tr>
    ${semanas.map((s) => `<tr>
      <td>${dmyT(s.semana)}</td>
      ${CAUSAS.map((c) => `<td class="num">${s[c.id] || ''}</td>`).join('')}
      <td class="num"><b>${s.total}</b></td>
      <td>${barraSvg(s.total / maxSemana, NAVY_T)}</td>
    </tr>`).join('')}
  </table>` : '<p style="font-size:11px">Sin tickets clasificados en el período.</p>'}

  <div class="sec">5. POR RESPONSABLE</div>
  ${porResp.length ? `<table>
    <tr><th>Responsable</th>${CAUSAS.map((c) => `<th>${cuadrito(c.color)}</th>`).join('')}<th>Total</th><th>Proporción</th></tr>
    ${porResp.map((r) => `<tr>
      <td>${escT(r.nombre)}</td>
      ${CAUSAS.map((c) => `<td class="num">${r[c.id] || ''}</td>`).join('')}
      <td class="num"><b>${r.total}</b></td>
      <td>${barraSvg(r.total / maxResp, NAVY_T)}</td>
    </tr>`).join('')}
  </table>` : '<p style="font-size:11px">Sin datos.</p>'}

  <div class="sec">6. DETALLE POR TAREA</div>
  ${visibles.length ? `<table>
    <tr><th>Fecha</th><th>Responsable</th><th>Tarea / Ticket</th><th>Tipo</th><th>Causa</th><th>Horas</th><th>Origen</th></tr>
    ${[...visibles].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).map((t) => `<tr>
      <td style="white-space:nowrap">${dmyT(String(t.fecha || '').slice(0, 10))}</td>
      <td style="white-space:nowrap">${escT(t.colaborador)}</td>
      <td>${escT(String(t.text || '').slice(0, 160))}${String(t.text || '').length > 160 ? '…' : ''}</td>
      <td style="white-space:nowrap">${escT(TIPO[t.ovTipo]?.label || t.ovTipo || '—')}</td>
      <td>${t.ovCausa ? `${cuadrito(CAUSA[t.ovCausa]?.color || '#999')}${escT(CAUSA[t.ovCausa]?.label || t.ovCausa)}` : '—'}</td>
      <td class="num" style="white-space:nowrap">${fmtH(t.horas || 0)}</td>
      <td style="white-space:nowrap">${t.origen === 'grilla' || !t.origen ? 'Grilla' : t.origen === 'ticket_whatsapp' ? 'Ticket · WhatsApp' : t.origen === 'ticket_mesa' ? 'Ticket · Mesa' : 'Ticket'}</td>
    </tr>`).join('')}
  </table>
  <div class="nota">${visibles.length} tarea${visibles.length === 1 ? '' : 's'} en el período, ordenadas de la más reciente a la más antigua. Las horas son estimación (grilla + prorrateo).</div>` : '<p style="font-size:11px">Sin tareas clasificadas en el período.</p>'}

  <div class="pie">Generado desde el Tablero Cooptech · Métricas Oficina Virtual · ${dmyT(isoDia(new Date()))}</div>
  </body></html>`;
  const imprimirTablero = () => {
    const w = tableroIframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  // Asuntos que más se repiten (texto normalizado).
  const topAsuntos = useMemo(() => {
    const mapa = new Map();
    for (const t of visibles) {
      const k = norm(t.text);
      if (!mapa.has(k)) mapa.set(k, { texto: t.text, n: 0, causa: t.ovCausa });
      mapa.get(k).n += 1;
    }
    return [...mapa.values()].filter((a) => a.n > 1).sort((a, b) => b.n - a.n).slice(0, 10);
  }, [visibles]);

  // --- Sugerencias por palabras clave (motor en el frontend; reglas del server) ---
  const sugerir = (texto) => {
    const t = norm(texto);
    let tipo = ''; let causa = '';
    for (const r of reglas) {
      if (!r.contiene) continue;
      if (!t.includes(norm(r.contiene))) continue;
      if (!tipo && r.tipo) tipo = r.tipo;
      if (!causa && r.causa) causa = r.causa;
      if (tipo && causa) break;
    }
    return { tipo, causa };
  };

  const setSel = (itemId, campo, valor) => setSeleccion((s) => ({ ...s, [itemId]: { ...(s[itemId] || {}), [campo]: valor } }));
  const seleccionDe = (t) => {
    const s = seleccion[t.itemId] || {};
    const sug = sugerir(t.text);
    return { tipo: s.tipo ?? (t.ovTipo || sug.tipo || ''), causa: s.causa ?? (t.ovCausa || sug.causa || '') };
  };

  const clasificar = async (t, tipo, causa) => {
    if (!tipo || !causa) return;
    setGuardando(t.itemId);
    try {
      await api.analisisOv.clasificar({ entradaId: t.entradaId, itemId: t.itemId, tipo, causa });
      setTickets((ls) => ls.map((x) => (x.itemId === t.itemId ? { ...x, ovTipo: tipo, ovCausa: causa, ovDescartado: false } : x)));
    } catch (e) { alert(e.message || 'No se pudo clasificar'); }
    finally { setGuardando(null); }
  };
  const descartar = async (t) => {
    setGuardando(t.itemId);
    try {
      await api.analisisOv.descartar({ entradaId: t.entradaId, itemId: t.itemId });
      setTickets((ls) => ls.map((x) => (x.itemId === t.itemId ? { ...x, ovDescartado: true } : x)));
    } catch (e) { alert(e.message || 'No se pudo descartar'); }
    finally { setGuardando(null); }
  };
  const aplicarTodas = async () => {
    const listas = pendientes.map((t) => ({ t, sel: seleccionDe(t) })).filter(({ sel }) => sel.tipo && sel.causa);
    if (!listas.length) { alert('Ninguna pendiente tiene sugerencia completa (tipo + causa).'); return; }
    if (!confirm(`Se van a clasificar ${listas.length} ticket(s) con su sugerencia actual. ¿Continuar?`)) return;
    setAplicandoTodas(true);
    try {
      for (const { t, sel } of listas) {
        // secuencial: cada uno hace merge puntual sobre su entrada
        // eslint-disable-next-line no-await-in-loop
        await api.analisisOv.clasificar({ entradaId: t.entradaId, itemId: t.itemId, tipo: sel.tipo, causa: sel.causa });
      }
      cargar();
    } catch (e) { alert(e.message || 'Se interrumpió la aplicación (los ya clasificados quedaron)'); cargar(); }
    finally { setAplicandoTodas(false); }
  };

  // --- Piezas de UI ---
  const Kpi = ({ label, valor, sub, onClick, alerta }) => (
    <div onClick={onClick}
      className={`bg-white border rounded-xl p-3 ${onClick ? 'cursor-pointer hover:border-coop-azul' : ''} ${alerta ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-xl font-semibold ${alerta ? 'text-amber-600' : 'text-coop-negro'}`}>{valor}</p>
      {sub && <p className="text-[10.5px] text-slate-400">{sub}</p>}
    </div>
  );
  const Leyenda = () => (
    <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
      {CAUSAS.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c.color }} />{c.label}
        </span>
      ))}
    </div>
  );
  const Tarjeta = ({ titulo, nota, children }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
      {nota && <p className="text-[10.5px] text-slate-400 mb-2">{nota}</p>}
      {!nota && <div className="mb-2" />}
      {children}
    </div>
  );

  const chipTag = (t, i) => (
    <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-coop-azul/10 text-coop-azul text-[10px] mr-1">{t}</span>
  );

  return (
    <div className="p-4">
      <div className="flex items-end justify-between flex-wrap gap-2 mb-1">
        <h2 className="text-lg font-semibold text-slate-800">Métricas Oficina Virtual <span className="text-sm font-normal text-slate-400">· tickets clasificados por tipo × causa</span></h2>
        <div className="flex flex-wrap gap-1.5 items-center">
          {[
            { id: 'tablero', label: 'Tablero ejecutivo' },
            { id: 'reporte', label: 'Reporte de incidentes' },
          ].map((s) => (
            <button key={s.id} onClick={() => { setVista(s.id); setMenuAjustes(false); }}
              className={`px-3 py-1.5 text-sm rounded-full border whitespace-nowrap ${vista === s.id ? 'bg-coop-azul text-white border-coop-azul font-medium' : 'bg-white text-slate-600 border-slate-200 hover:border-coop-azul'}`}>
              {s.label}
            </button>
          ))}
          {/* Cuando estás en una herramienta del ⚙, se ve dónde estás parado. */}
          {(vista === 'bandeja' || vista === 'detalle') && (
            <span className="px-3 py-1.5 text-sm rounded-full bg-coop-azul text-white font-medium whitespace-nowrap">
              {vista === 'bandeja' ? 'Bandeja de clasificación' : 'Detalle'}
            </span>
          )}
          <div className="relative">
            <button onClick={() => setMenuAjustes((m) => !m)} title="Herramientas de clasificación y control"
              className={`px-2.5 py-1.5 text-sm rounded-full border ${menuAjustes || vista === 'bandeja' || vista === 'detalle' ? 'border-coop-azul text-coop-azul' : 'bg-white text-slate-500 border-slate-200 hover:border-coop-azul'}`}>
              ⚙{pendientes.length ? <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{pendientes.length}</span> : null}
            </button>
            {menuAjustes && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-60">
                {[
                  { id: 'bandeja', label: `Bandeja de clasificación${pendientes.length ? ` (${pendientes.length})` : ''}` },
                  { id: 'detalle', label: 'Detalle (control cruzado)' },
                ].map((s) => (
                  <button key={s.id} onClick={() => { setVista(s.id); setMenuAjustes(false); }}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${vista === s.id ? 'text-coop-azul font-medium' : 'text-slate-600'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">
        1 ítem de grilla = 1 ticket (mide intervenciones, no pedidos únicos). Las horas combinan las cargadas en la grilla con un prorrateo de la jornada — <b>es una estimación, no un parte de horas</b>.
      </p>

      {/* Filtros en una sola fila (rigen tablero y detalle) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {PERIODOS.map((p) => <option key={p.v} value={p.v}>{p.t}</option>)}
        </select>
        {meses === 0 && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={customDesde} max={customHasta} onChange={(e) => setCustomDesde(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
            <span className="text-slate-400 text-xs">→</span>
            <input type="date" value={customHasta} min={customDesde} onChange={(e) => setCustomHasta(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm" />
          </span>
        )}
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Tipo: todos</option>
          {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {/* Causas tildables y combinables (27/08). Vacío = todas. */}
        <div className="relative">
          <button onClick={() => setMenuCausas((m) => !m)}
            className={`border rounded-lg px-2 py-1.5 text-sm ${fCausas.length ? 'border-coop-azul text-coop-azul bg-coop-azul/5' : 'border-slate-300 text-slate-600 bg-white'}`}>
            Causas: {fCausas.length ? `${fCausas.length} de ${CAUSAS.length}` : 'todas'} ▾
          </button>
          {menuCausas && (
            <>
              <div className="fixed inset-0 z-10" onMouseDown={(e) => e.target === e.currentTarget && setMenuCausas(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-xl shadow-lg py-1 w-80">
                {CAUSAS.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" checked={fCausas.includes(c.id)} onChange={() => toggleCausa(c.id)} />
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                    <span className="text-slate-700">{c.label}</span>
                  </label>
                ))}
                {fCausas.length > 0 && (
                  <button onClick={() => setFCausas([])} className="block w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-t border-slate-100">Limpiar (todas)</button>
                )}
              </div>
            </>
          )}
        </div>
        <select value={fResp} onChange={(e) => setFResp(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="">Responsable: todos</option>
          {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {cargando && <span className="text-xs text-slate-400">⏳ Cargando…</span>}
        {vista === 'tablero' && (
          <button onClick={imprimirTablero} title="Exportar este informe como PDF (elegí «Guardar como PDF» en el diálogo)"
            className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-coop-azul text-white hover:opacity-90">🖨 Imprimir / PDF</button>
        )}
      </div>

      {/* ============ TABLERO EJECUTIVO ============ */}
      {/* Iframe oculto con el informe imprimible del tablero (27/08). */}
      {vista === 'tablero' && (
        <iframe ref={tableroIframeRef} srcDoc={htmlTablero} title={`Métricas OV - ${desde} a ${hasta}`}
          style={{ position: 'fixed', right: -10000, top: 0, width: 800, height: 600, border: 'none' }} aria-hidden="true" />
      )}
      {vista === 'tablero' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">
            <Kpi label="Tickets" valor={visibles.length} sub={`${desde ? `desde ${fmtFecha(desde)}` : ''}`} />
            <Kpi label="Incidentes" valor={totIncidentes} sub={visibles.length ? `${Math.round((totIncidentes / visibles.length) * 100)}% del total` : '—'} />
            <Kpi label="Solicitudes" valor={visibles.length - totIncidentes} sub={visibles.length ? `${100 - Math.round((totIncidentes / visibles.length) * 100)}% del total` : '—'} />
            <Kpi label="Horas estimadas" valor={fmtH(totHoras)} sub="reales + prorrateo" />
            <Kpi label="Personas involucradas" valor={personas.length} sub={personas.length ? `${(visibles.length / personas.length).toFixed(1)} tickets/persona` : '—'} />
            <Kpi label="Causa dominante" valor={causaDominante?.n ? CAUSA[causaDominante.id].label.split(' ')[0] : '—'} sub={causaDominante?.n ? `${causaDominante.n} tickets` : 'sin datos'} />
            <Kpi label="Sin clasificar" valor={pendientes.length} sub={pendientes.length ? 'ir a la bandeja →' : 'todo clasificado ✓'} alerta={pendientes.length > 0} onClick={() => setVista('bandeja')} />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <Tarjeta titulo="Evolución semanal por causa" nota="cantidad de tickets por semana (lunes a domingo)">
              <div className="flex items-end gap-1 h-40">
                {/* h-full en la columna (26/08, fix del gráfico «se ve feo»): sin alto
                    definido, los height:% de los segmentos se resolvían contra NADA y
                    todas las barras colapsaban al min-h de 2px. Con h-full, la semana
                    de mayor total llena el canvas y el resto escala proporcional. */}
                {semanas.map((s) => (
                  <div key={s.semana} className="flex-1 h-full flex flex-col justify-end gap-px" title={`Semana del ${fmtFecha(s.semana)}: ${s.total} tickets`}>
                    {CAUSAS.map((c) => (s[c.id] ? (
                      <div key={c.id} style={{ height: `${(s[c.id] / maxSemana) * 100}%`, background: c.color }} className="rounded-sm min-h-[2px]" />
                    ) : null))}
                  </div>
                ))}
                {semanas.length === 0 && <p className="text-xs text-slate-400 m-auto">Sin tickets clasificados en el período.</p>}
              </div>
              {semanas.length > 0 && (
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{fmtFecha(semanas[0].semana)}</span><span>{fmtFecha(semanas[semanas.length - 1].semana)}</span>
                </div>
              )}
              <div className="mt-2"><Leyenda /></div>
            </Tarjeta>

            <Tarjeta titulo="¿De dónde vienen los tickets?" nota="ranking por causa, % del total clasificado">
              {porCausa.filter((c) => c.n).sort((a, b) => b.n - a.n).map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{c.label}</span><span className="text-slate-400">{c.n} · {visibles.length ? Math.round((c.n / visibles.length) * 100) : 0}%</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${visibles.length ? (c.n / visibles.length) * 100 : 0}%`, background: c.color }} />
                  </div>
                </div>
              ))}
              {!visibles.length && <p className="text-xs text-slate-400">Sin datos con estos filtros.</p>}
            </Tarjeta>

            <Tarjeta titulo="Incidente vs. solicitud" nota="composición por causa — cuanto más rojo, más apagar incendios">
              {porCausa.filter((c) => c.n).map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{c.label}</span>
                    <span className="text-slate-400">{c.incidentes} inc · {c.solicitudes} sol</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${(c.incidentes / c.n) * 100}%`, background: TIPO.incidente.color }} />
                    <div style={{ width: `${(c.solicitudes / c.n) * 100}%`, background: TIPO.solicitud.color }} />
                  </div>
                </div>
              ))}
              <div className="flex gap-3 text-[11px] text-slate-500 mt-1">
                {TIPOS.map((t) => <span key={t.id} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />{t.label}</span>)}
              </div>
            </Tarjeta>

            <Tarjeta titulo="Esfuerzo por causa" nota="horas estimadas (reales + prorrateo) — acá se ve el «pocos tickets, muchas horas»">
              {(() => {
                const maxH = Math.max(1, ...porCausa.map((c) => c.horas));
                return porCausa.filter((c) => c.horas > 0).sort((a, b) => b.horas - a.horas).map((c) => (
                  <div key={c.id} className="mb-2">
                    <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                      <span>{c.label}</span><span className="text-slate-400">{fmtH(c.horas)} h</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.horas / maxH) * 100}%`, background: c.color }} />
                    </div>
                  </div>
                ));
              })()}
              {!totHoras && <p className="text-xs text-slate-400">Sin horas en el período.</p>}
            </Tarjeta>

            <Tarjeta titulo="Quién lo atiende" nota="tickets por responsable, apilados por causa">
              {porResp.map((r) => (
                <div key={r.nombre} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                    <span>{r.nombre}</span><span className="text-slate-400">{r.total}</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex" style={{ width: `${(r.total / maxResp) * 100}%` }}>
                    {CAUSAS.map((c) => (r[c.id] ? <div key={c.id} style={{ width: `${(r[c.id] / r.total) * 100}%`, background: c.color }} /> : null))}
                  </div>
                </div>
              ))}
              {!porResp.length && <p className="text-xs text-slate-400">Sin datos con estos filtros.</p>}
            </Tarjeta>

            <Tarjeta titulo="Asuntos que más se repiten" nota="top 10 de textos repetidos — la lista corta de dónde poner la mano">
              {topAsuntos.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs border-t border-slate-100 py-1 first:border-t-0">
                  <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[11px] shrink-0" style={{ background: CAUSA[a.causa]?.color || '#94a3b8' }}>{a.n}</span>
                  <span className="text-slate-600">{a.texto}</span>
                </div>
              ))}
              {!topAsuntos.length && <p className="text-xs text-slate-400">Sin asuntos repetidos en el período (o falta clasificar).</p>}
            </Tarjeta>
          </div>
        </>
      )}

      {/* ============ BANDEJA DE CLASIFICACIÓN ============ */}
      {vista === 'bandeja' && (
        <div>
          <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
            <p className="text-sm text-slate-500 flex-1 min-w-[260px]">
              Pendientes de clasificar: <b>{pendientes.length}</b>. Los selectores vienen precargados con la <b>sugerencia por palabras clave</b> — confirmá o corregí. Los de solo «Coopmorteros» llevan el chip ámbar: validá si son de Oficina Virtual.
            </p>
            <button onClick={aplicarTodas} disabled={aplicandoTodas || !pendientes.length}
              className="px-3 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-40 shrink-0">
              {aplicandoTodas ? '⏳ Aplicando…' : '⚡ Aplicar todas las sugerencias'}
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {pendientes.map((t) => {
              const sel = seleccionDe(t);
              return (
                <div key={t.itemId} className="p-2.5 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[240px]">
                    <p className="text-xs text-slate-400">{fmtFecha(t.fecha)} · {t.colaborador}{!t.directo && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">validar si es de OV</span>}</p>
                    <p className="text-sm text-slate-700">{t.text}</p>
                    <div className="mt-0.5">{t.tags.map(chipTag)}</div>
                  </div>
                  <select value={sel.tipo} onChange={(e) => setSel(t.itemId, 'tipo', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-xs ${sel.tipo ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">— Tipo —</option>
                    {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <select value={sel.causa} onChange={(e) => setSel(t.itemId, 'causa', e.target.value)}
                    className={`border rounded-lg px-2 py-1.5 text-xs ${sel.causa ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}>
                    <option value="">— Causa —</option>
                    {CAUSAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <button onClick={() => clasificar(t, sel.tipo, sel.causa)} disabled={!sel.tipo || !sel.causa || guardando === t.itemId}
                    className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:opacity-90 disabled:opacity-40">
                    {guardando === t.itemId ? '…' : 'Confirmar'}
                  </button>
                  <button onClick={() => descartar(t)} disabled={guardando === t.itemId}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50 disabled:opacity-40">
                    No es de OV
                  </button>
                </div>
              );
            })}
            {!pendientes.length && <p className="p-6 text-center text-sm text-slate-400">🎉 Bandeja vacía: todo lo del período está clasificado.</p>}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            «No es de OV» saca el ítem del tablero (reversible desde el Detalle). Las reglas de sugerencia viven en el servidor y se pueden ampliar sin redeploy. Consejo: clasificá desde el editor del día al cargar la grilla — el ticket nace clasificado y esta bandeja no acumula.
          </p>
        </div>
      )}

      {/* ============ DETALLE ============ */}
      {vista === 'detalle' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 bg-slate-50">
                  <th className="px-2 py-1.5 font-medium">Fecha</th>
                  <th className="px-2 py-1.5 font-medium">Responsable</th>
                  <th className="px-2 py-1.5 font-medium">Ticket</th>
                  <th className="px-2 py-1.5 font-medium">Tipo</th>
                  <th className="px-2 py-1.5 font-medium">Causa</th>
                  <th className="px-2 py-1.5 font-medium text-right">Horas</th>
                  <th className="px-2 py-1.5 font-medium">Clasificó</th>
                  <th className="px-2 py-1.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const enEdicion = editando === t.itemId;
                  return (
                  <tr key={t.itemId} className={`border-t border-slate-100 ${enEdicion ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtFecha(t.fecha)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{t.colaborador}</td>
                    <td className="px-2 py-1.5">
                      {t.text}
                      {/* Fuente Tickets (20/08, Inbox): chip de origen */}
                      {t.origen && t.origen !== 'grilla' && (
                        <span className="ml-1 inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px]">
                          {t.origen === 'ticket_whatsapp' ? 'Ticket · WhatsApp' : t.origen === 'ticket_mesa' ? 'Ticket · Mesa de ayuda' : 'Ticket'}
                        </span>
                      )}
                      <div>{t.tags.map(chipTag)}</div>
                    </td>
                    {/* Re-clasificación EN LA FILA (19/08): el ✎ convierte los
                        chips en selectores — sin volver a la bandeja. */}
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {enEdicion ? (
                        <select value={borrador.tipo} onChange={(e) => setBorrador((b) => ({ ...b, tipo: e.target.value }))}
                          className="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white">
                          {TIPOS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      ) : <span className="px-1.5 py-0.5 rounded text-white text-[10px]" style={{ background: TIPO[t.ovTipo]?.color }}>{TIPO[t.ovTipo]?.label}</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {enEdicion ? (
                        <select value={borrador.causa} onChange={(e) => setBorrador((b) => ({ ...b, causa: e.target.value }))}
                          className="border border-slate-300 rounded px-1 py-0.5 text-[11px] bg-white">
                          {CAUSAS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      ) : <span className="px-1.5 py-0.5 rounded text-white text-[10px]" style={{ background: CAUSA[t.ovCausa]?.color }}>{CAUSA[t.ovCausa]?.label}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">{fmtH(t.horas)}{t.horasReales ? '' : ' *'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-400">{t.ovPor || '—'}{t.ovFecha ? ` · ${fmtFecha(t.ovFecha)}` : ''}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      {enEdicion ? (
                        <span className="inline-flex items-center gap-1">
                          <button onClick={async () => { await clasificar(t, borrador.tipo, borrador.causa); setEditando(null); }}
                            disabled={guardando === t.itemId || !borrador.tipo || !borrador.causa}
                            className="px-2 py-0.5 text-[11px] rounded bg-coop-azul text-white disabled:opacity-40">{guardando === t.itemId ? '…' : 'Guardar'}</button>
                          <button onClick={async () => { await descartar(t); setEditando(null); }} disabled={guardando === t.itemId}
                            title="Lo saca de las métricas (reversible desde «Ver descartados»)"
                            className="px-2 py-0.5 text-[11px] rounded border border-slate-300 text-slate-500 hover:bg-slate-50">No es de OV</button>
                          <button onClick={() => setEditando(null)} className="px-1.5 py-0.5 text-[11px] rounded text-slate-400 hover:text-slate-600">✕</button>
                        </span>
                      ) : (t.origen && t.origen !== 'grilla') ? (
                        // Los tickets del Inbox se re-clasifican allá (PATCH /tickets),
                        // no por /analisis/ov/clasificar (que edita ítems de grilla).
                        <span className="text-[10px] text-slate-300" title="Se clasifica desde Inbox → Tickets">Inbox</span>
                      ) : (
                        <button onClick={() => { setEditando(t.itemId); setBorrador({ tipo: t.ovTipo || '', causa: t.ovCausa || '' }); }}
                          title="Re-clasificar este ticket" className="px-1.5 py-0.5 text-[12px] rounded text-slate-400 hover:text-coop-azul hover:bg-slate-100">✎</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {!visibles.length && <tr><td colSpan={8} className="p-6 text-center text-slate-400">Sin tickets clasificados con estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 px-2 py-1.5 border-t border-slate-100">
            <p className="text-[10.5px] text-slate-400">* horas por prorrateo de la jornada (estimación). Descartados en el período: {tickets.filter((t) => t.ovDescartado).length}.</p>
            {tickets.some((t) => t.ovDescartado) && (
              <details>
                <summary className="text-[10.5px] text-slate-400 cursor-pointer">Ver descartados (reversible)</summary>
                <div className="mt-1 space-y-1">
                  {tickets.filter((t) => t.ovDescartado).map((t) => (
                    <div key={t.itemId} className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{fmtFecha(t.fecha)} · {t.colaborador} · {t.text}</span>
                      <button onClick={async () => { await api.analisisOv.descartar({ entradaId: t.entradaId, itemId: t.itemId, descartado: false }); cargar(); }}
                        className="text-coop-azul hover:underline">restaurar</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {vista === 'reporte' && <ReporteSemanalOV api={api} />}
    </div>
  );
}

// ─────────────────── Reporte semanal a Gerencia General (26/08) ───────────────────
// Mandato M1 · Oficina Virtual — Estabilización. Se genera desde los TICKETS
// clasificados como incidente (Inbox), con el formato de la plantilla real de
// Sofía/Alexis. La vista previa ES el documento: un iframe con el HTML final
// (mismo srcDoc que se imprime), y «Imprimir / PDF» dispara el print del
// iframe con @page A4 — el navegador lo guarda como PDF tal cual se ve.
const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function ReporteSemanalOV({ api }) {
  const [tickets, setTickets] = useState([]);
  const iframeRef = useRef(null);
  // Emisión: viernes. Default = el viernes de esta semana (o el próximo).
  const [emision, setEmision] = useState(() => {
    const d = new Date();
    const delta = (5 - d.getDay() + 7) % 7; // 5 = viernes
    d.setDate(d.getDate() + delta);
    return isoDia(d);
  });
  const [nro, setNro] = useState(`OV-${new Date().getFullYear()}-`);
  const [duenio, setDuenio] = useState('Sofía Vannucchi – Alexis Prado');
  const [prov, setProv] = useState('IT & Development');

  useEffect(() => {
    api.tickets.list().then((r) => setTickets(r.tickets || [])).catch(() => setTickets([]));
  }, [api]);

  // Período del mandato: viernes anterior → jueves (el día previo a la emisión).
  const hastaJ = sumarDias(emision, -1);
  const desdeV = sumarDias(emision, -7);
  const fechaDe = (t) => String(t.ocurridoAt || t.createdAt || '').slice(0, 10);
  const incidentes = tickets.filter((t) => t.ovTipo === 'incidente' && fechaDe(t) <= hastaJ);
  const enSemana = incidentes.filter((t) => fechaDe(t) >= desdeV);
  const semanaPrev = incidentes.filter((t) => fechaDe(t) >= sumarDias(desdeV, -7) && fechaDe(t) <= sumarDias(hastaJ, -7));
  const en90 = incidentes.filter((t) => fechaDe(t) >= sumarDias(hastaJ, -89));
  // Días corridos sin incidente (condición de salida: 30). Todo incidente reinicia a 0.
  const ultima = incidentes.map(fechaDe).sort().pop() || null;
  const diasSin = ultima
    ? Math.min(30, Math.max(0, Math.round((new Date(`${hastaJ}T12:00Z`) - new Date(`${ultima}T12:00Z`)) / 86400000)))
    : 30;

  const CATS = [
    { id: 'a', label: '(a) Falla de desarrollo propio' },
    { id: 'b', label: '(b) Falla de integración con ERP' },
    { id: 'c', label: '(c) Falla botón de pago (tercero)' },
  ];
  const deCat = (lista, c) => lista.filter((t) => t.categoriaFalla === c);
  // Semáforo del criterio: verde = sin incidentes en la semana; amarillo =
  // incidentes todos resueltos al cierre; rojo = alguno pendiente al cierre.
  const semaforo = (c) => {
    const sem = deCat(enSemana, c);
    if (!sem.length) return { color: '#2E9E5B', txt: 'Verde' };
    return sem.every((t) => t.resueltoAt) ? { color: '#E0A800', txt: 'Amarillo' } : { color: '#D6453F', txt: 'Rojo' };
  };
  const tendencia = (c) => {
    const a = deCat(enSemana, c).length, b = deCat(semanaPrev, c).length;
    return a > b ? '↑' : a < b ? '↓' : '=';
  };
  const tipoDe = (t) => (t.origen === 'whatsapp' ? 'Recl. asociado' : t.origen === 'mesa_ayuda' ? 'Recl. interno' : 'Recl. interno');
  const tResol = (t) => {
    if (!t.resueltoAt) return 'Pend.';
    const h = Math.round((new Date(t.resueltoAt) - new Date(t.ocurridoAt || t.createdAt)) / 3600000);
    return h >= 0 ? `${h} h` : '—';
  };
  const sinCategoria = enSemana.filter((t) => !t.categoriaFalla).length;

  const NAVY = '#1F3864';
  // El <title> del iframe es el NOMBRE DE ARCHIVO que propone el navegador al
  // «Guardar como PDF» (27/08, pedido de Leonardo: «Reporte semanal - N°»).
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte semanal - ${escHtml(nro.trim() || 'OV')}</title><style>
    *{box-sizing:border-box} body{font-family:Calibri,'Segoe UI',sans-serif;color:#222;margin:0;background:#fff;padding:24px}
    h1{font-size:19px;color:${NAVY};margin:0 0 2px} .sub{color:#8a8a00;font-weight:bold;font-size:12px;margin-bottom:14px}
    .sec{background:${NAVY};color:#fff;font-weight:bold;font-size:12px;padding:4px 8px;margin:14px 0 6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #9aa3b5;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:${NAVY};color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    td.lbl{background:#eef1f7;font-weight:bold;width:22%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .contador{display:flex;justify-content:space-between;align-items:center;border:2px solid ${NAVY};margin-top:10px}
    .contador .txt{padding:8px 10px;font-size:11px} .contador .dia{padding:8px 16px;font-size:22px;font-weight:bold;color:${NAVY};white-space:nowrap}
    .defbox{background:#FEF7DC;border:1px solid #E8D48B;padding:8px 10px;font-size:10.5px;margin-top:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .dot{vertical-align:middle;margin-right:3px}
    .criterio{font-size:9.5px;color:#555;margin-top:4px} .nota{font-size:10px;color:#777;margin-top:6px}
    .pie{margin-top:18px;font-size:9px;color:#999;text-align:right}
    @page{size:A4;margin:14mm 12mm} @media print{body{padding:0}}
  </style></head><body>
  <h1>REPORTE SEMANAL A GERENCIA GENERAL</h1>
  <div class="sub">Mandato M1 · Oficina Virtual — Estabilización</div>

  <div class="sec">1. DATOS DEL REPORTE</div>
  <table>
    <tr><td class="lbl">N° de reporte</td><td>${escHtml(nro)}</td><td class="lbl">Fecha de emisión</td><td>Viernes ${dmy(emision)}</td></tr>
    <tr><td class="lbl">Período cubierto</td><td>Viernes ${dmy(desdeV)} a jueves ${dmy(hastaJ)}</td><td class="lbl">Servicio</td><td>Oficina Virtual</td></tr>
    <tr><td class="lbl">Dueño del servicio</td><td>${escHtml(duenio)}</td><td class="lbl">Proveedor interno</td><td>${escHtml(prov)}</td></tr>
  </table>
  <div class="contador">
    <div class="txt"><b>DÍAS CORRIDOS SIN INCIDENTE</b><br>Condición de salida del mandato: 30 días corridos sin incidente. Todo incidente reinicia el contador a cero.</div>
    <div class="dia">Día ${diasSin} <span style="font-size:12px;font-weight:normal">de 30</span></div>
  </div>
  <div class="defbox"><b>Definición de incidente</b><br>Se computa como incidente cualquiera de los siguientes eventos: (1) indisponibilidad total o parcial de la Oficina Virtual; (2) reclamo de asociado vinculado al servicio, verificado por Atención al Cliente; (3) reclamo interno a IT efectuado por un colaborador de la cooperativa. Cada evento se registra una única vez y se clasifica en una de las tres categorías del mandato.</div>

  <div class="sec">2. ESTADO POR CATEGORÍA DE FALLA</div>
  <table>
    <tr><th>Categoría</th><th>Estado</th><th>Incidentes semana</th><th>Acumulado 90 días</th><th>Tendencia</th></tr>
    ${CATS.map((c) => {
      const s = semaforo(c.id);
      // Semáforo como SVG inline (27/08, fix «el PDF pierde el color del estado»):
      // un background CSS depende de que el navegador imprima fondos; el fill de
      // un SVG se imprime SIEMPRE, con o sin «gráficos de fondo» tildado.
      return `<tr><td>${c.label}</td><td><svg class="dot" width="11" height="11"><circle cx="5.5" cy="5.5" r="5" fill="${s.color}" stroke="#777" stroke-width="0.5"/></svg>${s.txt}</td><td>${deCat(enSemana, c.id).length}</td><td>${deCat(en90, c.id).length}</td><td>${tendencia(c.id)}</td></tr>`;
    }).join('')}
  </table>
  <div class="criterio"><b>Criterio del semáforo:</b> Verde = sin incidentes en la semana · Amarillo = incidentes de la semana resueltos al cierre del período · Rojo = incidente pendiente de resolución al cierre del período.</div>
  ${sinCategoria ? `<div class="nota">⚠ ${sinCategoria} incidente(s) de la semana sin categoría a/b/c asignada — clasificalos en Inbox → Tickets para que sumen a la tabla.</div>` : ''}

  <div class="sec">3. INCIDENTES DEL PERÍODO</div>
  ${enSemana.length ? `<table>
    <tr><th>Fecha</th><th>Descripción del incidente</th><th>Categoría</th><th>Tipo</th><th>T. resolución</th><th>Causa raíz identif.</th></tr>
    ${enSemana.map((t) => `<tr><td>${dmy(fechaDe(t))}</td><td><b>${escHtml(t.titulo)}</b>${t.descripcion ? `<br>${escHtml(String(t.descripcion).slice(0, 220))}${String(t.descripcion).length > 220 ? '…' : ''}` : ''}</td><td style="text-align:center">${t.categoriaFalla || '—'}</td><td>${tipoDe(t)}</td><td>${tResol(t)}</td><td>${t.ovCausa ? 'Sí' : 'No'}</td></tr>`).join('')}
  </table>` : '<p style="font-size:11px"><b>☐ Sin incidentes registrados en el período.</b></p>'}

  <div class="pie">Generado desde el Tablero Cooptech · Inbox de tickets · ${dmy(isoDia(new Date()))}</div>
  </body></html>`;

  const imprimir = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  return (
    <div>
      <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-slate-500">Fecha de emisión (viernes)</label>
          <input type="date" value={emision} onChange={(e) => setEmision(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">N° de reporte</label>
          <input value={nro} onChange={(e) => setNro(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-32" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Dueño del servicio</label>
          <input value={duenio} onChange={(e) => setDuenio(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-64" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Proveedor interno</label>
          <input value={prov} onChange={(e) => setProv(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-44" />
        </div>
        <button onClick={imprimir} className="ml-auto px-4 py-2 text-sm rounded-lg bg-coop-azul text-white hover:opacity-90">🖨 Imprimir / PDF</button>
      </div>
      <p className="text-xs text-slate-400 mb-2">
        La vista previa ES el documento: «Imprimir / PDF» abre el diálogo del sistema — elegí <b>«Guardar como PDF»</b> y sale tal cual se ve (A4).
        Los incidentes salen de Inbox → Tickets (clasificados como incidente, período viernes a jueves).
      </p>
      <iframe ref={iframeRef} srcDoc={html} title="Reporte semanal OV"
        className="w-full bg-white border border-slate-200 rounded-xl" style={{ height: 1050 }} />
    </div>
  );
}
