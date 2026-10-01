// Ayuda · Métricas Oficina Virtual — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "metricas-ov",
  "titulo": "Métricas Oficina Virtual",
  "intro": "Los tickets de la Oficina Virtual medidos por tipo y causa, con el tablero ejecutivo y el reporte semanal a Gerencia General.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Se miden INTERVENCIONES (1 ítem de grilla = 1 ticket), clasificadas en Incidente/Solicitud y cuatro causas fijas. Nada entra al tablero sin clasificar: los pendientes esperan en la bandeja del ⚙ (el contador ámbar avisa).",
        "Las horas son una estimación (reales si el ítem las tiene; prorrateadas si no — el «*» las marca), no un parte de horas."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Clasificar los pendientes",
          "pasos": [
            "⚙ → Bandeja de clasificación: cada ticket viene con Tipo y Causa sugeridos por palabras clave.",
            "«Confirmar» uno por uno, o «⚡ Aplicar todas las sugerencias» (pide confirmación).",
            "«No es de OV» lo descarta (reversible desde el detalle).",
            "Consejo: clasificá al cargar el día en la grilla y la bandeja no se acumula."
          ]
        },
        {
          "q": "Emitir el reporte semanal (Mandato M1)",
          "pasos": [
            "Solapa Reporte de incidentes: toma los incidentes del Inbox de viernes a jueves, con el semáforo por categoría a/b/c.",
            "Verde = sin incidentes; amarillo = todos resueltos al cierre; rojo = alguno pendiente. Cualquier incidente reinicia el contador de «días sin incidente».",
            "«🖨 Imprimir / PDF» → «Guardar como PDF» (sale en A4)."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Los tickets que vienen del Inbox llevan chip de origen y se reclasifican desde Inbox → Tickets, no desde acá.",
        "Filtros de período (por defecto 3 meses), tipo, causas múltiples y responsable, compartidos entre tablero y detalle.",
        "La ven y clasifican los internos del área; otras áreas y tercerizados quedan afuera."
      ]
    }
  ]
};
