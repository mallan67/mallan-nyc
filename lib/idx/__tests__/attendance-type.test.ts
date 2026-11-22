/**
 * AttendanceType (REBNY custom field, CustomProperty.CustomFields): the members live Cotality serves.
 *
 * RLS renamed the Doorman members to Doorperson on 2026-11-17 and said it would backfill every affected
 * listing. Maya's decision (2026-11-19): follow live, keep no old spelling, update the mapping.
 * Live read 2026-11-19 (9,668 Active listings): DoorpersonFullTime, DoorpersonPartTime, DoorpersonYes,
 * VideoDoorpersonFullTime, VideoDoorpersonPartTime, VideoDoorpersonYes. AttendanceType has no Lookup table,
 * so the live rows are the evidence. The RLS notice spells one member "VideoDoorPersonFullTime" (capital P);
 * no live row does.
 */
import {
  ATTENDANCE_TYPE_MEMBERS,
  DOORPERSON_MEMBERS,
  attendanceAmenities,
  attendanceHasMember,
  hasDoorperson,
} from '@/lib/idx/attendance-type';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';

describe('AttendanceType members', () => {
  it('are the members the REBNY validator accepts (one list, no drift)', () => {
    expect([...REBNY_FIELD_TABLES.enumValues.AttendanceType].sort()).toEqual([...ATTENDANCE_TYPE_MEMBERS].sort());
  });

  it('lists the live members and no Doorman spelling', () => {
    expect([...ATTENDANCE_TYPE_MEMBERS].sort()).toEqual([
      'ConciergeFullTime', 'ConciergePartTime', 'ConciergeYes',
      'DoorpersonFullTime', 'DoorpersonPartTime', 'DoorpersonYes',
      'ElevatorAttendanceFullTime', 'ElevatorAttendancePartTime', 'ElevatorAttendanceYes',
      'LobbyAttendantFullTime', 'LobbyAttendantPartTime', 'LobbyAttendantYes',
      'None',
      'VideoDoorpersonFullTime', 'VideoDoorpersonPartTime', 'VideoDoorpersonYes',
    ].sort());
  });
});

describe('attendanceAmenities', () => {
  it('a full-time doorperson is a 24hr Doorman', () => {
    expect(attendanceAmenities(['DoorpersonFullTime'])).toEqual(['24hr Doorman']);
  });

  it('a part-time or unspecified doorperson is a Doorman', () => {
    expect(attendanceAmenities(['DoorpersonPartTime'])).toEqual(['Doorman']);
    expect(attendanceAmenities(['DoorpersonYes'])).toEqual(['Doorman']);
  });

  it('a video doorperson of any hours is a Virtual Doorman', () => {
    expect(attendanceAmenities(['VideoDoorpersonFullTime'])).toEqual(['Virtual Doorman']);
    expect(attendanceAmenities(['VideoDoorpersonPartTime'])).toEqual(['Virtual Doorman']);
    expect(attendanceAmenities(['VideoDoorpersonYes'])).toEqual(['Virtual Doorman']);
  });

  it("reads the notice's capital-P spelling of the video member the same way (live uses a lowercase p)", () => {
    expect(attendanceAmenities(['VideoDoorPersonFullTime'])).toEqual(['Virtual Doorman']);
  });

  it('keeps the lobby attendant and concierge mapping', () => {
    expect(attendanceAmenities(['LobbyAttendantFullTime', 'ConciergeYes']).sort()).toEqual(['Attended Lobby', 'Concierge']);
  });

  it('says nothing for None, and nothing for the retired Doorman spellings', () => {
    expect(attendanceAmenities(['None'])).toEqual([]);
    expect(attendanceAmenities(['DoormanFullTime', 'DoormanPartTime', 'DoormanYes'])).toEqual([]);
    expect(attendanceAmenities(['VideoDoormanFullTime', 'VideoDoormanPartTime', 'VideoDoormanYes'])).toEqual([]);
  });
});

describe('attendanceHasMember (the public Doorperson filter reads whole members)', () => {
  it('the Doorperson members are live members, and exclude every video member', () => {
    for (const m of DOORPERSON_MEMBERS) expect(ATTENDANCE_TYPE_MEMBERS).toContain(m);
    expect(DOORPERSON_MEMBERS.some((m) => /video/i.test(m))).toBe(false);
  });

  it('finds a member in a comma list or an array, in any case, around spaces', () => {
    expect(attendanceHasMember('LobbyAttendantYes, DoorpersonPartTime', DOORPERSON_MEMBERS)).toBe(true);
    expect(attendanceHasMember(['conciergeyes', 'DOORPERSONFULLTIME'], DOORPERSON_MEMBERS)).toBe(true);
  });

  it('is not a substring test: a video doorperson is not a doorperson', () => {
    expect(attendanceHasMember('VideoDoorpersonFullTime', DOORPERSON_MEMBERS)).toBe(false);
    expect(attendanceHasMember('VideoDoorPersonFullTime', DOORPERSON_MEMBERS)).toBe(false);
    expect(attendanceHasMember(['VideoDoorpersonYes', 'VideoDoorpersonPartTime'], DOORPERSON_MEMBERS)).toBe(false);
  });

  it('is false for concierge, None, the retired Doorman spellings, blank and missing values', () => {
    for (const v of ['ConciergeFullTime', 'None', 'DoormanFullTime', 'DoormanYes', '', null, undefined, []]) {
      expect(attendanceHasMember(v, DOORPERSON_MEMBERS)).toBe(false);
    }
  });
});

describe('hasDoorperson', () => {
  it('is true for any doorperson or video doorperson member, in a comma list or an array', () => {
    expect(hasDoorperson('DoorpersonFullTime,LobbyAttendantFullTime')).toBe(true);
    expect(hasDoorperson(['ConciergeYes', 'VideoDoorpersonYes'])).toBe(true);
  });

  it('is false for concierge, lobby, None, empty and the retired Doorman spellings', () => {
    expect(hasDoorperson('ConciergeFullTime,LobbyAttendantYes')).toBe(false);
    expect(hasDoorperson('None')).toBe(false);
    expect(hasDoorperson('')).toBe(false);
    expect(hasDoorperson(null)).toBe(false);
    expect(hasDoorperson('DoormanFullTime')).toBe(false);
  });
});
