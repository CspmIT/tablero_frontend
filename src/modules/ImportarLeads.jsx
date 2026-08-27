import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useData } from '../data/DataContext.jsx';
import { parseLeadsFromRows } from './kommoImport.js';

const ETAPA_LABEL = {
  contacto: 'Contacto', visita_agendada: 'Visita agendada', visita_realizada: 'Visita Técnica',
  propuesta: 'Propuesta', negociacion: 'Negociación', trial: 'Trial', ganado: 'Ganado', perdido: 'Perdido',
};

export default function ImportarLeads({ open, onClose, onDone }) {
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
      const res = parseLeadsFromRows(rows, colaboradores);
      if (res.leads.length === 0) { setError('No se encontraron leads válidos en el archivo.'); return; }
      setParsed(res);
    } catch (err) {
      setError('No se pudo leer el archivo: ' + (err.message || ''));
    }
  };

  const importar = async () => {
    if (!parsed) return;
    setImportando(true);
    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < parsed.leads.length; i++) {
        setProgreso(`Lead ${i + 1}/${parsed.leads.length}`);
        try { await api.leads.create(parsed.leads[i]); ok++; } catch { fail++; }
      }
      setResultado({ ok, fail });
      if (onDone) onDone();
    } finally {
      setImportando(false);
      setProgreso('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !importando && onClose()}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <h3 className="text-lg font-semibold text-coop-negro mb-1">Importar leads de Kommo</h3>
        <p className="text-sm text-slate-400 mb-4">Subí el .xlsx exportado de Kommo. Los leads se crean en el embudo.</p>

        {!resultado && (
          <label className="block border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-50 mb-3">
            <input type="file" accept=".xlsx,.xls" onChange={onFile} className="hidden" disabled={importando} />
            <span className="text-sm text-slate-500">{fileName || 'Elegir archivo .xlsx'}</span>
          </label>
        )}

        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

        {parsed && !resultado && (
          <div className="text-sm text-slate-600 mb-4 space-y-2">
            <div><span className="font-semibold text-slate-700">{parsed.leads.length}</span> leads para importar <span className="text-slate-400">· {parsed.omitidos} descartados (prueba o sin datos)</span></div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(parsed.porEtapa).map(([et, n]) => (
                <span key={et} className="text-xs bg-slate-100 rounded px-2 py-0.5">{ETAPA_LABEL[et] || et}: {n}</span>
              ))}
            </div>
            {parsed.sinOwner.length > 0 && (
              <div className="text-xs text-amber-600">Responsables no encontrados (quedan sin asignar): {parsed.sinOwner.join(', ')}</div>
            )}
            <div className="text-xs text-slate-400">Los datos sin campo propio (habitantes, servicios, prioridad, cargo, decisor, provincia) se guardan en las notas de cada lead.</div>
          </div>
        )}

        {resultado && (
          <div className="text-sm text-slate-700 mb-4">
            Importados: <span className="font-semibold text-emerald-700">{resultado.ok}</span>{resultado.fail > 0 && <> · fallidos: <span className="text-rose-600">{resultado.fail}</span></>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          {!resultado && <button onClick={onClose} disabled={importando} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50">Cancelar</button>}
          {parsed && !resultado && <button onClick={importar} disabled={importando} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-50">{importando ? (progreso || 'Importando…') : `Importar ${parsed.leads.length} leads`}</button>}
          {resultado && <button onClick={onClose} className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90">Listo</button>}
        </div>
      </div>
    </div>
  );
}
