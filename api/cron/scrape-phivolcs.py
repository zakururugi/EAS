"""
Python serverless function to scrape PHIVOLCS earthquake data.
Runs on Vercel Python runtime.
Endpoint: GET /api/cron/scrape-phivolcs
Protected by: Authorization: Bearer <CRON_SECRET>
"""

import os
import json
import re
from datetime import datetime

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    requests = None
    BeautifulSoup = None

PHIVOLCS_URL = "https://earthquake.phivolcs.dost.gov.ph/"
PH_MIN_LAT = 4.5
PH_MAX_LAT = 21.5
PH_MIN_LON = 116.5
PH_MAX_LON = 126.5

def is_within_philippines(lat, lon):
    if lat is None or lon is None:
        return False
    return PH_MIN_LAT <= lat <= PH_MAX_LAT and PH_MIN_LON <= lon <= PH_MAX_LON

def scrape_phivolcs():
    if requests is None or BeautifulSoup is None:
        return []
    try:
        response = requests.get(PHIVOLCS_URL, headers={
            'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html'
        }, timeout=15)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f'[scrape-phivolcs] HTTP error: {e}')
        return []
    response.encoding = 'utf-8'
    soup = BeautifulSoup(response.text, 'html.parser')
    earthquakes = []
    # Try table parsing
    for table in soup.find_all('table'):
        rows = table.find_all('tr')
        if len(rows) < 2:
            continue
        header_texts = [c.get_text().strip().lower() for c in rows[0].find_all(['th', 'td'])]
        col_map = {}
        for i, t in enumerate(header_texts):
            if 'mag' in t or 'magnitude' in t: col_map['mag'] = i
            elif 'depth' in t: col_map['depth'] = i
            elif 'lat' in t: col_map['lat'] = i
            elif 'lon' in t: col_map['lon'] = i
            elif 'loc' in t or 'place' in t: col_map['place'] = i
        if 'mag' not in col_map:
            continue
        for row in rows[1:]:
            cells = row.find_all(['td', 'th'])
            if len(cells) < 2:
                continue
            mag_val = 0
            depth_val = 0
            lat_val = None
            lon_val = None
            place_val = ''
            for f, idx in col_map.items():
                if idx < len(cells):
                    txt = cells[idx].get_text().strip()
                    if f == 'mag':
                        m = re.search(r'[\d.]+', txt)
                        if m: mag_val = float(m.group())
                    elif f == 'depth':
                        m = re.search(r'[\d.]+', txt)
                        if m: depth_val = float(m.group())
                    elif f == 'lat':
                        m = re.search(r'[\d.]+', txt)
                        if m: lat_val = float(m.group())
                    elif f == 'lon':
                        m = re.search(r'[\d.]+', txt)
                        if m: lon_val = float(m.group())
                    elif f == 'place':
                        place_val = txt
            if lat_val is not None and lon_val is not None and not is_within_philippines(lat_val, lon_val):
                continue
            if mag_val > 0 and place_val:
                earthquakes.append({
                    'id': f'ph-{datetime.now().timestamp()}-{len(earthquakes)}',
                    'source': 'PHIVOLCS',
                    'magnitude': mag_val,
                    'place': place_val,
                    'depth': depth_val,
                    'latitude': lat_val,
                    'longitude': lon_val,
                    'time': int(datetime.now().timestamp() * 1000),
                })
        if earthquakes:
            break
    # Fallback: simple regex
    if not earthquakes:
        mag_m = re.findall(r'[Mm](?:ag(?:nitude)?)?\s*[:.]?\s*([\d.]+)', soup.get_text())
        lat_m = re.findall(r'([\d.]+)°?\s*[Nn]', soup.get_text())
        lon_m = re.findall(r'([\d.]+)°?\s*[Ee]', soup.get_text())
        for i, ms in enumerate(mag_m[:10]):
            mag = float(ms)
            lat = float(lat_m[i]) if i < len(lat_m) else None
            lon = float(lon_m[i]) if i < len(lon_m) else None
            if lat and lon and not is_within_philippines(lat, lon):
                continue
            if mag >= 3:
                earthquakes.append({
                    'id': f'ph-{datetime.now().timestamp()}-{mag}-{i}',
                    'source': 'PHIVOLCS', 'magnitude': mag,
                    'place': 'Philippines', 'depth': 0,
                    'latitude': lat, 'longitude': lon,
                    'time': int(datetime.now().timestamp() * 1000),
                })
    return earthquakes

class handler:
    def do_GET(self): self._handle()
    def do_POST(self): self._handle()
    def _handle(self):
        secret = os.environ.get('CRON_SECRET', '')
        auth = getattr(self, 'headers', {})
        if hasattr(auth, 'get'):
            auth = auth.get('Authorization', '')
        else:
            auth = ''
        if secret and auth != f'Bearer {secret}':
            self._respond(401, {'error': 'Unauthorized'})
            return
        try:
            earthquakes = scrape_phivolcs()
            self._respond(200, {
                'last_updated': datetime.now().isoformat(),
                'count': len(earthquakes),
                'earthquakes': earthquakes,
            })
        except Exception as e:
            self._respond(200, {
                'last_updated': datetime.now().isoformat(),
                'count': 0, 'earthquakes': [],
                'error': str(e),
            })
    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)