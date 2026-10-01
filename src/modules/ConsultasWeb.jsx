import { useEffect, useState } from 'react';
import { Globe, RotateCcw } from 'lucide-react';

// Bandeja «Consultas web» del CRM (28/09): lo que entra por el formulario
// público de la landing (config del simulador CoopCloud, reconectadores,
// plantas de agua o contacto general). Decisión Leonardo: NADA entra al
// embudo solo — «Convertir en lead» abre el formulario +Lead PRECARGADO
// (reusa sus validaciones y obligatorios) y al guardar la consulta queda
// marcada como convertida, con el lead vinculado.

const PRODUCTO_LABEL = {
  coopcloud: 'CoopCloud', reconecta: 'Reconecta', 'mas-agua': '+Agua',
  centinela: 'Centinela', 'oficina-virtual': 'Oficina Virtual', desarrollos: 'Desarrollos', general: 'General',
};
const CAMPOS_DETALLE = {
  plan: 'Plan', vcpu: 'vCPU', ram: 'RAM (GB)', discoGb: 'Disco (GB)', tipoDisco: 'Tipo de disco',
  bwMbps: 'Ancho de banda (Mbps)', ips: 'IPs públicas', snapshotCadaHs: 'Snapshot cada (hs)',
  retencionDias: 'Retención (días)', precioEstimado: 'Precio estimado (US$)',
  cantidad: 'Reconectadores', marcaModelo: 'Marca / modelo', estadoActual: 'Cómo los operan hoy',
  plantas: 'Plantas', pozos: 'Pozos / perforaciones', osmosis: 'Ósmosis', telemetriaActual: 'Telemetría actual',
};

export function detalleLineas(c) {
  let d = null;
  try { d = c.detalle ? JSON.parse(c.detalle) : null; } catch { d = null; }
  if (!d || typeof d !== 'object') return [];
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== '' && v !== undefined)
    .map(([k, v]) => `${CAMPOS_DETALLE[k] || k}: ${v}`);
}

export default function ConsultasWeb({ open, api, onCerrar, onConvertir, onCambioNuevas }) {
  const [consultas, setConsultas] = useState(null);
  const [filtro, setFiltro] = useState('nueva'); // nueva | todas
  const [descartando, setDescartando] = useState(null);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      const r = await api.landingConsultas.list(filtro === 'nueva' ? 'nueva' : undefined);
      setConsultas(r?.data || []);
      onCambioNuevas && onCambioNuevas(r?.nuevas ?? 0);
      setError('');
    } catch (e) { setConsultas([]); setError(e.message || 'No se pudo cargar la bandeja'); }
  };
  useEffect(() => { if (open) cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, filtro]);

  if (!open) return null;

  const cambiarEstado = async (c, estado) => {
    try { await api.landingConsultas.actualizar(c.id, { estado }); setDescartando(null); cargar(); }
    catch (e) { setError(e.message || 'No se pudo actualizar'); }
  };

  const Chip = ({ c }) => c.estado === 'convertida'
    ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">Convertida{c.leadId ? ` · lead #${c.leadId}` : ''}</span>
    : c.estado === 'descartada'
      ? <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 shrink-0">Descartada</span>
      : <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">Nueva</span>;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-3" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <Globe size={16} className="text-coop-azul" />
          <span className="text-sm font-medium text-coop-negro">Consultas web</span>
          <div className="flex gap-1 ml-2">
            {[['nueva', 'Nuevas'], ['todas', 'Todas']].map(([v, l]) => (
              <button key={v} onClick={() => setFiltro(v)}
                className={`text-xs px-2.5 py-1 rounded-full ${filtro === v ? 'bg-coop-azul text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{l}</button>
            ))}
          </div>
          <button onClick={onCerrar} className="ml-auto text-slate-500 hover:bg-slate-100 rounded px-2 py-1">✕</button>
        </div>
        <div className="p-3 overflow-y-auto flex-1">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {consultas === null ? <p className="text-sm text-slate-400">Cargando…</p>
            : consultas.length === 0 ? (
              <p className="text-sm text-slate-300 text-center py-8">
                {filtro === 'nueva' ? 'Sin consultas nuevas — lo que llegue desde la landing aparece acá.' : 'Todavía no llegó ninguna consulta desde la landing.'}
              </p>
            ) : (
              <div className="grid gap-2">
                {consultas.map((c) => {
                  const lineas = detalleLineas(c);
                  return (
                    <div key={c.id} className={`border border-slate-200 rounded-xl p-3 ${c.estado !== 'nueva' ? 'opacity-70' : ''}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">{PRODUCTO_LABEL[c.producto] || c.producto}</span>
                        <span className="text-sm font-medium text-coop-negro truncate">{c.organizacion}</span>
                        {c.localidad && <span className="text-xs text-slate-400 shrink-0">· {c.localidad}</span>}
                        <Chip c={c} />
                        <span className="ml-auto text-[11px] text-slate-300 shrink-0">{c.createdAt ? new Date(c.createdAt).toLocaleString('es-AR') : ''}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {[c.contacto, c.email, c.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                      </p>
                      {c.mensaje && <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-wrap">{c.mensaje}</p>}
                      {lineas.length > 0 && (
                        <div className="mt-1.5 bg-slate-50 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 grid gap-0.5">
                          {lineas.map((l, i) => <span key={i}>{l}</span>)}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        {c.estado === 'nueva' && (
                          <>
                            <button onClick={() => onConvertir(c)} className="text-xs bg-coop-azul text-white rounded-lg px-2.5 py-1.5 hover:opacity-90">Convertir en lead</button>
                            {descartando === c.id ? (
                              <span className="flex items-center gap-1 text-xs">
                                <button onClick={() => cambiarEstado(c, 'descartada')} className="px-2 py-1 rounded bg-red-600 text-white">Sí, descartar</button>
                                <button onClick={() => setDescartando(null)} className="px-2 py-1 rounded border border-slate-300 text-slate-500">No</button>
                              </span>
                            ) : (
                              <button onClick={() => setDescartando(c.id)} className="text-xs text-slate-400 hover:text-red-500 px-2 py-1.5">Descartar</button>
                            )}
                          </>
                        )}
                        {c.estado === 'descartada' && (
                          <button onClick={() => cambiarEstado(c, 'nueva')} className="text-xs text-slate-500 hover:text-coop-azul flex items-center gap-1 px-2 py-1.5"><RotateCcw size={12} /> Restaurar</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
