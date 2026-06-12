import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  // Allow GET requests only
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = 'https://earthquake.phivolcs.dost.gov.ph/';

  try {
    // 1. Fetch the HTML
    const { data: html } = await axios.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YourApp/1.0)'
      }
    });

    // 2. Parse with Cheerio
    const $ = cheerio.load(html);

    // 3. Find the earthquake table – you need to inspect the actual page
    //    The site might use a <table> with class "table" or an id "eqTable"
    //    Below is a flexible selector; adjust after inspecting.
    let tableRows = [];

    // Try common selectors (inspect the page to pick the correct one)
    const table = $('table.table').first(); // or $('table').eq(0)
    if (table.length === 0) {
      throw new Error('Earthquake table not found. The site structure may have changed.');
    }

    table.find('tbody tr').each((i, row) => {
      const cells = $(row).find('td');
      if (cells.length >= 4) {
        const datetime = $(cells[0]).text().trim();
        const depth = $(cells[1]).text().trim();
        const magnitude = $(cells[2]).text().trim();
        const location = $(cells[3]).text().trim();
        tableRows.push({ datetime, depth, magnitude, location });
      }
    });

    // 4. Return JSON
    res.status(200).json({
      source: 'PHIVOLCS',
      fetchedAt: new Date().toISOString(),
      count: tableRows.length,
      earthquakes: tableRows
    });

  } catch (error) {
    console.error('[PHIVOLCS Scraper]', error.message);
    res.status(502).json({ error: 'Failed to fetch or parse PHIVOLCS data' });
  }
}
