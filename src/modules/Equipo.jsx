import { useState } from 'react';
import { useData } from '../data/DataContext.jsx';
import TeamView from './TeamView.jsx';
import CollaboratorModal from './CollaboratorModal.jsx';
import InactivateModal from './InactivateModal.jsx';

export default function Equipo() {
  const { api, colaboradores, recargarColaboradores } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);     // null = nuevo
  const [inactivating, setInactivating] = useState(null); // colaborador en proceso de baja

  const abrirNuevo = () => { setEditing(null); setModalOpen(true); };
  const abrirEditar = (c) => { setEditing(c); setModalOpen(true); };
  const cerrar = () => setModalOpen(false);

  // El modal arma el payload (reglas por rol incluidas) y lo entrega; acá sólo se persiste.
  const handleSave = async (payload) => {
    if (editing) await api.colaboradores.update(editing.id, payload);
    else await api.colaboradores.create(payload);
    await recargarColaboradores();
    setModalOpen(false);
  };

  // Toggle activo: si está activo -> baja (pide fecha); si está inactivo -> reactiva.
  const toggleCollabActive = async (id) => {
    const target = colaboradores.find((c) => c.id === id);
    if (!target) return;
    const activo = target.activo !== false;
    if (activo) {
      if (target.tipo === 'manager') {
        const otrosManagers = colaboradores.filter((c) => c.id !== id && c.tipo === 'manager' && c.activo !== false);
        if (otrosManagers.length === 0) {
          alert('No podés inactivar al único manager activo. Asigná otro manager primero.');
          return;
        }
      }
      setInactivating(target);
      return;
    }
    // Reactivar: vuelve a activo y limpia la fecha de salida.
    try {
      await api.colaboradores.update(id, { activo: true, fechaSalida: null });
      await recargarColaboradores();
    } catch (e) {
      alert('No se pudo reactivar: ' + (e.message || ''));
    }
  };

  const confirmInactivate = async (id, fecha) => {
    try {
      await api.colaboradores.inactivar(id, { fecha });
      await recargarColaboradores();
    } catch (e) {
      alert('No se pudo inactivar: ' + (e.message || ''));
    } finally {
      setInactivating(null);
    }
  };

  // Eliminación definitiva (para limpiar duplicados). Si el colaborador tiene datos,
  // el backend responde 409 con el detalle; ahí se confirma el borrado en cascada.
  const labelDep = {
    grilla: 'días de grilla', tareas: 'asignaciones a tareas', francos: 'francos especiales',
    wips: 'WIPs semanales', carryover: 'saldos de vacaciones', actividades: 'actividades de CRM',
    leads: 'leads a cargo', proyectos: 'proyectos a cargo',
  };
  const handleDelete = async (c) => {
    if (!confirm(`¿Eliminar a ${c.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.colaboradores.eliminar(c.id);
      await recargarColaboradores();
    } catch (e) {
      if (e.code === 'tiene_dependencias' && e.dependencias) {
        const detalle = Object.entries(e.dependencias)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `${n} ${labelDep[k] || k}`)
          .join(', ');
        const ok = confirm(
          `${c.nombre} tiene datos asociados: ${detalle}.\n\n` +
          'Si continuás se eliminarán la grilla, tareas, francos, WIPs y saldos de ese ' +
          'colaborador, y los leads/proyectos a su cargo quedarán sin responsable.\n\n' +
          '¿Eliminar de todas formas?'
        );
        if (!ok) return;
        try {
          await api.colaboradores.eliminar(c.id, true);
          await recargarColaboradores();
        } catch (e2) {
          alert('No se pudo eliminar: ' + (e2.message || ''));
        }
      } else {
        alert('No se pudo eliminar: ' + (e.message || ''));
      }
    }
  };

  return (
    <div>
      <TeamView
        collaborators={colaboradores}
        onAddNew={abrirNuevo}
        onEdit={abrirEditar}
        onToggleActive={toggleCollabActive}
        onDelete={handleDelete}
      />

      <CollaboratorModal
        open={modalOpen}
        collaborator={editing}
        allCollaborators={colaboradores}
        onClose={cerrar}
        onSave={handleSave}
      />

      <InactivateModal
        open={!!inactivating}
        collab={inactivating}
        onClose={() => setInactivating(null)}
        onConfirm={confirmInactivate}
      />
    </div>
  );
}
