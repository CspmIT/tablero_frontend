import { calcAntiguedad, vacacionesPorAntiguedad, makeInitials, roleLabel } from './CollaboratorModal.jsx';
import FotoImg from '../components/FotoImg.jsx';

// --- Predicados de rol (ids alineados al standalone), sobre los campos del backend ---
const isActiveCollab = (c) => c.activo !== false;
const isExterno = (c) => c.tipo === 'externo';
const isGerencial = (c) => c.tipo === 'gerencial';
const isTercerizado = (c) => c.tipo === 'tercerizado';
const isInterno = (c) => !isExterno(c) && !isGerencial(c) && !isTercerizado(c); // collaborator / manager

const pillCls = {
  manager: 'bg-coop-azul/10 text-coop-azul',
  gerencial: 'bg-violet-100 text-violet-700',
  externo: 'bg-amber-100 text-amber-700',
  tercerizado: 'bg-slate-200 text-slate-600',
  collaborator: 'bg-emerald-100 text-emerald-700',
};

function CollabCard({ collab: c, onEdit, onToggleActive, onDelete }) {
  const activo = isActiveCollab(c);
  const operativo = isInterno(c);
  const refYear = new Date().getFullYear();
  const fi = c.fechaIngreso ? String(c.fechaIngreso).slice(0, 10) : null;
  const antig = operativo ? calcAntiguedad(fi, refYear) : null;
  const vac = vacacionesPorAntiguedad(antig);

  return (
    <div className={`bg-white rounded-xl border border-slate-200 p-4 ${activo ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 text-sm font-medium shrink-0">
          <FotoImg foto={c.foto} fallback={<span>{c.iniciales || makeInitials(c.nombre)}</span>} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800 truncate">{c.nombre}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            <span className={`px-2 py-0.5 rounded text-xs ${pillCls[c.tipo] || 'bg-slate-100 text-slate-600'}`}>{roleLabel(c.tipo)}</span>
            {c.haceGuardia && <span className="px-2 py-0.5 rounded text-xs bg-coop-naranja/15 text-coop-naranja">Guardia</span>}
            {!activo && <span className="px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-500">Inactivo</span>}
          </div>
          {c.sector && <div className="text-xs text-slate-500 mt-1">{c.sector}</div>}
        </div>
      </div>

      {operativo && (
        <div className="mt-3">
          {fi && antig !== null ? (
            <>
              <div className="flex items-baseline justify-between text-xs text-slate-500">
                <span>{antig} año{antig === 1 ? '' : 's'} de antigüedad</span>
                <span className="font-mono text-slate-700">{vac} días vac.</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded mt-1 overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, (vac / 20) * 100)}%` }} />
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-400 italic">Sin fecha de ingreso cargada</div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 mt-3 text-sm">
        <button onClick={onEdit} className="text-coop-azul hover:underline">Editar</button>
        <button onClick={onToggleActive} className={activo ? 'text-red-500 hover:underline' : 'text-emerald-600 hover:underline'}>
          {activo ? 'Inactivar' : 'Reactivar'}
        </button>
        {onDelete && (
          <button onClick={onDelete} className="text-slate-400 hover:text-red-600 hover:underline">Eliminar</button>
        )}
      </div>
    </div>
  );
}

function Grupo({ titulo, sub, items, onEdit, onToggleActive, onDelete, vacio }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-slate-600 mb-2">
        {titulo} {sub && <span className="font-normal text-slate-400">· {sub}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{vacio}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <CollabCard key={c.id} collab={c} onEdit={() => onEdit(c)} onToggleActive={() => onToggleActive(c.id)} onDelete={onDelete ? () => onDelete(c) : null} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamView({ collaborators, onAddNew, onEdit, onToggleActive, onDelete }) {
  const internos = collaborators.filter(isInterno);
  const gerenciales = collaborators.filter(isGerencial);
  const externos = collaborators.filter(isExterno);
  const tercerizados = collaborators.filter(isTercerizado);

  const act = (arr) => arr.filter(isActiveCollab);
  const inact = (arr) => arr.filter((c) => !isActiveCollab(c));

  const grupoProps = { onEdit, onToggleActive, onDelete };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-semibold text-coop-negro">Equipo</h2>
        <button onClick={onAddNew} className="bg-coop-naranja text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90">
          + Agregar persona
        </button>
      </div>

      <Grupo titulo="Equipo de IT" sub="activos en la grilla" items={act(internos)} vacio="No hay colaboradores activos. Agregá uno o reactivá a alguien." {...grupoProps} />
      {inact(internos).length > 0 && (
        <Grupo titulo="Equipo IT — inactivos" sub="historial preservado" items={inact(internos)} {...grupoProps} />
      )}

      {gerenciales.length > 0 && (
        <>
          <Grupo titulo="Gerenciales" items={act(gerenciales)} vacio="—" {...grupoProps} />
          {inact(gerenciales).length > 0 && <Grupo titulo="Gerenciales — inactivos" sub="historial preservado" items={inact(gerenciales)} {...grupoProps} />}
        </>
      )}

      {externos.length > 0 && (
        <>
          <Grupo titulo="Otras áreas de CoopMorteros" items={act(externos)} vacio="—" {...grupoProps} />
          {inact(externos).length > 0 && <Grupo titulo="Otras áreas — inactivos" sub="historial preservado" items={inact(externos)} {...grupoProps} />}
        </>
      )}

      {tercerizados.length > 0 && (
        <>
          <Grupo titulo="Tercerizados" items={act(tercerizados)} vacio="—" {...grupoProps} />
          {inact(tercerizados).length > 0 && <Grupo titulo="Tercerizados — inactivos" sub="historial preservado" items={inact(tercerizados)} {...grupoProps} />}
        </>
      )}
    </div>
  );
}
