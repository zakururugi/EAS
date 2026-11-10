/**
 * USGS ComCat/FDSN supplemental event adapter.
 *
 * This adapter never grants notification eligibility. It only returns
 * source-specific USGS records for archive, detail, and comparison workflows.
 */

import axios from 'axios';

const USGS_QUERY_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const MAX_PAGE_SIZE = 20000;
const MAX_PAGES = 10;

export function normalizeUsgsFeature(feature) {
  const properties = feature?.properties || {};
  const coordinates = feature?.geometry?.coordinates;
  const time = Number(properties.time);
  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  const depthValue = coordinates?.[2];
  const depth = depthValue == null ? null : Number(depthValue);
  const magnitudeValue = properties.mag;
  const magnitude = magnitudeValue == null ? null : Number(magnitudeValue);
  const id = feature?.id || properties.code;

  if (
    typeof id !== 'string' || !id ||
    !Number.isFinite(time) || time <= 0 ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    (depth !== null && !Number.isFinite(depth)) ||
    (magnitude !== null && !Number.isFinite(magnitude))
  ) return null;

  return {
    id,
    eventId: id,
    source: 'USGS',
    magnitude,
    magnitudeType: properties.magType || null,
    place: properties.place || 'Location unavailable',
    time,
    updated: Number.isFinite(Number(properties.updated)) ? Number(properties.updated) : time,
    depth,
    latitude,
    longitude,
    url: properties.url || null,
    detailUrl: properties.detail || null,
    felt: properties.felt ?? null,
    mmi: properties.mmi ?? null,
    alert: properties.alert || null,
    status: properties.status || null,
    tsunami: properties.tsunami ?? null,
    significance: properties.sig ?? null,
    eventType: properties.type || null,
    rawProperties: properties,
  };
}

function validateQuery({ startTime, endTime, limit = MAX_PAGE_SIZE, maxPages = MAX_PAGES }) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new TypeError('USGS query requires a valid startTime earlier than endTime.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new TypeError(`USGS page limit must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new TypeError('USGS maxPages must be an integer from 1 to 10.');
  }
  return { start, end, limit, maxPages };
}

/**
 * Fetch a bounded time window from the official USGS FDSN event service.
 * If the window exceeds the service page budget, fail so the caller can split
 * the window rather than silently truncating historical coverage.
 */
export async function fetchUsgsEvents({
  startTime,
  endTime,
  minLatitude,
  maxLatitude,
  minLongitude,
  maxLongitude,
  limit = MAX_PAGE_SIZE,
  maxPages = MAX_PAGES,
} = {}) {
  const validated = validateQuery({ startTime, endTime, limit, maxPages });
  const bounds = [minLatitude, maxLatitude, minLongitude, maxLongitude];
  if (bounds.some((value) => value !== undefined && !Number.isFinite(Number(value)))) {
    throw new TypeError('USGS geographic bounds must be finite numbers.');
  }
  if (
    bounds.every((value) => value !== undefined) &&
    (Number(minLatitude) >= Number(maxLatitude) || Number(minLongitude) >= Number(maxLongitude))
  ) {
    throw new TypeError('USGS geographic bounds are invalid.');
  }

  const allEvents = [];
  let offset = 1;
  let totalCount = null;

  for (let page = 0; page < validated.maxPages; page++) {
    const params = {
      format: 'geojson',
      starttime: validated.start.toISOString(),
      endtime: validated.end.toISOString(),
      orderby: 'time-asc',
      limit,
      offset,
    };

    if (minLatitude !== undefined) params.minlatitude = Number(minLatitude);
    if (maxLatitude !== undefined) params.maxlatitude = Number(maxLatitude);
    if (minLongitude !== undefined) params.minlongitude = Number(minLongitude);
    if (maxLongitude !== undefined) params.maxlongitude = Number(maxLongitude);

    const response = await axios.get(USGS_QUERY_URL, {
      params,
      timeout: 25000,
      headers: { Accept: 'application/geo+json, application/json' },
    });

    const payload = response.data;
    if (!payload || !Array.isArray(payload.features)) {
      throw new Error('USGS FDSN returned an invalid GeoJSON feature collection.');
    }

    totalCount = Number.isFinite(Number(payload.metadata?.count))
      ? Number(payload.metadata.count)
      : null;

    const pageEvents = payload.features.map(normalizeUsgsFeature).filter(Boolean);
    allEvents.push(...pageEvents);

    if (payload.features.length < limit) break;
    offset += payload.features.length;

    if (totalCount !== null && offset > totalCount) break;
    if (page === validated.maxPages - 1) {
      throw new Error('USGS query exceeded the page budget; split the time window to avoid truncating history.');
    }
  }

  const unique = new Map();
  for (const event of allEvents) unique.set(event.id, event);
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

export { USGS_QUERY_URL };

function safeUsgsProductUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'earthquake.usgs.gov') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function choosePreferredProduct(products = []) {
  if (!Array.isArray(products) || products.length === 0) return null;
  return [...products].sort((a, b) => {
    const weight = Number(b.preferredWeight || 0) - Number(a.preferredWeight || 0);
    if (weight !== 0) return weight;
    return Number(b.updateTime || 0) - Number(a.updateTime || 0);
  })[0];
}

