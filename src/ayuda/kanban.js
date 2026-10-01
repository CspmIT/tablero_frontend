// Ayuda · Kanban — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "kanban",
  "titulo": "Kanban",
  "intro": "La gestión de tareas y proyectos del área con metodología Kanban: Backlog → To-do → Doing → Done.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Las tarjetas se mueven arrastrando (solo en la pestaña Tablero). Pasar a Doing fija la fecha de inicio y pasar a Done la de cierre (solo la primera vez): esas fechas generan las sugerencias de Mi semana."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Crear una tarjeta",
          "pasos": [
            "«+ Tarjeta»: título, proyecto, columna, prioridad, responsables, etiquetas, fechas planificadas y avance %.",
            "Como responsables solo se eligen internos activos y tercerizados."
          ]
        },
        {
          "q": "Crear un proyecto y seguirlo",
          "pasos": [
            "Pestaña Proyectos → «+ Proyecto» (cliente, objetivo vinculado, responsable).",
            "El % del proyecto se calcula con sus tareas.",
            "Al eliminar un proyecto, sus tareas NO se borran: quedan sin proyecto (avisa cuántas)."
          ]
        },
        {
          "q": "Ordenar los clientes",
          "pasos": [
            "Pestaña Clientes: renombrar aplica a todos sus proyectos.",
            "«Fusionar» pasa los proyectos del origen al destino y borra el origen (pide confirmación).",
            "Solo se puede eliminar un cliente sin proyectos."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Buscador por título, tag o proyecto + filtros por responsable y proyecto (en Tablero y Por cliente).",
        "«Importar de Planner» trae tarjetas desde Microsoft Planner.",
        "La pestaña «Por cliente» agrupa por cliente pero no permite arrastrar."
      ]
    }
  ]
};
