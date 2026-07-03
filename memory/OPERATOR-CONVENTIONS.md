# Operator conventions — quoting & time (Maya standing preferences)

> Mirror policy (CLAUDE.md §A.3): this file is mirrored byte-identical to
> `C:\Users\MayaAllan\Desktop\memory\OPERATOR-CONVENTIONS.md`.

## TIME — quote Eastern Time to Maya (added 2026-06-13, Maya directive)

**Always quote times to Maya in US Eastern Time (America/New_York), not UTC.**
Maya thinks in Eastern; quoting raw UTC (e.g. "06-14 03:55Z") caused repeated
date confusion — the run she experiences "tonight" is a UTC timestamp dated the
*next* calendar day.

- Keep machine/DB/log evidence in UTC internally (that is the authoritative
  clock — the production Neon DB `now()` and Vercel logs are UTC), but **state
  the Eastern equivalent when talking to Maya.** When precision matters, show
  both: "11:30 PM EDT 06-13 (03:30 UTC 06-14)".
- June–early Nov = **EDT = UTC−4**. Nov–Mar = **EST = UTC−5**. (mallan.nyc is NYC.)

### The cron schedule in Eastern (EDT, UTC−4)

The feed-reconcile / settlement clock especially:

| Cron (UTC schedule)            | UTC time | **Eastern (EDT)**        |
|--------------------------------|----------|--------------------------|
| feed-reconcile `30 3 * * *`    | 03:30 Z  | **11:30 PM EDT (prev day)** |
| C6 settlement window 03:28–03:55 Z | —    | **11:28–11:55 PM EDT (prev day)** |
| data-retention `0 3 * * *`     | 03:00 Z  | 11:00 PM EDT (prev day)  |
| idx-sync `*/10`                | —        | every 10 min             |
| media-sync `*/15`              | —        | every 15 min             |

**KEY TRAP (the one that kept biting): the UTC date label is one calendar day
AHEAD of the Eastern "tonight."** The run whose UTC window is dated `06-14T03:30Z`
actually fires **tonight, ~11:30 PM EDT, on the PRIOR Eastern date.** Always lead
with the Eastern "tonight / tomorrow night," and treat the UTC date in the
verifier var as just a machine parameter, not the day Maya experiences.

Worked anchor (machine ground truth, do not assert weekdays from memory — read
`Get-Date`): on **Sat 2026-06-13 ~6 PM EDT (22:04 UTC)**:
- **Tonight, Sat 06-13, ~11:30 PM EDT** → verifier UTC window `06-14T03:28–03:55Z`.
- **Tomorrow night, Sun 06-14, ~11:30 PM EDT** → verifier UTC window `06-15T03:28–03:55Z`.

Root cause of the confusion: UTC 03:30 *looks like* "the next day" but is late
evening of the SAME Eastern day. The verifier's DB-clock guard
(`scripts/__c6-night1-verify.mjs`, FUTURE_WINDOW) now prints the authoritative
DB time, and — per Maya 2026-06-13 — **always read `Get-Date` for the real local
weekday/date rather than asserting it.**
