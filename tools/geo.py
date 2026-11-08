import math,json
LAT0,LON0=51.4910,-2.7580
phi=math.radians(LAT0)
MLAT=111132.954-559.822*math.cos(2*phi)+1.175*math.cos(4*phi)
MLON=111412.84*math.cos(phi)-93.5*math.cos(3*phi)
def xy(lat,lon): return ((lon-LON0)*MLON,(lat-LAT0)*MLAT)
def ll(x,y): return (LAT0+y/MLAT, LON0+x/MLON)
def load():
    return json.load(open('/tmp/claude-0/-home-user-Website-Test/0e328d16-6520-5b4b-be42-d8e07ca0e94d/scratchpad/dl/osm_all.json'))
def pts(e):
    return [xy(p['lat'],p['lon']) for p in (e.get('geometry') or []) if p]
