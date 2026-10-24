# INNA — indoor navigation

Indoor navigation is still quite a challenging problem these days, equipped with nothing but a phone, 
GPS signals fail and precise spatial positioning becomes a nightmare. INNA takes a different approach:
It treats movement very much like a vector, defined strictly by its **length** and its **direction**.
Where conventional navigation systems fail, INNA keeps things simple and acts as your safety net.

> In the Vorarlberg dialect (an Alemannic dialect group spoken in western Austria), 
the word "inna" means "inside" or "in".

## Campus map

The U, V and W building map is always available below the camera area, even
before camera access is enabled or if access is denied. On shorter screens,
scroll within the map panel to reach the compass controls.
Select **Enable compass** to rotate it with your heading. Compass access requires
HTTPS (or localhost), a device with compass sensors, and browser permission.
Hold the phone flat for best accuracy. Without compass readings, the map remains
north-aligned.

`MAP_NORTH_OFFSET_DEGREES` in [index.ts](./index.ts) sets the clockwise bearing
of the SVG's top from north. Its current value of 20 degrees is an estimate from
a north-up Google Maps screenshot, not a surveyed bearing. Refine it on site if
needed. Screen orientation is accounted for when following the compass.
