// Ayuda · Configuración — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "configuracion",
  "titulo": "Configuración",
  "intro": "El panel de administración del tablero: permisos por persona, el equipo, importaciones, grilla típica, etiquetas y las notificaciones de cada usuario.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Casi todo es del manager. La excepción es Notificaciones: cada usuario configura las suyas (para los no-managers es la única pestaña visible)."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar el legajo de RRHH de un colaborador",
          "pasos": [
            "Equipo → editar la ficha → campo «Legajo (RRHH)» (opcional: externos y otras áreas pueden dejarlo vacío).",
            "Lo usa «Exportar para RRHH» de Guardias — sin legajo, el export avisa a quién le falta."
          ]
        },
        {
          "q": "Dar o quitar acceso a una solapa",
          "pasos": [
            "Permisos de vistas: tocá la celda persona × solapa. Cuatro estados: ✓ azul (la da su rol), ✓+ verde (otorgada acá), — gris (no la ve), ✕ rojo (ocultada).",
            "Guarda al instante; la persona lo ve al recargar la aplicación.",
            "Solapas como «Gestión de Organizaciones y Usuarios» no las da ningún rol: siempre se otorgan por acá. Guardias y las pestañas de Operaciones también se gestionan acá."
          ],
          "rol": "manager"
        },
        {
          "q": "Dar de alta una persona",
          "pasos": [
            "Equipo → «+ Agregar persona»: nombre, email (único), rol, «Función para costos» (define I+D vs. gasto en Costos) y, para internos, fecha de ingreso y la casilla de Guardias.",
            "Para una baja usá «Inactivar» (pide la fecha de salida — alimenta Rotación y Costos). «Eliminar» es solo para limpiar duplicados: borra TODO en cascada."
          ],
          "rol": "manager"
        },
        {
          "q": "Activar mis notificaciones",
          "pasos": [
            "Notificaciones → «🔔 Activar en este dispositivo» (se hace por dispositivo: celu y compu por separado).",
            "Elegí qué te avisa: Reuniones, CRM: lead ganado, Inbox: ticket nuevo.",
            "En iPhone hace falta el tablero agregado a la pantalla de inicio; en la app de escritorio no funcionan (usá el navegador)."
          ]
        },
        {
          "q": "Cargar la semana típica y las vacaciones por rango",
          "pasos": [
            "Grilla Típica: la semana por defecto de cada uno (es solo visual hasta que se guarda el día).",
            "«Vacaciones por rango» crea los días hábiles del rango sin pisar nada (saltea feriados y días ya cargados) y se puede revertir día a día."
          ],
          "rol": "manager"
        },
        {
          "q": "Unificar etiquetas duplicadas",
          "pasos": [
            "Revisión de Etiquetas: agrupa variantes de una misma etiqueta (grilla + kanban) y las unifica bajo un nombre único — corrige también el histórico."
          ],
          "rol": "manager"
        },
        {
          "q": "Importar la grilla desde el Excel «Horario Flexible»",
          "pasos": [
            "Importar grilla: elegí el .xlsx y la hoja del año.",
            "La previsualización avisa nombres no encontrados (se corrigen en Equipo y se reimporta).",
            "OJO: pisa lo que ya exista en esos días (pide confirmación)."
          ],
          "rol": "manager"
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "«Importar datos» es la migración inicial desde el tablero viejo: no es de uso diario, y conviene hacerla sobre una base blanqueada.",
        "No se puede inactivar al único manager activo.",
        "El permiso también se controla en el servidor: otorgar una solapa habilita además sus datos."
      ]
    }
  ]
};
