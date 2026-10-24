# INNA — indoor navigation

Indoor navigation is still quite a challenging problem these days, equipped with nothing but a phone, 
GPS signals fail and precise spatial positioning becomes a nightmare. INNA takes a different approach:
It treats movement very much like a vector, defined strictly by its **length** and its **direction**.
Where conventional navigation systems fail, INNA keeps things simple and acts as your safety net.

> In the Vorarlberg dialect (an Alemannic dialect group spoken in western Austria), 
the word "inna" means "inside" or "in".

## Campus map

The U, V and W building map fills the main view, even before camera access is
enabled or if access is denied. A compact square camera preview sits in the
top-right corner below the header. Use **Expand camera** for marker scanning
and **Collapse camera** (or Escape) to return to the map-first layout.
On shorter screens, scroll within the map panel to reach the compass controls.
Select **Enable camera and compass** to request both permissions with one tap.
The browser may show separate permission prompts. Camera and compass access
are independent: denying one does not prevent the other from working.
If compass access fails or no readings arrive, use **Retry compass**.
Compass access requires
HTTPS (or localhost), a device with compass sensors, and browser permission.
Hold the phone flat for best accuracy. Without compass readings, the map remains
north-aligned.

`MAP_NORTH_OFFSET_DEGREES` in [index.ts](./index.ts) sets the clockwise bearing
of the SVG's top from north. Its current value of 20 degrees is an estimate from
a north-up Google Maps screenshot, not a surveyed bearing. Refine it on site if
needed. Screen orientation is accounted for when following the compass.

## AR modes

On HTTPS devices that report support for WebXR `immersive-ar`, the start button
prefers full-screen **Start immersive AR**. Move the phone to find a surface,
then tap to place the cone-tipped arrow. Tap again to reposition it.
Surface hit testing is required; DOM-overlay instructions and **Exit AR** are
available when the browser supports DOM overlays. Otherwise, use the browser's
own exit control.

This mode places a demonstration arrow in the real world; it does not recognize
Hiro markers, determine your indoor position, or calculate a navigation route.
The compass map remains a separate feature and does not align the XR world.

If immersive AR is unsupported, the app uses the compact AR.js Hiro-marker
camera automatically. On supported devices, **Use marker camera** also lets you
switch to that mode, including after denied permissions or session errors.
Immersive AR is browser-managed and cannot run inside the small camera preview.
Closing an immersive session returns to the map, where it can be started again.

The app uses A-Frame 1.7.1 for WebXR session error handling and surface hit tests;
AR.js remains responsible only for the marker-camera fallback.
