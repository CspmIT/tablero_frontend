// Ayuda · Inbox — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "deseos",
  "titulo": "Inbox",
  "intro": "La bandeja de entrada del área: los tickets de soporte (espejo de la Mesa de ayuda) y los deseos de mejora del equipo.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Tickets: todo pedido que llega (Mesa de ayuda, WhatsApp de guardia o carga manual) vive acá con su estado (Abierto → En proceso → Resuelto → Cerrado), su hilo de mensajes y su clasificación.",
        "Con el conector configurado, los tickets del área Oficina Virtual entran SOLOS cada 5 minutos desde la Mesa de ayuda, y los cambios de estado vuelven a la Mesa. Además, al entrar un ticket nuevo llega una notificación push (se apaga en Configuración → Notificaciones)."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Digitalizar un ticket que llegó por WhatsApp",
          "pasos": [
            "«+ Nuevo ticket»: solicitante, sector, título y descripción (obligatorios), tipo y prioridad.",
            "En «Cómo llegó» elegí WhatsApp de guardia y la fecha real del reclamo.",
            "Podés adjuntar hasta 5 imágenes o PDF (las imágenes se comprimen solas)."
          ]
        },
        {
          "q": "Clasificar un ticket para las métricas",
          "pasos": [
            "En el detalle: Tipo (Incidente/Solicitud), Causa y Categoría a/b/c (solo incidentes).",
            "Sin Tipo y Causa el ticket NO suma a Métricas OV (la tarjeta lo marca).",
            "Sin categoría a/b/c no entra al reporte semanal."
          ]
        },
        {
          "q": "Vincular el ticket a la grilla (evita doble conteo)",
          "pasos": [
            "En el detalle: «Vincular a un ítem de grilla» — muestra candidatos de ±10 días.",
            "El ticket es el que cuenta para las métricas; el ítem aporta las horas."
          ]
        },
        {
          "q": "Pedir un desarrollo (deseos)",
          "pasos": [
            "Solapa Mis deseos → «+ Nuevo deseo»: qué necesitás y para qué.",
            "«Guardar borrador» o «Enviar». Podés editar mientras esté en Borrador o Requiere cambios.",
            "El manager lo gestiona: En revisión, Pedir cambios, Rechazar o «Aprobar → Kanban» (crea la tarjeta en el Backlog)."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "El ⟳ (sincronizar ahora) y el ⚙ del conector son de conducción; el token de la Mesa no se vuelve a mostrar.",
        "Si un cambio de estado no llegó a la Mesa aparece un aviso rojo: reintentá el cambio o la próxima sincronización puede traer el estado viejo.",
        "Asignar tickets a cualquier persona es de conducción; el resto solo puede asignarse a sí mismo."
      ]
    }
  ]
};
