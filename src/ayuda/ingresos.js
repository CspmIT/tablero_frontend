// Ayuda · Ingresos — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "ingresos",
  "titulo": "Ingresos",
  "intro": "Cuánto ingresó, mes a mes y en US$, por cada lead ganado: implementación + abono mensual.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Es ingreso REAL, no proyección: la implementación se cuenta una sola vez en el mes de la fecha de ganado, y el abono desde ese mes hasta el corriente. Todo sale del CRM — acá no se carga nada."
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "«Abonos activos» es el recurrente (MRR) del último mes con datos.",
        "Pasando el mouse sobre un monto se ve si salió del monto facturado o del presupuesto.",
        "Los leads ganados SIN fecha de ganado no entran al cálculo: aparecen en un aviso ámbar con sus nombres — se corrige en la ficha del CRM.",
        "El gráfico «Ingresos por producto» es el mismo del Dashboard."
      ]
    }
  ]
};
