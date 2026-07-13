import { Pencil, Trash2, FileText } from 'lucide-react';
import { enfoqueInfo, resolveObjetivoPct, iniciales } from './objetivosUtils.js';

// Fecha esperada: si es ISO (YYYY-MM-DD) la formatea; si es texto libre (ej "1° etapa ... - 2° etapa ...") lo muestra tal cual.
function fechaDisplay(f) {
  if (!f) return null;
  const s = String(f);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return s;
}

export default function ObjetivoCard({ obj, collaborators, canEdit, proyectos, tareas, leads, onEdit, onDelete, onDetalle }) {
  const enf = enfoqueInfo(obj.enfoque);
  const asignados = (obj.asignadosIds || []).map((id) => collaborators.find((c) => c.id === id)).filter(Boolean);
  const externos = obj.asignadosExternos || [];
  const { pct, source, detalle } = resolveObjetivoPct(obj, proyectos || [], tareas || [], leads || []);
  const proyectosLinkeados = (proyectos || []).filter((p) => p.objetivoId === obj.id);
  const tareasLinkeadas = (tareas || []).filter((t) => proyectosLinkeados.some((p) => p.id === t.proyectoId));
  const fecha = fechaDisplay(obj.fechaEsperada);

  return (
    <div
      className="bg-white border border-slate-200 rounded-lg overflow-hidden grid grid-cols-1 md:grid-cols-[88px_1fr_190px_44px] items-stretch transition hover:shadow-sm"
      style={{ borderLeft: `4px solid ${enf.color}` }}
    >
      {/* Zona 1: código + peso + enfoque */}
      <div className="flex flex-row md:flex-col items-center justify-center text-center gap-2 p-3 bg-slate-50/70 md:border-r border-slate-200">
        <span className="font-mono font-bold text-[15px] text-slate-800 tracking-wide">{obj.codigo}</span>
        <span className="font-mono font-bold text-[11px] px-2 py-0.5 bg-white border border-slate-200 text-slate-600">{Math.round(Number(obj.peso || 0) * 100)}%</span>
        <span className="text-[9px] font-bold tracking-wide uppercase leading-tight" style={{ color: enf.color }}>{enf.label}</span>
      </div>

      {/* Zona 2: título, descripción, KPI/Meta, asignados + fecha */}
      <div className="px-4 py-3.5 flex flex-col gap-1.5 min-w-0">
        <h3 className="text-base font-semibold italic leading-tight text-slate-800 m-0">{obj.titulo}</h3>
        {obj.descripcion && <p className="text-xs leading-relaxed text-slate-600 m-0 line-clamp-2">{obj.descripcion}</p>}
        {(obj.indicador || obj.meta) && (
          <div className="flex flex-col gap-0.5 mt-0.5 text-[11px] leading-snug text-slate-600">
            {obj.indicador && (
              <div className="flex gap-1.5 items-baseline">
                <span className="text-[9px] font-bold tracking-wide uppercase text-slate-400 shrink-0 min-w-[52px]">KPI</span>
                <span className="flex-1 min-w-0 truncate" title={obj.indicador}>{obj.indicador}</span>
              </div>
            )}
            {obj.meta && (
              <div className="flex gap-1.5 items-baseline">
                <span className="text-[9px] font-bold tracking-wide uppercase text-slate-400 shrink-0 min-w-[52px]">Meta</span>
                <span className="flex-1 min-w-0 truncate" title={obj.meta}>{obj.meta}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-between items-center gap-3 mt-1.5 pt-2 border-t border-dotted border-slate-200 flex-wrap">
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {obj.asignadosTodos && asignados.length === 0 ? (
              <span className="inline-flex items-center text-[11px] px-2 py-0.5 bg-slate-50 border border-slate-200 font-medium text-slate-600">Todos</span>
            ) : (
              <>
                {asignados.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 text-[11px] pl-0.5 pr-1.5 py-0.5 bg-slate-50 border border-slate-200 font-medium text-slate-700" title={c.nombre}>
                    <span className="bg-slate-800 text-white font-mono text-[9px] font-bold px-1 py-0.5 tracking-wide">{iniciales(c)}</span>
                    {c.nombre.split(/\s+/)[0]}
                  </span>
                ))}
                {externos.map((ext, i) => (
                  <span key={`ext${i}`} className="inline-flex items-center text-[11px] px-1.5 py-0.5 bg-transparent border border-dashed border-slate-300 text-slate-400 italic" title="Externo / fuera del equipo">{ext}</span>
                ))}
              </>
            )}
          </div>
          {fecha && <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wide whitespace-nowrap">{fecha}</span>}
        </div>
      </div>

      {/* Zona 3: avance */}
      <div className="px-4 py-3.5 md:border-l border-slate-200 flex flex-col justify-center gap-1.5 bg-slate-50/70">
        <span className="font-bold text-3xl leading-none" style={{ color: enf.color }}>{pct}%</span>
        <div className="h-1 bg-white border border-slate-200 overflow-hidden">
          <div className="h-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: enf.color }} />
        </div>
        <div className={`text-[10px] leading-snug ${source === 'auto' ? 'text-emerald-600' : (source === 'leads' || source === 'monto' || source === 'manual') ? 'text-coop-azul' : 'text-slate-400 italic'}`}>
          {source === 'auto' && <span>auto · <strong className="font-semibold">{proyectosLinkeados.length}</strong> proyecto{proyectosLinkeados.length === 1 ? '' : 's'} · <strong className="font-semibold">{tareasLinkeadas.length}</strong> tarea{tareasLinkeadas.length === 1 ? '' : 's'}</span>}
          {source === 'leads' && detalle && <span><strong className="font-semibold">{detalle.leads}</strong> lead{detalle.leads === 1 ? '' : 's'} · <strong className="font-semibold">{detalle.eventos}</strong> evento{detalle.eventos === 1 ? '' : 's'}</span>}
          {source === 'monto' && detalle && <span>US$ <strong className="font-semibold">{Math.round(detalle.monto).toLocaleString('es-AR')}</strong> / {Math.round(detalle.meta).toLocaleString('es-AR')}</span>}
          {source === 'manual' && <span>manual · editá para cambiar</span>}
          {source === 'none' && <span>sin proyectos vinculados</span>}
        </div>
      </div>

      {/* Zona 4: acciones */}
      {canEdit ? (
        <div className="flex md:flex-col items-center justify-center gap-1.5 p-1.5 md:border-l border-t md:border-t-0 border-slate-200">
          <button onClick={() => onDetalle && onDetalle(obj)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Detalles (comentarios y fotos)"><FileText size={14} /></button>
          <button onClick={() => onEdit(obj)} className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Editar"><Pencil size={14} /></button>
          <button onClick={() => onDelete(obj)} className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Eliminar"><Trash2 size={14} /></button>
        </div>
      ) : <div className="hidden md:block" />}
    </div>
  );
}
