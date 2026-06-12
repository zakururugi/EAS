import fetch from 'node-fetch';

export async function fetchPHIVOLCSEarthquakes() {
  const url = 'https://earthquake.phivolcs.dost.gov.ph/';
  const response = await fetch(url);
  const html = await response.text();
  // Parse using regex or cheerio (but you'd need to install cheerio)
  // For simplicity, return empty array until you implement parsing.
  return [];
}
