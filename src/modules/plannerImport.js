// Importador de export XLSX de Microsoft Planner -> proyectos + tarjetas.
// Las tarjetas referencian su proyecto por `_pkey` (clave temporal); al importar
// se crean los proyectos y se mapea _pkey -> id real para crear las tareas.

const PLANNER_PRIO_MAP = { baja: 'baja', media: 'media', importante: 'alta', alta: 'alta', urgente: 'urgente' };

export function pickCol(row, candidates) {
  const keys = Object.keys(row);
  const lower = keys.map((k) => String(k).trim().toLowerCase());
  for (const cand of candidates) {
    const idx = lower.indexOf(cand.toLowerCase());
    if (idx >= 0) return row[keys[idx]];
  }
  return null;
}

export function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

export function progresoToPct(v) {
  if (v === null || v === undefined || v === '') return 0;
  const txt = String(v).trim().toLowerCase();
  if (['completada', 'completado', 'completed', 'hecho'].includes(txt)) return 100;
  if (['en curso', 'in progress', 'iniciada', 'en progreso'].includes(txt)) return 50;
  if (['no iniciada', 'not started', 'sin iniciar'].includes(txt)) return 0;
  let n = parseFloat(v);
  if (isNaN(n)) return 0;
  if (n <= 1.0001) n = n * 100;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function splitProjectFromTitle(title, cliente) {
  const t = String(title || '').trim();
  const m = t.match(/^([^:]{3,60}?)\s*:\s*(.+)$/);
  if (m) return { proyecto: m[1].trim(), title: m[2].trim() };
  return { proyecto: `General — ${cliente || 'Sin cliente'}`, title: t };
}

export function normalizeCliente(s, clientesNames) {
  if (!s) return null;
  const k = String(s).trim().toLowerCase();
  const found = (clientesNames || []).find((c) => c.toLowerCase() === k);
  return found || String(s).trim();
}

// Resuelve nombres del export contra los colaboradores (nombre completo o primer nombre).
export function resolveOwners(s, colaboradores) {
  if (!s) return { ids: [], missing: [] };
  const parts = String(s).split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  const ids = [];
  const missing = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    const c = colaboradores.find((col) => {
      const full = (col.nombre || '').toLowerCase();
      const first = full.split(/\s+/)[0];
      return full === k || first === k || full.startsWith(k) || (col.email && col.email.toLowerCase() === k);
    });
    if (c) { if (!ids.includes(c.id)) ids.push(c.id); }
    else missing.push(p);
  }
  return { ids, missing };
}

export function parseTareasFromRows(rows, clientesNames, colaboradores) {
  const proyectosMap = new Map();
  const cards = [];
  const allMissingOwners = new Set();
  const allNewClientes = new Set();

  rows.forEach((row) => {
    const title = pickCol(row, ['Nombre de tarea', 'Tarea', 'Title', 'Task']);
    const owners = pickCol(row, ['Asignado a', 'Assigned to', 'Owner', 'Responsable']);
    const inicio = pickCol(row, ['Inicio', 'Start', 'Fecha inicio', 'Start date']);
    const fin = pickCol(row, ['Finalización', 'Finalizacion', 'Due', 'End', 'Due date', 'Fecha fin']);
    const deposito = pickCol(row, ['Depósito', 'Deposito', 'Bucket', 'Cliente', 'Cliente / Depósito']);
    const completado = pickCol(row, ['% completado', 'Completado', 'Progress', '% Completed', 'Progreso']);
    const prioridad = pickCol(row, ['Prioridad', 'Priority']);
    if (!title || !String(title).trim()) return;

    const cliente = normalizeCliente(deposito, clientesNames);
    if (cliente && !(clientesNames || []).includes(cliente)) allNewClientes.add(cliente);
    const { proyecto: proyName, title: cardTitle } = splitProjectFromTitle(title, cliente);
    const ownersResolved = resolveOwners(owners, colaboradores);
    ownersResolved.missing.forEach((n) => allMissingOwners.add(n));
    const pct = progresoToPct(completado);
    const column = pct >= 100 ? 'done' : pct > 0 ? 'doing' : 'todo';
    const prio = PLANNER_PRIO_MAP[prioridad ? String(prioridad).trim().toLowerCase() : 'media'] || 'media';
    const pkey = `${cliente || ''}||${proyName}`;

    if (!proyectosMap.has(pkey)) {
      proyectosMap.set(pkey, { _pkey: pkey, nombre: proyName, cliente: cliente || 'Sin cliente', estado: 'activo', _cardCount: 0, _doneCount: 0, _ownerVotes: {}, _ini: [], _fin: [] });
    }
    const p = proyectosMap.get(pkey);
    p._cardCount++;
    if (column === 'done') p._doneCount++;
    ownersResolved.ids.forEach((oid) => { p._ownerVotes[oid] = (p._ownerVotes[oid] || 0) + 1; });
    const fi = toISODate(inicio); const ff = toISODate(fin);
    if (fi) p._ini.push(fi);
    if (ff) p._fin.push(ff);

    cards.push({
      _pkey: pkey,
      titulo: cardTitle,
      kanbanCol: column,
      ownersIds: ownersResolved.ids,
      prioridad: prio,
      pct,
      weight: 1,
      fechaInicio: fi,
      fechaFin: ff,
      closedAt: column === 'done' ? toISODate(new Date()) : null,
    });
  });

  const proyectos = [];
  proyectosMap.forEach((p) => {
    p._ini.sort(); p._fin.sort();
    p.fechaInicio = p._ini[0] || null;
    p.fechaFin = p._fin[p._fin.length - 1] || null;
    const votes = Object.entries(p._ownerVotes).sort((a, b) => b[1] - a[1]);
    p.ownerId = votes.length ? Number(votes[0][0]) : null;
    if (p._cardCount > 0 && p._doneCount === p._cardCount) p.estado = 'cerrado';
    proyectos.push({ _pkey: p._pkey, nombre: p.nombre, cliente: p.cliente, estado: p.estado, ownerId: p.ownerId, fechaInicio: p.fechaInicio, fechaFin: p.fechaFin });
  });

  return { proyectos, cards, missingOwners: [...allMissingOwners].sort(), newClientes: [...allNewClientes].sort() };
}
