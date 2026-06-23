import { useState, useEffect } from 'react';
import { saveImage } from '../api/minio.js';
import { useFotoSrc } from '../components/FotoImg.jsx';

// --- Roles (ids alineados al standalone) ---
export const ROLES = [
  { v: 'collaborator', t: 'Colaborador' },
  { v: 'manager', t: 'Manager' },
  { v: 'gerencial', t: 'Gerencial' },
  { v: 'externo', t: 'Otras áreas' },
  { v: 'tercerizado', t: 'Tercerizado' },
];
export const roleLabel = (v) => (ROLES.find((r) => r.v === v) || {}).t || v;

// --- Helpers portados del standalone (misma lógica exacta) ---
export function makeInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function calcAntiguedad(fechaIngresoISO, refYear) {
  if (!fechaIngresoISO) return null;
  const ing = new Date(fechaIngresoISO + 'T00:00:00');
  if (isNaN(ing.getTime())) return null;
  const refDate = new Date(refYear, 11, 31);
  if (ing > refDate) return 0;
  let anios = refDate.getFullYear() - ing.getFullYear();
  const aniversarioEnRef = new Date(refDate.getFullYear(), ing.getMonth(), ing.getDate());
  if (refDate < aniversarioEnRef) anios -= 1;
  return Math.max(0, anios);
}

export function vacacionesPorAntiguedad(anios) {
  if (anios === null || anios === undefined) return null;
  if (anios <= 5) return 10;
  if (anios <= 10) return 15;
  return 20;
}

// El backend devuelve fechas como ISO datetime (medianoche UTC). Para el <input type="date">
// alcanza con los primeros 10 caracteres (evita el corrimiento por zona horaria).
const toDateInput = (v) => (v ? String(v).slice(0, 10) : '');

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

