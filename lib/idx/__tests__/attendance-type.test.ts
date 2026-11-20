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
  attendanceAmenities,
  hasDoorperson,
} from '@/lib/idx/attendance-type';

describe('AttendanceType members', () => {
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
  it('a full-time doorperson is a 24hr Doorperson', () => {
    expect(attendanceAmenities(['DoorpersonFullTime'])).toEqual(['24hr Doorperson']);
  });

  it('a part-time or unspecified doorperson is a Doorperson', () => {
    expect(attendanceAmenities(['DoorpersonPartTime'])).toEqual(['Doorperson']);
    expect(attendanceAmenities(['DoorpersonYes'])).toEqual(['Doorperson']);
  });

  it('a video doorperson of any hours is a Virtual Doorperson', () => {
    expect(attendanceAmenities(['VideoDoorpersonFullTime'])).toEqual(['Virtual Doorperson']);
    expect(attendanceAmenities(['VideoDoorpersonPartTime'])).toEqual(['Virtual Doorperson']);
    expect(attendanceAmenities(['VideoDoorpersonYes'])).toEqual(['Virtual Doorperson']);
  });

  it("reads the notice's capital-P spelling of the video member the same way (live uses a lowercase p)", () => {
    expect(attendanceAmenities(['VideoDoorPersonFullTime'])).toEqual(['Virtual Doorperson']);
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
