// Ayuda · Costos operativos — REGLA DEL MÉTODO (28/09): toda ola que cambie este módulo
// actualiza esta página EN EL MISMO zip. El formato lo renderiza AyudaPanel.
export default {
  "id": "costos",
  "titulo": "Costos operativos",
  "intro": "La capacidad del área, su ociosidad y el reparto del costo laboral mensual entre las unidades de la cooperativa y Cooptech.",
  "secciones": [
    {
      "titulo": "El criterio",
      "parrafos": [
        "Tres sub-solapas: Capacidad (CMT → CMP → NAP → NAR, en días, con la ociosidad), Distribución por unidad (persona por persona, semana a semana) y Resumen mensual (la tabla consolidada).",
        "Lo que no se asigna a ninguna unidad queda como Cooptech; la división I+D vs. gasto sale de la «Función para costos» de cada persona en Equipo."
      ]
    },
    {
      "titulo": "¿Cómo hago…?",
      "recetas": [
        {
          "q": "Cargar los datos del mes",
          "pasos": [
            "Tocá un mes en Capacidad (o el botón «⚙ Settings del mes»).",
            "Cargá el costo laboral total (ARS), la cotización del dólar y el peso % de cada colaborador (tiene que sumar 100%: verde si da, rojo si no).",
            "Guardar."
          ],
          "rol": "manager"
        },
        {
          "q": "Distribuir la semana de una persona",
          "pasos": [
            "Distribución por unidad → elegí mes y colaborador.",
            "Cada semana pesa 1/N del mes: asigná % a cada unidad (Adm., Energía, Agua, Tele., Canal 50, CAC, Alm./Taller, Serv. Soc.).",
            "«Traer de la grilla» copia el resumen semanal; los campos guardan solos al salir."
          ]
        },
        {
          "q": "Exportar para administración",
          "pasos": [
            "«⬇ Exportar Excel anualizado» (arriba): usa el formato exacto de la planilla de administración — se reemplaza el archivo y listo.",
            "Desde Resumen mensual también se exporta solo el mes."
          ]
        }
      ]
    },
    {
      "titulo": "Conviene saber",
      "items": [
        "Cuentan solo los colaboradores internos con al menos un día activo en el mes (aunque hoy estén de baja).",
        "Una semana toda de vacaciones/franco/licencia avisa «no corresponde asignar pesos».",
        "El resumen semanal de Costos no modifica la grilla.",
        "Por defecto la ve el manager (gerencial puede leer los datos); se otorga desde Permisos."
      ]
    }
  ]
};
