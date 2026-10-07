// Ayuda · Operaciones — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "operaciones",
  "titulo": "Operaciones",
  "intro": "Tres áreas operativas en un solo lugar: Campo (trabajo en territorio + AutonomIA), Laboratorio (IoT) y Gestión de Organizaciones y Usuarios. Si podés ver una sola, la barra de pestañas ni aparece.",
  "secciones": [
    {
      "titulo": "Campo",
      "parrafos": [
        "Las cooperativas en etapa Visita Técnica, sin datos comerciales: organización, localidad y contacto. «Iniciar/Continuar relevamiento» abre el relevamiento +Agua con CriterIA (guarda solo). La solapa AutonomIA programa y configura las placas Multivac desde el navegador (USB o Bluetooth, también desde Android)."
      ],
      "recetas": [
        {
          "q": "Actualizar el firmware de una placa",
          "pasos": [
            "AutonomIA → Actualizaciones de firmware: conectá por USB, elegí la versión y tocá «⬆ Actualizar» (conserva la configuración).",
            "NO desconectes el cable durante la programación; la placa se reinicia sola.",
            "«🏭 Volver a fábrica» borra TODO y pide doble confirmación."
          ]
        },
        {
          "q": "Configurar una placa",
          "pasos": [
            "AutonomIA → Configuraciones: elegí el firmware (Reconecta DNP3, DLMS Itron y +Agua Universal_agua son guiados; Terminal libre para el resto).",
            "En guiado, «Grabar» muestra los comandos exactos, manda solo los cambios, relee la placa y VALIDA campo por campo (contraseñas enmascaradas en pantalla).",
            "«⚡ Aprovisionar desde un planteo CriterIA» sirve para proyectos +Agua con planteo hecho."
          ]
        },
        {
          "q": "Configurar una placa de +Agua (schema de tópicos y sensores)",
          "pasos": [
            "AutonomIA → Configuraciones → «+Agua — Universal_agua»: verifica que el firmware sea de agua antes de leer nada (si es otro, lo dice y no toca la placa).",
            "Además de la config (COMs, red, WiFi, MQTT, FTP), editás el SCHEMA: el último renglón vacío de Tópicos/Sensores es el alta; ✕ da de baja (queda tachado hasta grabar); al elegir el tipo de sensor, los parámetros se arman con los defaults exactos del firmware.",
            "Los cambios de schema agregan solos save_schema + reload_schema; si tras grabar algo no impactó, reintenta solo (2 s) y, con cambios de schema, reinicia la placa como último recurso y re-valida."
          ]
        },
        {
          "q": "Aprobar un firmware nuevo",
          "pasos": [
            "AutonomIA → Gestión de versiones: subí el release (los .bin se reparten solos).",
            "Un release nace SIN aprobar: solo lo ve el área para pruebas.",
            "El tilde ✓ lo aprueba y recién ahí lo ven todos (y los sistemas externos como Reconecta)."
          ],
          "rol": "gestor"
        }
      ]
    },
    {
      "titulo": "Laboratorio",
      "parrafos": [
        "El ABM de servidores InfluxDB y MQTT del área, y el borrado controlado de datos en InfluxDB."
      ],
      "items": [
        "En Influx, «Organización» es el usuario y «Token de API» la contraseña. El token NO se vuelve a mostrar: dejarlo vacío al editar conserva el actual."
      ],
      "recetas": [
        {
          "q": "Borrar datos de un tópico en InfluxDB",
          "pasos": [
            "Completá inicio, fin, bucket y tópico (el servidor MQTT es solo referencia).",
            "«Borrar datos» → confirmá el aviso rojo («No se puede deshacer»).",
            "El borrado se ejecuta al toque y verifica: estados Borrado, Sin datos, Error (con Reintentar), Pendiente, Cancelado.",
            "Las horas son siempre de Argentina."
          ]
        }
      ]
    },
    {
      "titulo": "Gestión de Organizaciones y Usuarios",
      "parrafos": [
        "El alta y administración de las cooperativas clientes de Cooptech y sus usuarios por producto (perfiles Sin permiso / Moderador / Lector / Operario). Los datos viven en la API central de Cooptech."
      ],
      "items": [
        "Los leads GANADOS del CRM con Reconecta o +Agua aparecen arriba como «Pendientes de crear»: «Crear organización» abre el formulario precargado (nombre, email del contacto y productos tildados — provincia/localidad se eligen a mano) y al guardarse sale de la lista; «Descartar» es para organizaciones que ya existen.",
        "Esta pestaña no la da ningún rol por defecto: se otorga persona por persona desde Configuración → Permisos."
      ],
      "recetas": [
        {
          "q": "Dar de alta una organización",
          "pasos": [
            "«Nueva»: nombre, domicilio, usuario administrador (email + contraseña) y los productos contratados.",
            "Desactivar una organización deja a sus usuarios sin acceso."
          ]
        },
        {
          "q": "Crear o vincular un usuario",
          "pasos": [
            "Desde el ícono de personas de la organización: «Nuevo» (manda el correo de activación) o «Vincular existente» (por email).",
            "El sobre ✓ activa la cuenta a mano sin esperar el correo.",
            "Solo se da acceso a productos contratados y activos; en cada producto donde quede con perfil se lo da de alta también del lado de ese producto. Oficina Virtual no acepta un email que ya esté en uso allá."
          ]
        }
      ]
    }
  ]
};
