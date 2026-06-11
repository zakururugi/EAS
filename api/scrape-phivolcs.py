"""
Python serverless function to scrape PHIVOLCS earthquake data.
Runs on Vercel with the Python runtime.

Endpoint: GET /api/scrape-phivolcs
Protected by: Authorization: Bearer <CRON_SECRET>
Schedule: Called by cron-job.org every minute

Returns JSON:
  { "last_updated": "2026-06-11T...", "earthquakes": [...], "count": N }

Earthquake fields:
  - id, magnitude, place, time, depth, latitude, longitude, source="PHIVOLCS"
"""

import os
import json
import re
import html
from datetime import datetime
from http.server import BaseHTTPRequestHandler

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    # Fallback: Vercel Python runtime should have packages from requirements.txt
    pass


# Philippines bounding box for filtering
PH_MIN_LAT = 4.5
PH_MAX_LAT = 21.5
PH_MIN_LON = 116.5
PH_MAX_LON = 126.5

# PHIVOLCS earthquake page URL
PHIVOLCS_URL = "https://earthquake.phivolcs.dost.gov.ph/"


def is_within_philippines(lat, lon):
    """Check if coordinates are within the Philippines bounding box."""
    if lat is None or lon is None:
        return False
    return (PH_MIN_LAT <= lat <= PH_MAX_LAT and
            PH_MIN_LON <= lon <= PH_MAX_LON)


