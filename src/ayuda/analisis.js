// Ayuda · Reportes — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "analisis",
  "titulo": "Reportes",
  "intro": "Cuatro reportes de solo lectura sobre lo cargado en el tablero: horas extra, rotación de personal, ociosidad anual y el explorador de etiquetas.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Regla de la casa: lo que no figura en el tablero no se considera, y lo que se excluye de un cálculo se informa con nombre."
      ]
    },
    {
      "titulo": "Qué muestra cada uno",
      "items": [
        "HORAS EXTRA: por mes y colaborador, con el detalle día por día (ingreso → salida) tocando la fila.",
        "ROTACIÓN: activos, altas y bajas por mes en el rango elegido. Cuenta solo al equipo del área; los ex-colaboradores cuentan en los meses en que estuvieron. Un inactivo sin fecha de baja queda FUERA con aviso ámbar (se corrige en Equipo).",
        "OCIOSIDAD ANUAL (jornada de 8 hs): fines de semana, feriados en día hábil, vacaciones, francos y licencias por colaborador. El año en curso se cuenta hasta hoy.",
        "EXPLORADOR DE ETIQUETAS: elegí etiquetas, años y colaboradores (combinan con «Y»: suma solo lo que tiene TODO a la vez) y obtené horas declaradas, ítems y desglose."
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "La ven manager, gerencial y externos autorizados (p. ej. RRHH).",
        "Si hay ítems sin horas declaradas, el explorador lo avisa y esos ítems no suman."
      ]
    }
  ]
};
