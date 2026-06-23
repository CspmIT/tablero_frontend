// Switch para alternar entre la Grilla (vista del manager) y Mi semana (vista personal).
// Ambas comparten el mismo item de menu; este control va al lado del titulo.
export default function SwitchVista({ vista, setVista }) {
  const tab = (id, label) => (
    <button
      onClick={() => setVista && setVista(id)}
      className={`text-base font-semibold px-3 py-1.5 rounded-lg transition-colors ${
        vista === id ? 'bg-coop-azul text-white' : 'text-slate-500 hover:bg-white'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
      {tab('grilla', 'Grilla')}
      {tab('misemana', 'Mi semana')}
    </div>
  );
}