def parse_phivolcs_date(date_str):
    """
    Parse PHIVOLCS date/time strings.
    Common formats:
      - "11 Jun 2026 10:32 PM"
      - "11 June 2026 - 10:32 PM"
      - "06/11/2026 10:32:00"
    """
    if not date_str:
        return int(datetime.now().timestamp() * 1000)

    date_str = date_str.strip()

    # Try multiple formats
    formats = [
        "%d %b %Y %I:%M %p",
        "%d %B %Y %I:%M %p",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d %b %Y - %I:%M %p",
        "%d %B %Y - %I:%M %p",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue

    # Try with regex: extract date parts
    match = re.search(r'(\d{1,2})\s+(\w+)\s+(\d{4})', date_str)
    if match:
        day, month_str, year = match.groups()
        month_map = {
            'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
            'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
            'january': 1, 'february': 2, 'march': 3, 'april': 4, 'june': 6,
            'july': 7, 'august': 8, 'september': 9, 'october': 10,
            'november': 11, 'december': 12,
        }
        month = month_map.get(month_str.lower(), 1)
        return int(datetime(int(year), month, int(day)).timestamp() * 1000)

    return int(datetime.now().timestamp() * 1000)


def parse_coordinates(coord_str):
    """
    Parse coordinate strings like:
      - "18.46°N, 120.82°E"
      - "18.46, 120.82"
      - "9.78°N - 124.98°E"
    """
    if not coord_str:
        return None, None

    coord_str = coord_str.strip()

    # Pattern: digits with optional ° symbol and N/S/E/W
    pattern = r'([\d.]+)°?\s*([NSEW])'
    matches = re.findall(pattern, coord_str, re.IGNORECASE)

    lat = None
    lon = None

    for value, direction in matches:
        val = float(value)
        if direction.upper() in ('N', 'S'):
            lat = val if direction.upper() == 'N' else -val
        elif direction.upper() in ('E', 'W'):
            lon = val if direction.upper() == 'E' else -val

    # If no direction suffixes, try plain numbers
    if lat is None and lon is None:
        parts = re.findall(r'[\d.]+', coord_str)
        if len(parts) >= 2:
            lat = float(parts[0])
            lon = float(parts[1])

    return lat, lon


def parse_depth(depth_str):
    """
    Parse depth strings like:
      - "10 km"
      - "15km"
      - "10"
      - "001"
    """
    if not depth_str:
        return 0

    depth_str = depth_str.strip()
    match = re.search(r'([\d.]+)', depth_str)
    if match:
        return float(match.group(1))
    return 0


def scrape_phivolcs():
    """
    Fetch and parse the PHIVOLCS earthquake page.
    Returns a list of earthquake dicts.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                      'AppleWebKit/537.36 (KHTML, like Gecko) '
                      'Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    response = requests.get(PHIVOLCS_URL, headers=headers, timeout=30)
    response.raise_for_status()
    response.encoding = 'utf-8'

    soup = BeautifulSoup(response.text, 'html.parser')
    earthquakes = []

    # Strategy 1: Look for tables with earthquake data
    tables = soup.find_all('table')
    for table in tables:
        rows = table.find_all('tr')
        if len(rows) < 2:
            continue

        # Check if this looks like an earthquake table
        header_text = table.get_text().lower()
        if not any(kw in header_text for kw in ['magnitude', 'mag', 'depth',
                                                  'location', 'lat', 'time']):
            continue

        # Determine column indices by parsing header row
        header_cells = rows[0].find_all(['th', 'td'])
        col_map = {}
        for i, cell in enumerate(header_cells):
            text = cell.get_text().strip().lower()
            if any(kw in text for kw in ['mag', 'magnitude']):
                col_map['magnitude'] = i
            elif any(kw in text for kw in ['depth']):
                col_map['depth'] = i
            elif any(kw in text for kw in ['lat', 'latitude']):
                col_map['latitude'] = i
            elif any(kw in text for kw in ['lon', 'long']):
                col_map['longitude'] = i
            elif any(kw in text for kw in ['location', 'place', 'origin']):
                col_map['place'] = i
            elif any(kw in text for kw in ['date', 'time', 'date/time']):
                col_map['time'] = i
            elif any(kw in text for kw in ['coordinates', 'coord']):
                col_map['coordinates'] = i

        if 'magnitude' not in col_map:
            continue

        # Parse data rows
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue

            event = {
                'id': f"phivolcs-{len(earthquakes)}-{datetime.now().timestamp()}",
                'source': 'PHIVOLCS',
                'magnitude': 0,
                'place': '',
                'depth': 0,
                'latitude': None,
                'longitude': None,
                'time': int(datetime.now().timestamp() * 1000),
            }

            for field, idx in col_map.items():
                if idx < len(cells):
                    text = cells[idx].get_text().strip()
                    text = html.unescape(text)

                    if field == 'magnitude':
                        try:
                            event['magnitude'] = float(re.search(r'[\d.]+', text).group())
                        except (AttributeError, ValueError):
                            event['magnitude'] = 0
                    elif field == 'depth':
                        event['depth'] = parse_depth(text)
                    elif field == 'place':
                        event['place'] = text
                    elif field == 'time':
                        parsed = parse_phivolcs_date(text)
                        event['time'] = parsed
                    elif field == 'coordinates':
                        lat, lon = parse_coordinates(text)
                        event['latitude'] = lat
                        event['longitude'] = lon
                    elif field == 'latitude':
                        try:
                            event['latitude'] = float(re.search(r'[\d.]+', text).group())
                        except (AttributeError, ValueError):
                            pass
                    elif field == 'longitude':
                        try:
                            event['longitude'] = float(re.search(r'[\d.]+', text).group())
                        except (AttributeError, ValueError):
                            pass

            # Assign a stable ID
            event_id_str = f"ph-{event['time']}-{event['magnitude']}-{event['latitude'] or 0}-{event['longitude'] or 0}"
            event['id'] = event_id_str

            # Filter to Philippines only
            lat = event['latitude']
            lon = event['longitude']
            if lat is not None and lon is not None:
                if not is_within_philippines(lat, lon):
                    continue

            if event['magnitude'] > 0 and event['place']:
                earthquakes.append(event)

        if earthquakes:
            break  # Found data in this table

    # Strategy 2: If no table found, look for div-based listings
    if not earthquakes:
        # Look for earthquake list items
        items = soup.select('.earthquake-item, .eq-item, .quake-item, '
                            '[class*="earthquake"], [class*="eq-list"]')
        for item in items:
            text = item.get_text()

            mag_match = re.search(r'mag[\s:]*([\d.]+)', text, re.IGNORECASE)
            depth_match = re.search(r'depth[\s:]*([\d.]+)', text, re.IGNORECASE)
            coord_match = re.search(r'([\d.]+)°?\s*[NnSs],?\s*([\d.]+)°?\s*[EeWw]', text)
            time_match = re.search(r'(\d{1,2}\s+\w+\s+\d{4})', text)

            mag = float(mag_match.group(1)) if mag_match else 0
            depth = float(depth_match.group(1)) if depth_match else 0
            lat, lon = None, None
            if coord_match:
                lat = float(coord_match.group(1))
                lon = float(coord_match.group(2))

            if lat is not None and lon is not None:
                if not is_within_philippines(lat, lon):
                    continue

            if mag > 0:
                event = {
                    'id': f"ph-{datetime.now().timestamp()}-{mag}",
                    'source': 'PHIVOLCS',
                    'magnitude': mag,
                    'place': text[:100].replace('\n', ' ').strip(),
                    'depth': depth,
                    'latitude': lat,
                    'longitude': lon,
                    'time': int(datetime.now().timestamp() * 1000),
                }
                earthquakes.append(event)

    return earthquakes


class handler(BaseHTTPRequestHandler):
    """Vercel Python serverless function handler."""

    def do_GET(self):
        return self.handle_request()

    def do_POST(self):
        return self.handle_request()

    def handle_request(self):
        # Verify CRON_SECRET
        secret = os.environ.get('CRON_SECRET', '')
        auth_header = self.headers.get('Authorization', '')

        if not secret:
            self.send_json(500, {
                'error': 'CRON_SECRET not configured on server',
                'hint': 'Set CRON_SECRET environment variable in Vercel Dashboard',
            })
            return

        expected = f"Bearer {secret}"
        if auth_header != expected:
            self.send_json(401, {'error': 'Unauthorized. Invalid or missing CRON_SECRET.'})
            return

        try:
            earthquakes = scrape_phivolcs()

            # Sort by time descending
            earthquakes.sort(key=lambda e: e.get('time', 0), reverse=True)

            result = {
                'last_updated': datetime.now().isoformat(),
                'count': len(earthquakes),
                'earthquakes': earthquakes,
            }

            self.send_json(200, result)

        except requests.exceptions.RequestException as e:
            self.send_json(502, {
                'error': f'Failed to fetch PHIVOLCS page: {str(e)}',
            })
        except Exception as e:
            self.send_json(500, {
                'error': f'Scraping failed: {str(e)}',
            })

    def send_json(self, status, data):
        """Send a JSON response."""
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)