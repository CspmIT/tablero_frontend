// Switch para alternar entre la Grilla (vista del manager), Mi semana (personal)
// y Mi mes (calendario mensual de solo lectura).
// Ambas comparten el mismo item de menu; este control va al lado del titulo.
export default function SwitchVista({ vista, setVista }) {
  const tab = (id, label) => (
    <button
      onClick={() => setVista && setVista(id)}
      className={`text-sm sm:text-base font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors ${
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
      {tab('midia', 'Mi día')}
      {tab('mimes', 'Mi mes')}
    </div>
  );
}
