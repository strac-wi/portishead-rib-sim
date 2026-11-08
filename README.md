# Portishead RIB Sim

A Highfield Patrol 660 with a Honda BF150 in Portishead Marina and the Severn off Portishead Pier. Leave the berth on
the A pontoon, call the marina on VHF 80, work the lock on the real tide, run out along the dredged channel by the sea
wall, and practise coming alongside a hammerhead and man overboard in a four-knot stream.

**Play:** https://strac-wi.github.io/portishead-rib-sim/ (desktop, tablet or phone; keyboard, touch or a game controller)

## Keys

| Key | |
|---|---|
| X | Start or stop the engine (lever in neutral, kill cord on) |
| W / S | The single lever: ahead, neutral, astern, with a tick-over notch either side of neutral |
| A / D, C | Wheel, centre the wheel |
| R / F | Trim out / in |
| L | Let go, or make fast when alongside, stopped and parallel |
| P | Call Portishead Quays Marina on VHF 80 for the next lock |
| K · O · G | Kill cord · man overboard · choose a drill |
| V · T · M | Camera · time compression · mute |

## The lock and the tide

The tide is worked out on the device from the Avonmouth gauge's harmonic constants (TICON-4, CC BY 4.0), fitted to
Portishead Marina's 2026 tide table (within about 15 cm and 10 minutes). The lock works 3.5 hours either side of high
water at springs and 4 at neaps, lock-outs on the hour and half hour, lock-ins a quarter of an hour later, and
free-flows near high water on tides of 12 m or more. The sill, the floor, the sluice rates, the channel's dredged depth
and the stream rates are estimates. **Not for navigation.**

## Sources

- Marina basin, lock, approach, pier, buildings, roads and green space: OpenStreetMap (© OpenStreetMap contributors, ODbL).
- Pontoons and moored boats: OpenStreetMap, corrected onto satellite views supplied by the user.
- Depths and drying heights: screenshots of a chart app supplied by the user, 426 soundings read off them.
- Land heights: Copernicus DEM GLO-30 (© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under
  COPERNICUS by the European Union and ESA).
- Tide: TICON-4 (Hart-Davis, Dettmering and Seitz), Avonmouth; Boatfolk's Portishead Marina tide times 2026.
- The boat: Highfield's drawing and the user's photographs; the hull's resistance from Powerboat Magazine's test of the
  Patrol 660; the engine from Honda's BF150 specification and its BF150 propeller test on a Highfield DL640.

An unofficial simulator, not affiliated with or endorsed by Boatfolk, Portishead Marina, Highfield or Honda.

## Building

`index.html` is built from `src/` by `python3 tools/build.py`. `node tools/smoke.js` loads it in headless Chromium
(Playwright) and reports errors; `tools/README.md` describes the data pipeline that made `src/pdata.js`.
`tools/vendor/three-r128.min.js` is three.js r128 (MIT licence, © three.js authors), used only by the test scripts; the
page loads the same version from cdnjs.
