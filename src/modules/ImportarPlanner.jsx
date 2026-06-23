import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useData } from '../data/DataContext.jsx';
import { parseTareasFromRows } from './plannerImport.js';

export default function ImportarPlanner({ open, clientes, onClose, onDone }) {
  const { api, colaboradores } = useData();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [resultado, setResultado] = useState(null);

  if (!open) return null;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setParsed(null); setResultado(null); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
      const clientesNames = (clientes || []).map((c) => c.nombre);
      const res = parseTareasFromRows(rows, clientesNames, colaboradores);
      if (res.cards.length === 0) { setError('No se encontraron tareas en el archivo (revisá que tenga la columna "Nombre de tarea").'); return; }
      setParsed(res);
    } catch (err) {
      setError('No se pudo leer el archivo: ' + (err.message || ''));
    }
  };

  const importar = async () => {
    if (!parsed) return;
    setImportando(true);
    try {
      // 1. clientes nuevos (catálogo)
      for (const nombre of parsed.newClientes) {
        setProgreso(`Cliente: ${nombre}`);
        try { await api.clientes.create({ nombre }); } catch { /* ya existe u otro */ }
      }
      // 2. proyectos -> mapa _pkey -> id real
      const idByPkey = {};
      let n = 0;
      for (const p of parsed.proyectos) {
        setProgreso(`Proyecto ${++n}/${parsed.proyectos.length}: ${p.nombre}`);
        const creado = await api.proyectos.create({ nombre: p.nombre, cliente: p.cliente, estado: p.estado, ownerId: p.ownerId, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin });
        idByPkey[p._pkey] = creado.id;
      }
      // 3. tareas
      let m = 0;
      for (const c of parsed.cards) {
        setProgreso(`Tarea ${++m}/${parsed.cards.length}`);
        await api.tareas.create({
          titulo: c.titulo, kanbanCol: c.kanbanCol, proyectoId: idByPkey[c._pkey] || null,
          ownersIds: c.ownersIds, prioridad: c.prioridad, pct: c.pct, weight: c.weight,
          fechaInicio: c.fechaInicio, fechaFin: c.fechaFin, closedAt: c.closedAt,
        });
      }
      setResultado({ proyectos: parsed.proyectos.length, tareas: parsed.cards.length, clientes: parsed.newClientes.length });
      setParsed(null);
      onDone && onDone();
    } catch (err) {
      setError('Falló la importación: ' + (err.message || ''));
    } finally {
      setImportando(false);
      setProgreso('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && !importando && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-2">Importar de Microsoft Planner</h3>
        <p className="text-sm text-slate-500 mb-4">Subí el export <b>.xlsx</b> de Planner. Cada tarea se convierte en tarjeta; el depósito se usa como cliente y el título "Proyecto: Tarea" separa el proyecto.</p>

        <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={importando} className="block w-full text-sm mb-3" />
        {fileName && <p className="text-xs text-slate-400 mb-2">{fileName}</p>}
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        {parsed && !resultado && (
          <div className="border border-slate-200 rounded-lg p-3 mb-3 text-sm space-y-1">
            <div>Proyectos a crear: <b>{parsed.proyectos.length}</b></div>
            <div>Tareas a crear: <b>{parsed.cards.length}</b></div>
            {parsed.newClientes.length > 0 && <div className="text-slate-500">Clientes nuevos: {parsed.newClientes.join(', ')}</div>}
            {parsed.missingOwners.length > 0 && <div className="text-amber-600">Responsables no reconocidos (quedan sin asignar): {parsed.missingOwners.join(', ')}</div>}
          </div>
        )}

        {progreso && <p className="text-xs text-slate-500 mb-2">{progreso}</p>}

        {resultado && (
          <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 mb-3 text-sm text-emerald-800">
            Listo: {resultado.proyectos} proyectos, {resultado.tareas} tareas{resultado.clientes ? `, ${resultado.clientes} clientes nuevos` : ''}.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={importando} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">{resultado ? 'Cerrar' : 'Cancelar'}</button>
          {parsed && !resultado && (
            <button onClick={importar} disabled={importando} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-50">
              {importando ? 'Importando…' : `Importar ${parsed.cards.length} tareas`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
