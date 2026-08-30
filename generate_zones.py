import json
import subprocess
import math
import time

# Lists of streets by day of the week, corrected and complete
STREETS_BY_DAY = {
    "Sunday": [
        "אגוז", "אורן", "אלה", "אלון", "ארז", "אשל", "בארותיים", "בית אל", 
        "בארי", "בירנית", "ברעם", "ברק", "ברקאי", "בת שלמה", "מבוא הגבעה", 
        "גלעד", "המכתש", "הכנרות", "הכנורות", "דן", "דקלה", "דפנה", "דרגות", 
        "דלתון", "דליות", "דישון", "דיה", "דותן", "דור", "דולב", "דבורה"
    ],
    "Monday": [
        "שדרות הדקלים", "גבעון", "גלגל", "גילגל", "עמק האלה", "עמק דותן", "צרעה", 
        "מרגלית", "הרדוף", "שורק", "ברקת", "אודם", "אבני חן", "טופז", 
        "אבני החושן", "ספיר", "בזק", "חלוקי נחל", "בשור", "זויתן", "נחשון", 
        "נטפים", "עובדת", "עבדת", "קדרון", "קידרון", "לשם", "שוהם"
    ],
    "Tuesday": [
        "שד' הפרחים", "שד הפרחים", "הפרחים", "שדרות הפרחים", "הנרקיס", "הנורית", "הלוטם", "הכרכום", 
        "הכלנית", "היסמין", "יסמין", "הורד", "הדס", "שדרות הארץ", "השרון", "השפלה", 
        "השומרון", "הערבה", "העמק", "ההר", "הים", "הנגב", "המדבר", "דרך המרכז", 
        "גלבוע", "המישר", "גולן", "גמלא", "גריזים", "גילה", "רחבת המועצה", 
        "ירושלים", "גזר", "דביר", "מצדה", "הורדיון", "חצור", "סוסיא", 
        "ציפורי", "קסריה", "לכיש", "ניצנה", "האיריס", "הברקן", "הגומא", "הדודאים"
    ],
    "Wednesday": [
        "אגמית", "אנקור", "מורן", "דרור", "זמיר", "רותם", "סנונית", "יערה", 
        "עגור", "קורנית", "עפרוני", "שחף", "אילנות", "שקד", "שיטה", "חרוב", 
        "ברוש", "הרכסים", "ארבל", "תבור", "כרמל", "שניר", "ליבנים", "הר נבו", 
        "פסגות", "עצמון"
    ],
    "Thursday": [
        "אזור התעשיה", "אזור תעשייה", "אזור תעשיה צור יגאל", "אזור התעשייה",
        "יהלום", "גרניט", "צור", "חלמיש", "בזלת"
    ]
}

def normalize_name(name):
    if not name:
        return ""
    name = name.replace('"', '').replace("'", '').replace("`", "")
    name = name.replace('(', '').replace(')', '')
    name = name.replace('צ"י', '').replace('כ"י', '').replace('צי', '').replace('כי', '')
    name = name.replace('שד\'', 'שדרות').replace('שד ', 'שדרות')
    return name.strip()

def is_match(osm_name, user_name):
    if not osm_name or not user_name:
        return False
    osm_norm = normalize_name(osm_name)
    user_norm = normalize_name(user_name)
    if osm_norm == user_norm:
        return True
    # Strip leading "ה"
    osm_strip = osm_norm[1:] if osm_norm.startswith('ה') else osm_norm
    user_strip = user_norm[1:] if user_norm.startswith('ה') else user_norm
    if osm_strip == user_strip:
        return True
    # Substring checks
    if len(user_strip) > 2 and (user_strip in osm_strip or osm_strip in user_strip):
        return True
    return False

def get_day_for_street(street_name, mid_lon):
    # Special split street: נוף הרים
    if "נוף הרים" in street_name:
        # Wednesday for eastern/Kochav Yair part, Monday for western/Tzur Yigal part
        if mid_lon > 34.9912:
            return "Wednesday"
        else:
            return "Monday"
            
    for day, streets in STREETS_BY_DAY.items():
        for s in streets:
            if is_match(street_name, s):
                return day
    return None

def convex_hull(points):
    """Computes the convex hull of a list of 2D points (lat, lon) using Monotone Chain."""
    points = sorted(list(set(points)))
    if len(points) <= 1:
        return points

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)

    upper = []
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)

    return lower[:-1] + upper[:-1]

def buffer_segment(p1, p2, offset=0.00015):
    """Creates a small 4-point bounding box around a line segment [p1, p2] to form a valid polygon."""
    lat1, lon1 = p1
    lat2, lon2 = p2
    
    # Calculate direction vector
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    length = math.sqrt(dlat**2 + dlon**2)
    
    if length == 0:
        return [
            [lat1 - offset, lon1 - offset],
            [lat1 - offset, lon1 + offset],
            [lat1 + offset, lon1 + offset],
            [lat1 + offset, lon1 - offset]
        ]
        
    # Perpendicular vector
    plat = -dlon / length * offset
    plon = dlat / length * offset
    
    return [
        [lat1 + plat - dlat/length*offset, lon1 + plon - dlon/length*offset],
        [lat2 + plat + dlat/length*offset, lon2 + plon + dlon/length*offset],
        [lat2 - plat + dlat/length*offset, lon2 - plon + dlon/length*offset],
        [lat1 - plat - dlat/length*offset, lon1 - plon - dlon/length*offset]
    ]

