// AttendanceType: the REBNY custom field (CustomProperty.CustomFields) that says who staffs the lobby.
//
// RLS renamed the Doorman members to Doorperson on 2026-11-17 and backfills every affected listing. Maya (2026-11-19): follow live,
// keep no retired spelling. Live read 2026-11-19 (9,668 Active listings): the members below. AttendanceType has no Lookup table, so
// the live rows are the evidence. The RLS notice spells one member "VideoDoorPersonFullTime" (capital P); no live row does, so the
// list carries the live lowercase p and the readers below ignore case.

export const ATTENDANCE_TYPE_MEMBERS = [
  'ConciergeFullTime', 'ConciergePartTime', 'ConciergeYes',
  'DoorpersonFullTime', 'DoorpersonPartTime', 'DoorpersonYes',
  'ElevatorAttendanceFullTime', 'ElevatorAttendancePartTime', 'ElevatorAttendanceYes',
  'LobbyAttendantFullTime', 'LobbyAttendantPartTime', 'LobbyAttendantYes',
  'None',
  'VideoDoorpersonFullTime', 'VideoDoorpersonPartTime', 'VideoDoorpersonYes',
] as const;

/** The amenity words a visitor reads for the AttendanceType members of a listing or building, each once, in the order given. */
export function attendanceAmenities(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of values) {
    const v = raw.trim().toLowerCase();
    if (v === 'doorpersonfulltime') out.add('24hr Doorperson');
    else if (v === 'doorpersonparttime' || v === 'doorpersonyes') out.add('Doorperson');
    else if (v === 'lobbyattendantfulltime' || v === 'lobbyattendantparttime' || v === 'lobbyattendantyes') out.add('Attended Lobby');
    else if (v === 'videodoorpersonfulltime' || v === 'videodoorpersonparttime' || v === 'videodoorpersonyes') out.add('Virtual Doorperson');
    else if (v === 'conciergefulltime' || v === 'conciergeparttime' || v === 'conciergeyes') out.add('Concierge');
  }
  return [...out];
}

/** True when any member is a doorperson or a video doorperson. Takes the comma list the CRM stores or an array. */
export function hasDoorperson(value: string | readonly string[] | null | undefined): boolean {
  if (!value) return false;
  const text = typeof value === 'string' ? value : value.join(',');
  return text.toLowerCase().includes('doorperson');
}
