import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/index.js';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

// Carga al inicio las colecciones compartidas (las usa casi todo el tablero).
// Cada módulo pesado (leads, tareas, grilla) cargará lo suyo bajo demanda.
export function DataProvider({ children }) {
  const [me, setMe] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [tags, setTags] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Tolerantes a 403 (hardening 24/08): si el backend restringe alguna de estas
  // listas para un tipo de usuario, la app arranca igual con la lista vacía —
  // un permiso recortado JAMÁS debe tirar abajo el tablero entero.
  const recargarColaboradores = useCallback(async () => {
    try { const res = await api.colaboradores.list(); setColaboradores(res.data || []); }
    catch { setColaboradores([]); }
  }, []);

  const recargarTags = useCallback(async () => {
    try { const res = await api.tags.list(); setTags(res.data || []); }
    catch { setTags([]); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [meRes] = await Promise.all([api.me(), recargarColaboradores(), recargarTags()]);
        setMe(meRes);
      } catch (e) {
        setError(e.message || 'No se pudo cargar la información');
      } finally {
        setCargando(false);
      }
    })();
  }, [recargarColaboradores, recargarTags]);

  const value = { api, me, colaboradores, tags, recargarColaboradores, recargarTags, cargando, error };
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
