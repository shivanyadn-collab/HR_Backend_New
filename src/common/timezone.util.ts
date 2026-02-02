/**
 * Server-side timezone utilities for Asia/Kolkata (IST).
 * Use these so the server is the single source of truth; client device timezone cannot affect stored time.
 */

const IST_TIMEZONE = 'Asia/Kolkata'

/**
 * Convert a UTC Date to IST and return date (YYYY-MM-DD) and time (HH:mm:ss) in IST.
 * Use for storing/displaying punch date and time in India.
 */
export function utcToIST(utcDate: Date): { dateStr: string; timeStr: string } {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utcDate)

  const get = (type: string) => dateParts.find((p) => p.type === type)?.value ?? '00'
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`

  const timeParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcDate)

  const hour = timeParts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = timeParts.find((p) => p.type === 'minute')?.value ?? '00'
  const second = timeParts.find((p) => p.type === 'second')?.value ?? '00'
  const timeStr = `${hour}:${minute}:${second}`

  return { dateStr, timeStr }
}

/**
 * Parse a UTC ISO string (e.g. from client) and return a Date.
 * Use for punchDateTime from client - do not use client's local time strings.
 */
export function parseUTCISO(utcIsoString: string): Date | null {
  const d = new Date(utcIsoString)
  return isNaN(d.getTime()) ? null : d
}
