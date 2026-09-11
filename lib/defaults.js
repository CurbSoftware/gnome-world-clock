/**
 * defaults.js
 *
 * Default settings for the World Clock extension. Mirrors the Cinnamon
 * desklet's settings-schema.json defaults, plus the two GNOME-specific
 * keys: layer (desktop or overlay) and position (stage coordinates).
 */

export const DEFAULTS = {
    clocks: [
        { id: "default", name: "Local", timezone: "local" }
    ],
    layoutMode: "auto",
    fixedRows: 2,
    fixedCols: 2,
    tileSpacing: 4,
    width: 600,
    height: 400,
    showAddTile: true,
    timeFormat: "%H:%M:%S",
    dateFormat: "%A, %e %B",
    timeSize: 40,
    dateSize: 15,
    timezoneSize: 12,
    layer: "desktop",
    positionX: 64,
    positionY: 64
};