export default function CollaboratorModal({ open, collaborator, allCollaborators = [], onClose, onSave }) {
  const isNew = !collaborator;
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [autoInit, setAutoInit] = useState(true);
  const [role, setRole] = useState('collaborator');
  const [sector, setSector] = useState('');
  const [doesGuardia, setDoesGuardia] = useState(false);
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [fechaSalida, setFechaSalida] = useState('');
  const [email, setEmail] = useState('');
  const [periodos, setPeriodos] = useState([]);
  const [foto, setFoto] = useState(null);              // referencia persistida (key del gateway | data URL legacy | null)
  const [nuevaFotoBlob, setNuevaFotoBlob] = useState(null); // imagen recién recortada, pendiente de subir
  const [fotoPreview, setFotoPreview] = useState(null);     // objectURL local para previsualizar la nueva
  const [funcionCosto, setFuncionCosto] = useState('desarrollo');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (collaborator) {
      setName(collaborator.nombre || '');
      setInitials(collaborator.iniciales || '');
      setRole(collaborator.tipo || 'collaborator');
      setSector(collaborator.sector || '');
      setDoesGuardia(!!collaborator.haceGuardia);
      setFechaIngreso(toDateInput(collaborator.fechaIngreso));
      setFechaSalida(toDateInput(collaborator.fechaSalida));
      setPeriodos(
        Array.isArray(collaborator.periodos)
          ? collaborator.periodos.map((p) => ({ desde: toDateInput(p.desde), hasta: toDateInput(p.hasta) }))
          : []
      );
      setEmail(collaborator.email || '');
      setFoto(collaborator.foto || null);
      setFuncionCosto(collaborator.funcionCosto || 'desarrollo');
      setAutoInit(false);
    } else {
      setName(''); setInitials(''); setAutoInit(true); setRole('collaborator');
      setSector(''); setDoesGuardia(false); setFechaIngreso(''); setFechaSalida('');
      setEmail(''); setPeriodos([]); setFoto(null); setFuncionCosto('desarrollo');
    }
    // Al abrir/cambiar, descarta cualquier foto nueva pendiente.
    setNuevaFotoBlob(null);
    setFotoPreview(null);
  }, [open, collaborator]);

  // Libera el objectURL de la previsualización cuando cambia o al cerrar.
  useEffect(() => () => { if (fotoPreview) URL.revokeObjectURL(fotoPreview); }, [fotoPreview]);

  useEffect(() => {
    if (autoInit) setInitials(makeInitials(name));
  }, [name, autoInit]);

  // Foto a mostrar: la nueva pendiente (preview local) o la ya guardada (key → gateway).
  const fotoGuardadaSrc = useFotoSrc(foto);
  const previewSrc = fotoPreview || fotoGuardadaSrc;

  if (!open) return null;

  // Recorte cuadrado centrado a 128x128, JPEG 0.85. Genera un Blob que se
  // sube al gateway recién al guardar (así no quedan archivos huérfanos si se
  // cancela, ya que el gateway no expone borrado).
  const handleFotoChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 128;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
        canvas.toBlob((blob) => {
          if (!blob) return;
          setNuevaFotoBlob(blob);
          setFotoPreview(URL.createObjectURL(blob));
        }, 'image/jpeg', 0.85);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const quitarFoto = () => {
    setFoto(null);
    setNuevaFotoBlob(null);
    setFotoPreview(null);
  };

  const isNonOperative = role === 'externo' || role === 'gerencial' || role === 'tercerizado';
  const showSector = role === 'externo' || role === 'tercerizado';

  const setPeriodo = (i, k, v) => setPeriodos((ps) => ps.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPeriodo = () => setPeriodos((ps) => [...ps, { desde: '', hasta: '' }]);
  const delPeriodo = (i) => setPeriodos((ps) => ps.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const cleanName = name.trim();
    if (!cleanName) { alert('Falta el nombre'); return; }
    const cleanInit = (initials || makeInitials(cleanName)).trim().toUpperCase().slice(0, 3);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        alert('El email no tiene formato válido (algo@dominio.com).');
        return;
      }
      const dup = allCollaborators.find(
        (c) => c.email && c.email.trim().toLowerCase() === cleanEmail && c.id !== collaborator?.id
      );
      if (dup) { alert(`Ese email ya está usado por ${dup.nombre}.`); return; }
    }
    const cleanPeriodos = periodos
      .filter((p) => p && p.desde)
      .map((p) => ({ desde: p.desde, hasta: p.hasta || null }))
      .sort((a, b) => a.desde.localeCompare(b.desde));

    const payload = {
      nombre: cleanName,
      iniciales: cleanInit,
      foto: foto || null,
      tipo: role,
      email: cleanEmail || '',
      sector: showSector ? sector.trim() || null : null,
      funcionCosto,
      haceGuardia: isNonOperative ? false : doesGuardia,
      fechaIngreso: isNonOperative ? null : fechaIngreso || null,
      fechaSalida: isNonOperative ? null : fechaSalida || null,
      periodos: isNonOperative ? null : cleanPeriodos.length > 0 ? cleanPeriodos : null,
    };
    if (isNew) payload.activo = true;

    setGuardando(true);
    try {
      // Si hay una foto nueva, primero se sube al gateway y se guarda su key.
      if (nuevaFotoBlob) {
        const archivo = new File([nuevaFotoBlob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
        payload.foto = await saveImage(archivo);
      }
      await onSave(payload);
    } catch (err) {
      alert('No se pudo guardar: ' + (err.message || ''));
    } finally {
      setGuardando(false);
    }
  };

  const refYear = new Date().getFullYear();
  const antig = calcAntiguedad(fechaIngreso, refYear);
  const vacacionesAsignadas = vacacionesPorAntiguedad(antig);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-4">{isNew ? 'Agregar colaborador' : 'Editar colaborador'}</h3>

        <div className="space-y-3">
          <Field label="Nombre completo">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Juan Pérez" autoFocus className={inputCls} />
          </Field>

          {/* Foto (avatar) */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Foto (avatar)</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-medium">
                {previewSrc ? (
                  <img src={previewSrc} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span>{initials || makeInitials(name) || '—'}</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <label className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  {previewSrc ? 'Cambiar' : 'Subir foto'}
                  <input type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
                </label>
                {previewSrc && (
                  <button type="button" onClick={quitarFoto} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Iniciales */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Iniciales (avatar)
              {autoInit && <span className="ml-2 text-xs text-slate-400">auto</span>}
            </label>
            <input
              value={initials}
              maxLength={3}
              onChange={(e) => { setInitials(e.target.value); setAutoInit(false); }}
              className={inputCls}
            />
          </div>

          <Field label="Email institucional">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className={inputCls} />
          </Field>

          {/* Rol */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
              {ROLES.map((r) => (
                <option key={r.v} value={r.v}>{r.t}</option>
              ))}
            </select>
          </div>

          {/* Función para el desglose de costos Cooptech */}
          <div>
            <label className="block text-sm text-slate-600 mb-1">Función para costos</label>
            <select value={funcionCosto} onChange={(e) => setFuncionCosto(e.target.value)} className={inputCls}>
              <option value="desarrollo">Desarrollo (I+D / producción)</option>
              <option value="comercial">Comercial</option>
              <option value="organizacion">Organización</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">Reparte su costo Cooptech: desarrollo de productos vs. funcionamiento (comercial/organización).</p>
          </div>

          {/* Sector: solo externo / tercerizado */}
          {showSector && (
            <Field label="Sector / Área">
              <input
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder={role === 'tercerizado' ? 'Ej: Redes, Implementación en sitio…' : 'Administración, RRHH, Gerencia general…'}
                className={inputCls}
              />
            </Field>
          )}

          {/* Bloque operativo: collaborator / manager */}
          {!isNonOperative && (
            <>
              <Field label="Fecha de ingreso">
                <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={inputCls} />
              </Field>

              {fechaIngreso && antig !== null && (
                <div className="text-sm rounded-lg px-3 py-2 bg-emerald-50 border-l-4 border-emerald-400 text-slate-700">
                  Antigüedad al 31/12/{refYear}: <b>{antig}</b> año{antig === 1 ? '' : 's'} · <b>{vacacionesAsignadas}</b> días de vacaciones
                </div>
              )}

              <div>
                <Field label="Fecha de salida">
                  <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} className={inputCls} />
                </Field>
                <p className="text-xs text-slate-400 mt-1">opcional</p>
              </div>

              {/* Períodos de actividad */}
              <div>
                <label className="block text-sm text-slate-600 mb-1">Períodos de actividad</label>
                <p className="text-xs italic text-slate-400 mb-2">· sólo si tuvo salidas y reingresos</p>
                <div className="space-y-2">
                  {periodos.map((p, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <span className="text-xs text-slate-400 pb-2.5">{i + 1}</span>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-0.5">Desde</label>
                        <input type="date" value={p.desde} onChange={(e) => setPeriodo(i, 'desde', e.target.value)} className={inputCls} />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs text-slate-500 mb-0.5">Hasta</label>
                        <input type="date" value={p.hasta} onChange={(e) => setPeriodo(i, 'hasta', e.target.value)} className={inputCls} />
                      </div>
                      <button type="button" onClick={() => delPeriodo(i)} title="Quitar período" className="px-2 py-2 text-sm text-red-500 hover:underline">
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addPeriodo} className="mt-2 text-sm text-coop-azul hover:underline">
                  + Agregar período
                </button>
                <p className="text-xs text-slate-400 mt-1">El campo "Hasta" vacío = sigue activo.</p>
              </div>

              {/* Guardias */}
              <div>
                <label className="block text-sm text-slate-600 mb-1">Guardias</label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={doesGuardia} onChange={(e) => setDoesGuardia(e.target.checked)} />
                  Participa de la rotación de guardias
                </label>
                <p className="text-xs text-slate-400 mt-1">Aparece en la grilla de guardias y suma francos ganados por cada guardia.</p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button
            onClick={handleSave}
            disabled={guardando}
            className="px-4 py-2 text-sm bg-coop-azul text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
