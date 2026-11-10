# EAS Product Quality Upgrade Plan

Status: approved implementation direction; staged delivery required.

## Non-negotiable constraints

- Preserve Leaflet. Do not replace it with MapLibre, Google Maps, Mapbox, or another map engine.
- Keep the no-account, no-API-key OpenStreetMap standard tile layer and visible attribution.
- Preserve the existing PHIVOLCS event ingestion and alert pipeline unless a separately tested source-integration change is explicitly scoped.
- Do not change alert thresholds, watch-zone geometry, notification admission rules, database schema, or earthquake source-of-truth behavior as part of a visual redesign.
- Never label a synthetic estimate as an official, measured, or observed ShakeMap.
- No claim of scientific accuracy without validation against independent observed intensity/instrument data.

## Audit findings

1. Three separate approximate contour generators exist in `src/App.vue`, `src/components/MapView.vue`, and `api/events/[eventId]/contours.js`. They use different formulas and can produce conflicting maps.
2. `api/events/[eventId]/contours.js` generates synthetic concentric polygons. Its comments describe this as PHIVOLCS-sourced despite the output being modeled rather than an official PHIVOLCS intensity product.
3. The map popup currently invokes local contour generation in `MapView.vue`; it does not use the backend contour endpoint.
4. PHIVOLCS events currently set `mmi: null`. The current ingestion path therefore does not provide per-location observed intensity values for contouring.
5. `api/_lib/usgs.js` is a stub, so USGS ShakeMap product ingestion is not currently available through that helper.
6. `ShakingTimeline.vue` uses another simplified MMI model and describes MMI IV as a damage threshold. That wording is not scientifically defensible and must be removed or replaced with a carefully sourced explanation.
7. UI styles are hard-coded dark colors across the root app, sidebar, settings, map overlays, and timeline. There is no coherent theme token system or theme switch. The newly selected OSM basemap is light, so the visual system is currently inconsistent.

## Product direction

A restrained, professional seismic-monitoring interface:

- Light theme as the default, with an optional dark UI theme.
- Clear typography, consistent spacing, strong information hierarchy, accessible contrast, keyboard focus, and touch-sized controls.
- No gratuitous gradients, glow effects, glassmorphism, emoji-based navigation, excessive rounded cards, or decorative dashboard clutter.
- Persistent map as the primary workspace; a compact event list; a selected-event detail panel; explicit data-source and update-time indicators.
- Responsive desktop/tablet/mobile layouts, including a mobile event/detail bottom sheet.
- Consistent map legends, layer controls, selected-event state, loading/empty/error/offline states, and clear attribution.

## ShakeMap integrity design

Use a strict source hierarchy:

1. If an authoritative ShakeMap product exists for the exact event, ingest its official GeoJSON contours/grid and preserve its product metadata, update/version time, units, and source attribution.
2. For PHIVOLCS events, show reported and instrumental intensities only when they are present in a verifiable PHIVOLCS bulletin/catalog record. Preserve the PEIS scale and locality labels.
3. If no official product or verified observations are available, show the epicenter and event parameters, and state that an intensity map is unavailable. Do not draw invented MMI rings.
4. If a future model estimate is added, isolate it as a separate explicitly modeled layer, include model/source/version, assumptions and uncertainty, and never present it as an observation or official ShakeMap.

USGS ShakeMap products are not guaranteed to exist for every event. Their own documentation describes maps as model-and-observation products with uncertainty; availability must be checked per event.

## Staged implementation and acceptance gates

### Stage 1 — Scientific integrity
- Establish one canonical event-intensity data contract.
- Remove duplicate and conflicting contour generators.
- Route map rendering through a single source-aware layer pipeline.
- Prefer exact-event official ShakeMap products when available.
- Parse PHIVOLCS reported/instrumental intensities only from verified source material; otherwise return unavailable.
- Correct timeline labels and mark all modeled timing/intensity values as estimates.
- Add fixtures for official product present, product absent, malformed product, observed PHIVOLCS intensities, and no observations.
- Verify no alert/notification behavior or thresholds change.

### Stage 2 — Design system and theme support
- Introduce semantic CSS variables for surfaces, text, borders, focus, status, spacing, radii, shadows, and typography.
- Implement light and dark UI themes with persisted user preference and accessible contrast.
- Keep map tile attribution visible and map functionality intact.
- Replace emoji controls with consistent accessible iconography; preserve text labels/tooltips.
- Add responsive breakpoints and reduced-motion behavior.

### Stage 3 — Workspace redesign
- Rework header/status, event list, selected-event detail, map controls, settings, timeline, and mobile presentation.
- Improve source labels, timestamps, magnitude/depth formatting, loading/empty/error/offline states.
- Ensure selected event, filters, watch zones, location, and ShakeMap layer continue to behave correctly.

### Stage 4 — Verification
- Run dependency installation, unit tests, production build, lint/type checks if configured, and PWA build checks.
- Add UI/component tests for theme, responsive states, event selection, filters, watch-zone controls, and map layer state.
- Test on desktop and mobile viewport sizes.
- Validate official intensity/product handling against source fixtures and compare any optional model against independent observations before making accuracy claims.
- Keep the pull request unmerged until checks pass and regressions are reviewed.

## Safety and communication

- No fabricated data, no silent fallback to fake contours, and no “accurate” claims based solely on a prettier visualization.
- Clearly distinguish event parameters, observed intensities, instrumental measurements, official model products, and app-generated estimates.
- Preserve source links and product timestamps wherever available.
- If an upstream source is unavailable, communicate that state rather than converting failure into a plausible-looking map.
