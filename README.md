# INNA — recorded routes from U328

A WebXR-only, on-site route recorder and player. No routes are bundled, no room
location is inferred, and no path to U310 (or any other room) is fabricated.
The FHV campus SVG is an optional, untracked overview.

## Run

```sh
npm install
npm run dev -- --host
npm test
npm run build
```

Tests require Node 22.6+ (type stripping). Serve over **HTTPS** on a real phone;
plain HTTP on a LAN address does not qualify as a secure context. Localhost is
useful for desktop UI tests, not proof of AR support.
A-Frame 1.7.1 loads from aframe.io; network access is required on first load.

## Record on site

Route selection and **Create a track** are both available directly on the page.

1. Open **Create a track**. At U328, enter a destination room other than U328, an exact
   repeatable starting floor spot, and a fixed feature to face. These are
   instructions you supply, not surveyed or verified locations.
2. Select **Record in WebXR**. A compatible browser/device must support immersive
   AR, `hit-test` and `dom-overlay`. Both features are mandatory; permission or
   feature failures are displayed. There is no AR.js, marker, compass, inline
   camera or non-WebXR fallback.
3. Find the floor with the blue reticle. Confirm that the reticle is at your
   described U328 spot, then select **Confirm floor origin**.
4. Stand at that same spot (within 1 m), hold the phone looking horizontally at
   the described feature and select **Confirm facing direction**. Instructions
   remain editable until this confirmation and are included in the saved track.
   Do not point the camera straight up/down for heading calibration.
5. Walk the corridor and aim at the floor to **Add arrow** repeatedly. Use
   **Turn left** or **Turn right** at every corner/segment boundary. Aim at the
   corner's floor spot; you do not need to face the new corridor yet. The choice
   is relative to your direction of travel, not the phone's current orientation.
   **Undo last point**
   removes the last captured point or corner. The calibrated U328 origin is
   the first arrow and cannot be undone.
6. At the destination floor point select **Finish at destination**. The complete
   track returns to the library as **unsaved**. Explicitly **Save as new track**
   or **Export unsaved JSON**. Exiting early discards incomplete capture.

Only the current recording corridor is displayed after a turn. Consecutive
points must be at least 0.25 m apart; complete tracks need 2–500 points including
the origin and final destination. Choose level floor surfaces, not tables.
After origin selection, hits must have an upward normal and be within 0.25 m
of the origin floor height. This implementation is for a single floor, not stairs.

## Walk a recorded route

Choose a saved destination and select **Walk selected route**. Repeat its exact
U328 floor-origin and facing calibration every session. Route X/Z positions are
stored relative to the selected floor origin and inverse horizontal XR camera
heading, not compass north or the phone's height. A fresh origin/heading transform
places arrows in the new session.

Only the active corridor segment is drawn. Get within **1.5 m** (horizontal
tracked-camera distance) of its recorded corner and explicitly select
**Confirm left turn** or **Confirm right turn** to reveal the next segment.
The selected instruction is shown with the distance to the corner, and the
corner arrow points left or right relative to the incoming path.
Proximity never advances
automatically. The same rule applies to **Confirm arrival** at the final point.
This is **segment gating, not real occlusion**: arrows in the current segment
can still draw through walls. It does not detect obstacles, authenticate room
locations, calculate routes or guarantee accurate arrival.

Pose loss/emulated positions hide arrows and disable calibration, capture, undo
and progression until tracking returns. Session visibility interruptions or
reference-space resets require exiting and recalibrating at U328 instead of
silently resuming in an uncertain coordinate frame. Session end clears all
calibration. Watch your surroundings, do not walk while staring at the screen,
and stop if alignment drifts.

## Local data and JSON

- Browser storage key: `inna.u328.routes.v1`; at most 50 tracks per library.
- Tracks are saved explicitly as new copies with new IDs. Delete requires
  confirmation. Import does not overwrite existing tracks or automatically save.
- Select a JSON file to validate and preview its name, destination and starting
  instructions as an unsaved track, then explicitly save a new copy.
- Storage read/parse/quota failures are visible. Corrupt/unreadable storage is
  never automatically replaced. Export its original contents before explicitly
  clearing it; recovered/current complete tracks can still be exported if saving
  fails. A changed storage value in another tab blocks writes until reload.
- Downloads use Blob URLs, removed anchors and revoked URLs.
- Exported file shape is exactly `{ "version": 1, "route": { … } }`.
  A route has `id`, `start: "U328"`, `destination`,
  `instructions: { "spot": "...", "facing": "..." }`, and `points`.
  Points have finite meter coordinates `x`, `z` and `kind` equal to `arrow`,
  `turn` or `destination`. First point is `(0,0)`/`arrow`; only the last point
  is `destination`. Every turn closes one segment and starts the next.
  New turning points also store `turn: "left"` or `turn: "right"`.
  Existing version-1 tracks without this optional field still load with a
  generic corner instruction. Directions are manually chosen, not inferred.
  Legacy version-1 routes with a `name` still import; the name is discarded.
  Routes are labeled by destination room only.
- Unknown/missing fields, wrong versions, duplicate library IDs, invalid room
  text, incomplete/degenerate tracks, nonfinite coordinates, coordinates beyond
  ±500 m, more than 500 points and files above 1 MB are rejected.
- JSON imports are data only; supplied labels are rendered as text, not HTML.

## Verification and limitations

`npm test` covers strict schema rejection, route/library round trips,
origin/heading transforms independent of camera height, shared corner boundaries
and tracked-distance gating. `npm run build` checks TypeScript and production
bundling. Mocked browser XR tests can exercise the UI state machine, not physical
hit-test quality or tracking accuracy. A real supported phone at U328 is still
required to verify floor selection, repeatable origin/facing alignment, DOM
overlay operation, relocalization behavior, drift and actual corridor visibility.

`tests/browser-flow.js` is a reusable browser-tool function (use the Playwright
tool's `filename` option with the dev server on port 4175). It uses the real
A-Frame/application code and mocked native poses/hits to check recording, edited
instructions, undo, loss of tracking, quota failure/export, explicit save/reload,
corner/arrival confirmation, reference resets, import/delete, corrupt-storage
recovery and mobile overflow. It uses a test browser origin and clears that
origin's INNA storage; do not run it in a browser profile containing real routes.
