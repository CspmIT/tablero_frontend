// Videollamada CRM — ola 1: envío manual asistido.
// Genera el archivo .ics (calendario estándar, lo abre Outlook/Google/Teams) y
// el borrador de mail. La ola 2 (Graph API) reemplaza SOLO este tramo: el evento
// se creará directo en el calendario Outlook de la casilla comercial, con link
// de Teams e invitaciones automáticas.

// Texto seguro para .ics (escapa , ; \ y saltos de línea según RFC 5545).
const icsEscape = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// 'YYYY-MM-DD' + 'HH:MM' → 'YYYYMMDDTHHMM00' (hora local flotante: el calendario
// del receptor la interpreta en su zona; correcto para reuniones dentro del país).
const icsLocal = (fecha, hora) => `${fecha.replace(/-/g, '')}T${hora.replace(':', '')}00`;

export function buildVideollamadaICS({ organizacion, fecha, horaInicio, horaFin, notas, emailLead, emailsColaboradores = [] }) {
  const uid = `vc-${fecha}-${horaInicio.replace(':', '')}-${Math.random().toString(36).slice(2, 8)}@tablero.cooptech`;
  const attendees = [emailLead, ...emailsColaboradores].filter(Boolean)
    .map((e) => `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e}`);
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cooptech//Tablero de Mando//ES',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${icsLocal(fecha, horaInicio)}`,
    `DTEND:${icsLocal(fecha, horaFin)}`,
    `SUMMARY:${icsEscape(`Videollamada Cooptech · ${organizacion}`)}`,
    notas ? `DESCRIPTION:${icsEscape(notas)}` : null,
    ...attendees,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lineas.join('\r\n');
}

export function descargarICS(contenido, nombre) {
  const blob = new Blob([contenido], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Borrador de mail (mailto no permite adjuntos: el .ics descargado se adjunta a mano).
export function mailtoVideollamada({ emailLead, organizacion, contactoNombre, fecha, horaInicio, horaFin, notas }) {
  const [y, m, d] = fecha.split('-');
  const asunto = `Videollamada Cooptech · ${organizacion} · ${d}/${m}/${y} ${horaInicio}`;
  const cuerpo = [
    `Hola${contactoNombre ? ' ' + contactoNombre : ''},`,
    '',
    `Te confirmamos la videollamada del ${d}/${m}/${y} de ${horaInicio} a ${horaFin} hs.`,
    notas ? `\n${notas}` : '',
    '',
    'Adjuntamos la invitación de calendario (.ics) para que la agendes con un clic.',
    '',
    'Saludos,',
    'Equipo Cooptech · Coopmorteros',
  ].join('\n');
  const to = emailLead || '';
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}
