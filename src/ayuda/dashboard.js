// Ayuda · Dashboard — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "dashboard",
  "titulo": "Dashboard",
  "intro": "La foto gerencial del área en una sola pantalla: objetivos, operación, parte comercial y costos del año o del mes elegido.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Es una vista de CONSULTA: acá no se carga nada. Todo lo que muestra sale de lo cargado en las demás secciones (grilla, objetivos, CRM, costos) — si un número se ve raro, se corrige en la sección de origen, no acá."
      ]
    },
    {
      "titulo": "Qué muestra",
      "items": [
        "KPIs: colaboradores activos, avance de objetivos (promedio ponderado por peso), ocupación productiva, horas activables Cooptech y costo laboral (ARS y US$).",
        "Objetivos del año con su barra de avance y cómo se calcula cada uno (manual, por proyectos, por leads o por monto).",
        "Comercial: monto ganado, pipeline activo, conversión y ticket promedio — los mismos números que las métricas del CRM.",
        "Composición del costo (naranja = operación Coopmorteros, azul = Cooptech) e ingresos por producto, en US$ por mes."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Ver un mes puntual en vez del año",
          "pasos": [
            "Tocá el botón «Mes».",
            "Elegí el mes en el desplegable.",
            "Los badges de % comparan contra el mes anterior (en el costo, una suba se pinta de rojo)."
          ]
        },
        {
          "q": "Ver los comentarios y fotos de un objetivo",
          "pasos": [
            "Tocá el ojo 👁 en la tarjeta del objetivo.",
            "Se abre en solo lectura; para editar, andá a la sección Objetivos."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Cada objetivo aporta como máximo 100% al promedio general, aunque lo haya superado.",
        "Por defecto lo ven manager y gerencial; se puede otorgar a otra persona desde Configuración → Permisos."
      ]
    }
  ]
};
