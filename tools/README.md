# Portishead RIB sim: data pipeline

`src/` holds the page in parts; `python3 tools/build.py` writes `index.html` (three.js r128 from cdnjs). `node tools/smoke.js`
loads it in headless Chromium (three.js served from `../loch-ranza/tools/vendor`) and `node tools/views.js` takes set views.

Local frame: metres east (x) and north (y) of 51.4910 N 2.7580 W; heights in metres above chart datum (Avonmouth/Portishead,
ODN − 6.5 m). Inputs not kept here: the user's two chart-app screenshots and nine Apple Maps satellite screenshots, the
OpenStreetMap ways round Portishead (Overpass), Copernicus DEM GLO-30 tile N51 W003, TICON-4 (`122848.csv`, SEANOE) and
Boatfolk's "Portishead Marina Tide Times 2026" PDF. Scripts were run from scratch folders; change the paths at the top.

1. `geo.py`, `reg.py`, `regwater.py`: the full-marina screenshot fitted to OSM's basin by water overlap (`r9.json`); the
   close-up chained onto it by template matching (`r1c.json`).
2. `marina.py`: OSM pontoons, with the north-east cluster moved onto the close-up (`ne_corr.json`: 1.75 m W, 5.5 m S,
   -0.75°), split into walkways and fingers. `boats.py`: a candidate berth each side of each finger, occupied where the
   satellite shows a white hull; hammerheads at the arm ends; boats lying alongside picked up as blobs; the pin's slot.
3. Charts: `c2.json`, `c1.json` (each chart fitted to the OSM coast from landmarks); `soundings.py` (426 soundings and
   drying heights read by eye); `seabed.py` (colour bands + soundings + OSM coast + DEM -> 10 m grid and a 2.5 m patch).
4. `tide.py`, `tidefit.py`: Avonmouth's TICON-4 constants in the predictor's format, fitted to the marina's November 2026
   table (no shift, ×0.9943, mean level 6.985 m CD; checked on December).
5. `encode.py` writes `src/pdata.js`.
