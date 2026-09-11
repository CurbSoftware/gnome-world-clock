# World Clock for GNOME Shell

A grid of world timezone clocks on the desktop. Each tile shows the
time and date in its timezone plus a label; the local clock is outlined.
Drag the widget with Alt+left button. Click any tile or the "+" tile to
open the preferences window and edit the clock list.

Ported from the Cinnamon World Clock desklet
(`cinnamon-world-clock-desklet@curbsoftware` in the same monorepo).
Settings live in `~/.config/gnome-world-clock@curbsoftware/settings.json`.

## Install

```bash
gnome-extensions install --force gnome-world-clock@curbsoftware.zip
gnome-extensions enable gnome-world-clock@curbsoftware
```

On Wayland the extension loads after the next login; on X11 Alt+F2 then
`r` restarts the shell immediately.

To install every CurbSoftware widget for this desktop (and Cinnamon or
Plasma) in one download, use the bundle AppImage:
https://github.com/CurbSoftware/curb-desktop-widgets/releases/latest

## Development

See `DEVELOPMENT.md`. Headless tests:

```bash
gjs -m dev-tools/test-gnome-world-clock.js
```