def fetch_osm_elements():
    print("Fetching street and industrial park geometries in Kochav Yair - Tzur Yigal from Overpass API...")
    query = """[out:json][timeout:90];
    area[name="כוכב יאיר צור יגאל"]->.searchArea;
    (
      way["highway"](area.searchArea);
      way["landuse"="industrial"](area.searchArea);
      relation["landuse"="industrial"](area.searchArea);
    );
    out geom;"""
    
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.osm.ch/api/interpreter"
    ]
    
    for ep in endpoints:
        print(f"Trying Overpass endpoint: {ep}...")
        cmd = ['curl', '-s', '-d', f'data={query}', ep]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode == 0 and res.stdout.strip().startswith('{'):
            try:
                return json.loads(res.stdout)
            except Exception as e:
                print(f"Error parsing JSON from {ep}: {e}")
        else:
            print(f"Endpoint {ep} failed or returned non-JSON. Output preview: {res.stdout[:200]}")
        
        # Wait a moment before next attempt
        time.sleep(2)
        
    raise RuntimeError("Failed to fetch data from all Overpass API endpoints.")

def main():
    osm_data = fetch_osm_elements()
    elements = osm_data.get('elements', [])
    print(f"Total OSM elements retrieved: {len(elements)}")
    
    # Group ways by day
    ways_by_day = {day: [] for day in STREETS_BY_DAY.keys()}
    unmatched_streets = set()
    
    for el in elements:
        tags = el.get('tags', {})
        
        # Check if it's the industrial landuse area
        is_industrial_landuse = tags.get('landuse') == 'industrial'
        
        name = tags.get('name')
        if not name and not is_industrial_landuse:
            continue
            
        geom = el.get('geometry', [])
        if not geom:
            continue
            
        # Calculate midpoint
        lons = [pt['lon'] for pt in geom]
        lats = [pt['lat'] for pt in geom]
        mid_lon = sum(lons) / len(lons)
        mid_lat = sum(lats) / len(lats)
        
        if is_industrial_landuse:
            day = "Thursday"
            name = "אזור תעשייה מצפה ספיר"
        else:
            day = get_day_for_street(name, mid_lon)
            
        if day:
            ways_by_day[day].append({
                'id': el['id'],
                'name': name,
                'points': [(pt['lat'], pt['lon']) for pt in geom],
                'mid': (mid_lat, mid_lon)
            })
        else:
            unmatched_streets.add(name)
            
    print(f"Unmatched OSM streets ({len(unmatched_streets)}): {sorted(list(unmatched_streets))[:15]}...")
    
    # Process days and cluster ways to build polygons
    output_zones = {day: [] for day in STREETS_BY_DAY.keys()}
    
    for day, ways in ways_by_day.items():
        if not ways:
            print(f"No ways found for {day}")
            continue
            
        # Perform BFS/DFS to find connected components of ways by proximity (touching or within ~130 meters)
        visited = set()
        components = []
        
        for i, w1 in enumerate(ways):
            if i in visited:
                continue
                
            # Start a new cluster/component
            comp = [w1]
            visited.add(i)
            queue = [w1]
            
            while queue:
                curr = queue.pop(0)
                for j, w2 in enumerate(ways):
                    if j in visited:
                        continue
                    
                    # Find min distance between any points of current way and w2
                    min_dist_sq = float('inf')
                    for p_curr in curr['points']:
                        for p_w2 in w2['points']:
                            dist_sq = (p_curr[0] - p_w2[0])**2 + (p_curr[1] - p_w2[1])**2
                            if dist_sq < min_dist_sq:
                                min_dist_sq = dist_sq
                                
                    # If ways are within ~130 meters of each other (approx 0.0015 degrees)
                    if min_dist_sq < 0.0015**2:
                        comp.append(w2)
                        visited.add(j)
                        queue.append(w2)
                        
            components.append(comp)
            
        print(f"{day}: Grouped {len(ways)} ways into {len(components)} separate polygon cluster(s)")
        
        # Build convex hulls for each cluster
        for comp_idx, comp in enumerate(components):
            all_pts = []
            for w in comp:
                all_pts.extend(w['points'])
                
            # Keep unique points
            all_pts = list(set(all_pts))
            
            if len(all_pts) >= 3:
                hull_pts = convex_hull(all_pts)
                output_zones[day].append(hull_pts)
            elif len(all_pts) == 2:
                # Buffer a 2-point line
                box = buffer_segment(all_pts[0], all_pts[1])
                output_zones[day].append(box)
            elif len(all_pts) == 1:
                # Buffer a 1-point spot
                lat, lon = all_pts[0]
                box = [
                    [lat - 0.00015, lon - 0.00015],
                    [lat - 0.00015, lon + 0.00015],
                    [lat + 0.00015, lon + 0.00015],
                    [lat + 0.00015, lon - 0.00015]
                ]
                output_zones[day].append(box)
                
    # Write output to waste-zones.js
    js_content = f"""// Auto-generated waste zones geometry for Tzur Yigal - Kochav Yair
const WASTE_ZONES = {json.dumps(output_zones, indent=2)};
"""
    
    output_path = "/Users/mymac/Documents/AntiGravity/Monitoring Composting Stations/waste-zones.js"
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print(f"Successfully generated {output_path}")

if __name__ == "__main__":
    main()
