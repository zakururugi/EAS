"""
Scrape PHIVOLCS earthquake data from the official website.
Endpoint: GET /api/scrape-phivolcs (also accepts POST)
Protected by: Authorization: Bearer <CRON_SECRET>

Returns JSON:
{
  "last_updated": "2026-06-11T12:34:56",
  "count": 5,
  "earthquakes": [ { "date_time": "...", "magnitude": "4.2", ... } ]
}
"""

import os
import json
import re
from datetime import datetime

import requests
from bs4 import BeautifulSoup


def handler(request, response):
    """
    Vercel Python serverless function entry point.
    """
    # --- 1. Authorization check ---
    secret = os.environ.get('CRON_SECRET')
    auth_header = request.headers.get('authorization', '')

    if not secret:
        response.status_code = 500
        return response.json({
            'error': 'CRON_SECRET environment variable not set'
        })

    expected = f"Bearer {secret}"
    if auth_header != expected:
        response.status_code = 401
        return response.json({'error': 'Unauthorized'})

    # --- 2. Scrape PHIVOLCS data ---
    try:
        earthquakes = scrape_phivolcs()
        result = {
            'last_updated': datetime.now().isoformat(),
            'count': len(earthquakes),
            'earthquakes': earthquakes
        }
        response.status_code = 200
        return response.json(result)

    except requests.exceptions.RequestException as e:
        response.status_code = 502
        return response.json({'error': f'Failed to fetch PHIVOLCS page: {str(e)}'})
    except Exception as e:
        response.status_code = 500
        return response.json({'error': f'Scraping failed: {str(e)}'})


def scrape_phivolcs():
    """
    Fetch and parse earthquake data from PHIVOLCS website.
    Returns a list of earthquake dictionaries.
    """
    url = "https://earthquake.phivolcs.dost.gov.ph/"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) '
                      'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    response.encoding = 'utf-8'

    soup = BeautifulSoup(response.text, 'html.parser')
    earthquakes = []

    # --- Strategy 1: Find a table that looks like earthquake data ---
    tables = soup.find_all('table')
    for table in tables:
        # Check if this table contains typical earthquake columns
        header_row = table.find('tr')
        if not header_row:
            continue
        header_text = header_row.get_text().lower()
        if not any(kw in header_text for kw in ['magnitude', 'mag', 'depth', 'location']):
            continue

        rows = table.find_all('tr')
        if len(rows) < 2:
            continue

        # Identify column indices
        cols = header_row.find_all(['th', 'td'])
        col_map = {}
        for idx, cell in enumerate(cols):
            text = cell.get_text().strip().lower()
            if 'date' in text or 'time' in text:
                col_map['date_time'] = idx
            elif 'magnitude' in text or 'mag' in text:
                col_map['magnitude'] = idx
            elif 'depth' in text:
                col_map['depth'] = idx
            elif 'location' in text or 'place' in text:
                col_map['location'] = idx
            elif 'map' in text or 'link' in text:
                col_map['map_link'] = idx

        # If we have at least magnitude and location, parse rows
        if 'magnitude' in col_map and 'location' in col_map:
            for row in rows[1:]:
                cells = row.find_all('td')
                if len(cells) < max(col_map.values()) + 1:
                    continue

                event = {
                    'date_time': cells[col_map.get('date_time', 0)].get_text(strip=True) if 'date_time' in col_map else '',
                    'magnitude': cells[col_map['magnitude']].get_text(strip=True),
                    'depth': cells[col_map.get('depth', 0)].get_text(strip=True) if 'depth' in col_map else '',
                    'location': cells[col_map['location']].get_text(strip=True),
                    'map_link': ''
                }
                if 'map_link' in col_map:
                    link_tag = cells[col_map['map_link']].find('a')
                    if link_tag and link_tag.get('href'):
                        event['map_link'] = link_tag['href']

                # Only add if magnitude looks like a number
                if re.search(r'[\d.]+', event['magnitude']):
                    earthquakes.append(event)
            break   # Stop after first valid table

    # --- Strategy 2: If no structured table, look for earthquake items in divs ---
    if not earthquakes:
        # Look for divs that contain "magnitude" and "depth"
        potential_divs = soup.find_all('div', class_=re.compile(r'earthquake|eq|quake', re.I))
        if not potential_divs:
            potential_divs = soup.find_all('div', string=re.compile(r'magnitude', re.I))
        for div in potential_divs:
            text = div.get_text()
            mag_match = re.search(r'magnitude\s*[:;]\s*([\d.]+)', text, re.I)
            depth_match = re.search(r'depth\s*[:;]\s*([\d.]+)', text, re.I)
            loc_match = re.search(r'location\s*[:;]\s*(.*?)(?:\n|$)', text, re.I)
            if mag_match:
                earthquakes.append({
                    'date_time': '',
                    'magnitude': mag_match.group(1),
                    'depth': depth_match.group(1) if depth_match else '',
                    'location': loc_match.group(1).strip() if loc_match else text[:100],
                    'map_link': ''
                })

    # --- Strategy 3: Fallback to raw text parsing (very last resort) ---
    if not earthquakes:
        body_text = soup.get_text()
        # Look for earthquake report blocks (commonly appear as numbered lists)
        blocks = re.split(r'\n\d+\.\s+', body_text)
        for block in blocks:
            mag = re.search(r'Magnitude\s*[:;]\s*([\d.]+)', block, re.I)
            loc = re.search(r'Location\s*[:;]\s*([^\n]+)', block, re.I)
            depth = re.search(r'Depth\s*[:;]\s*([\d.]+)', block, re.I)
            if mag:
                earthquakes.append({
                    'date_time': '',
                    'magnitude': mag.group(1),
                    'depth': depth.group(1) if depth else '',
                    'location': loc.group(1).strip() if loc else block[:80],
                    'map_link': ''
                })

    return earthquakes
