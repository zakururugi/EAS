const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value, name) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    const error = new Error(`${name} must use YYYY-MM-DD format.`);
    error.statusCode = 400;
    throw error;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    const error = new Error(`${name} is not a valid calendar date.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export function decodeHistoryCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 256) {
    const error = new Error('Invalid history cursor.');
    error.statusCode = 400;
    throw error;
  }

  let decoded;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    const error = new Error('Invalid history cursor.');
    error.statusCode = 400;
    throw error;
  }

  const separator = decoded.lastIndexOf('|');
  if (separator < 0) {
    const error = new Error('Invalid history cursor.');
    error.statusCode = 400;
    throw error;
  }

  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!Number.isFinite(Date.parse(timestamp)) || !UUID_PATTERN.test(id)) {
    const error = new Error('Invalid history cursor.');
    error.statusCode = 400;
    throw error;
  }
  return { timestamp: new Date(timestamp).toISOString(), id };
}

export function encodeHistoryCursor(timestamp, id) {
  if (!Number.isFinite(new Date(timestamp).getTime()) || !UUID_PATTERN.test(String(id))) {
    throw new TypeError('Cannot encode an invalid history cursor.');
  }
  return Buffer.from(`${new Date(timestamp).toISOString()}|${id}`).toString('base64url');
}

export function parseHistoryQuery(query = {}) {
  const from = parseDateOnly(query.from, 'from');
  const to = parseDateOnly(query.to, 'to');
  if (from && to && from > to) {
    const error = new Error('from must be on or before to.');
    error.statusCode = 400;
    throw error;
  }

  const minMagnitude = query.min_magnitude == null || query.min_magnitude === ''
    ? null
    : Number(query.min_magnitude);
  if (minMagnitude !== null && (!Number.isFinite(minMagnitude) || minMagnitude < 0 || minMagnitude > 10)) {
    const error = new Error('min_magnitude must be between 0 and 10.');
    error.statusCode = 400;
    throw error;
  }

  const limit = query.limit == null || query.limit === '' ? 200 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    const error = new Error('limit must be a whole number from 1 to 500.');
    error.statusCode = 400;
    throw error;
  }

  return {
    from: from ? `${from}T00:00:00.000Z` : null,
    to: to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000).toISOString() : null,
    minMagnitude,
    limit,
    cursor: decodeHistoryCursor(query.cursor),
  };
}
