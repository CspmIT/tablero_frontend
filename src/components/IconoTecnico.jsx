// Ícono "personita con casco" (técnico de campo) — no existe en lucide, así
// que está dibujado a mano con el mismo lenguaje visual (trazo 2, redondeado).
export default function IconoTecnico({ size = 24, className = '', ...props }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className={className} {...props}>
      {/* casco: cúpula + visera */}
      <path d="M7.5 7.5a4.5 4.5 0 0 1 9 0" />
      <path d="M5.5 7.5h13" />
      {/* cabeza */}
      <path d="M9.5 11a2.5 2.5 0 0 0 5 0" />
      {/* hombros / torso */}
      <path d="M6 20a6 6 0 0 1 12 0" />
    </svg>
  );
}
