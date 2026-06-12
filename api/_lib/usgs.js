/**
 * PHIVOLCS Earthquake Helpers.
 *
 * NOTE: USGS has been removed. This module is kept only as a stub
 * for backward compatibility. All data now comes from PHIVOLCS.
 */

export async function fetchLatestEvents() {
  throw new Error('USGS is no longer used. Use phivolcs-scraper instead.');
}

export async function fetchEventDetails() {
  throw new Error('USGS is no longer used. Use phivolcs-scraper instead.');
}

export function findShakeMapContourUrl() {
  return null;
}

export function simplifyEvent(feature) {
  return {};
}