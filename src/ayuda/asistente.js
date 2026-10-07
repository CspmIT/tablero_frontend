// Ayuda · Asistente IA — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "asistente",
  "titulo": "Asistente IA",
  "intro": "Preguntale al tablero en lenguaje natural: responde con datos reales y te dice qué consultó.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Los datos que ve el asistente se filtran según TU perfil: cada uno puede preguntar solo sobre lo que puede ver. La conversación no se guarda — lo que valga la pena conservar se archiva con «Guardar como informe».",
        "Cubre: grilla de actividad, kanban, CRM, objetivos, horas extra, costos (solo conducción) y — desde el 07/10 — los tickets del Inbox y las consultas web de la landing (equipo interno).",
        "El panel «Informes» de la derecha (equipo interno) archiva los Análisis IA de tickets (cada generación queda guardada) y las respuestas del chat que guardes. Se conservan los últimos 30; cada uno se abre como vista previa con membrete y se descarga en PDF."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Preguntar",
          "pasos": [
            "Escribí y mandá con Enter (Shift+Enter hace salto de línea).",
            "Ejemplos: «¿Cuántas horas se destinaron a Reconecta este año?», «¿Cómo está el pipeline comercial?», «¿Cuántos tickets abiertos hay en el Inbox?», «¿Qué consultas entraron por la web este mes?».",
            "Cada respuesta muestra al pie qué datos consultó."
          ]
        },
        {
          "q": "Guardar una respuesta como informe",
          "pasos": [
            "Debajo de cualquier respuesta del asistente: «Guardar como informe» → le ponés un título y queda como tarjeta en el panel de la derecha.",
            "Desde la tarjeta: «Ver / PDF» abre la vista previa con membrete — «Imprimir / PDF» y elegís «Guardar como PDF».",
            "Borrar un informe del archivo es de conducción (pide confirmación; no se puede deshacer)."
          ]
        },
        {
          "q": "Analizar los tickets recurrentes",
          "pasos": [
            "Botón «✨ Analizar tickets» del panel de informes (solo conducción — consume la API): elegís el período y en 1-2 minutos la IA agrupa los tickets repetidos y propone soluciones de fondo.",
            "Cada generación queda archivada como informe (también se puede generar desde Métricas OV: es el mismo archivo).",
            "El agrupado lo hace la IA: verificá los números de ticket citados antes de tomar decisiones."
          ],
          "rol": "manager/gerencial"
        },
        {
          "q": "Configurar la clave de la API",
          "pasos": [
            "Engranaje ⚙ (solo manager): se valida con una llamada de prueba y se guarda cifrada.",
            "La clave se muestra siempre enmascarada; «Quitar clave» pide confirmación."
          ],
          "rol": "manager"
        }
      ]
    }
  ]
};
