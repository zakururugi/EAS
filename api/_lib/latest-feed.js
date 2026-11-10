/**
 * Pure helpers for validating and preparing the PHIVOLCS latest-event response.
 * Kept separate from the serverless handler so feed contract behavior is testable.
 */

export function prepareLatestEvents(events, { minMagnitude = 0, limit = 200 } = {}) {
  if (!Array.isArray(events)) {
    throw new TypeError('PHIVOLCS adapter returned a non-array event payload.');
  }

  return events
    .filter((event) => (
      event &&
      Number.isFinite(Number(event.time)) &&
      Number.isFinite(Number(event.magnitude)) &&
      Number.isFinite(Number(event.latitude)) &&
      Number.isFinite(Number(event.longitude)) &&
      Number.isFinite(Number(event.depth)) &&
      Number(event.magnitude) >= minMagnitude
    ))
    .sort((a, b) => Number(b.time) - Number(a.time))
    .slice(0, limit);
}

export function parseBoundedNumber(value, fallback, min, max, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    const error = new Error(`Invalid ${name}; expected a value from ${min} to ${max}.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}