export function extractUsgsProducts(properties = {}, baseUrl = 'https://earthquake.usgs.gov/') {
  const productGroups = properties.products || {};
  const extract = (kind, patterns) => {
    const product = choosePreferredProduct(productGroups[kind]);
    if (!product) return null;
    const contents = product.contents || {};
    const files = {};
    for (const [name, entry] of Object.entries(contents)) {
      const url = safeUsgsProductUrl(entry?.url, baseUrl);
      if (url) files[name] = url;
    }
    const findFile = (pattern) => {
      const found = Object.entries(files).find(([name]) => pattern.test(name));
      return found?.[1] || null;
    };
    return {
      type: kind.toUpperCase(),
      code: product.code || product.id || '',
      source: product.source || null,
      status: product.status || null,
      updateTime: product.updateTime || null,
      preferredWeight: product.preferredWeight ?? null,
      productUrl: safeUsgsProductUrl(product.properties?.url, baseUrl),
      contourUrl: patterns.contour ? findFile(patterns.contour) : null,
      geoJsonUrl: patterns.geoJson ? findFile(patterns.geoJson) : null,
      files,
      rawProperties: product.properties || {},
    };
  };

  return {
    shakemap: extract('shakemap', {
      contour: /cont_mi\\.(?:json|geojson)$/i,
    }),
    dyfi: extract('dyfi', {
      geoJson: /dyfi_geo\\.(?:json|geojson)$/i,
    }),
  };
}

async function fetchUsgsProductJson(url) {
  if (!url) return null;
  const response = await axios.get(url, {
    timeout: 20000,
    maxContentLength: 10 * 1024 * 1024,
    headers: { Accept: 'application/geo+json, application/json' },
  });
  if (!response.data || typeof response.data !== 'object') {
    throw new Error('USGS product endpoint returned invalid JSON.');
  }
  return response.data;
}

/**
 * Fetch official USGS event detail plus preferred ShakeMap and DYFI products.
 * Missing products are returned as null; product URLs are restricted to the
 * official earthquake.usgs.gov host to prevent arbitrary URL fetching.
 */
export async function fetchUsgsEventProducts(eventId) {
  if (typeof eventId !== 'string' || !/^[A-Za-z0-9._-]{1,80}$/.test(eventId)) {
    throw new TypeError('Invalid USGS event ID.');
  }

  const response = await axios.get(USGS_QUERY_URL, {
    params: { format: 'geojson', eventid: eventId },
    timeout: 20000,
    headers: { Accept: 'application/geo+json, application/json' },
  });
  const feature = response.data?.features?.[0];
  if (!feature) throw new Error('USGS event was not found.');

  const initialProperties = feature.properties || {};
  const detailUrl = safeUsgsProductUrl(initialProperties.detail, USGS_QUERY_URL);
  if (!detailUrl) throw new Error('USGS event detail URL is unavailable.');

  const detailResponse = await axios.get(detailUrl, {
    timeout: 20000,
    maxContentLength: 10 * 1024 * 1024,
    headers: { Accept: 'application/geo+json, application/json' },
  });
  const detailFeature = detailResponse.data?.features?.[0] || detailResponse.data;
  const properties = detailFeature?.properties || {};
  const products = extractUsgsProducts(properties, detailUrl);

  const [shakemapResult, dyfiResult] = await Promise.allSettled([
    fetchUsgsProductJson(products.shakemap?.contourUrl),
    fetchUsgsProductJson(products.dyfi?.geoJsonUrl),
  ]);

  return {
    eventId,
    detailUrl,
    magnitude: properties.mag ?? initialProperties.mag ?? null,
    magnitudeType: properties.magType || initialProperties.magType || null,
    felt: properties.felt ?? initialProperties.felt ?? null,
    mmi: properties.mmi ?? initialProperties.mmi ?? null,
    alert: properties.alert || initialProperties.alert || null,
    shakemap: products.shakemap
      ? { ...products.shakemap, geojson: shakemapResult.status === 'fulfilled' ? shakemapResult.value : null,
          fetchError: shakemapResult.status === 'rejected' ? shakemapResult.reason.message : null }
      : null,
    dyfi: products.dyfi
      ? { ...products.dyfi, geojson: dyfiResult.status === 'fulfilled' ? dyfiResult.value : null,
          fetchError: dyfiResult.status === 'rejected' ? dyfiResult.reason.message : null }
      : null,
  };
}
