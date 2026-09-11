/**
 * widget.js
 *
 * The desktop widget: a grid of clock tiles plus an optional "+" tile.
 * Ported from the Cinnamon desklet's desklet.js. Differences forced by
 * GNOME Shell:
 *
 * - There is no desklet API. The widget is a plain St.Bin added to
 *   Main.layoutManager._backgroundGroup (layer "desktop") or
 *   Main.uiGroup (layer "overlay", always visible).
 * - There is no desklet drag service. Alt+drag on the widget moves it
 *   and persists the position.
 * - Clock editing happens in the preferences window, so there are no
 *   in-shell dialogs: the "+" tile opens preferences.
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as CA from './lib/clockActions.js';

const DEFAULT_TIME_FORMAT = "%H:%M:%S";
const DEFAULT_DATE_FORMAT = "%A, %e %B";

export function formatStrftime(dateMs, fmt, tzName) {
    if (!fmt)
        return "";
    try {
        let tz;
        if (tzName && tzName !== "local")
            tz = GLib.TimeZone.new(String(tzName).trim());
        else
            tz = GLib.TimeZone.new_local();
        let dt = GLib.DateTime.new_from_unix_utc(Math.floor(dateMs / 1000));
        if (tz)
            dt = dt.to_timezone(tz);
        const out = dt.format(fmt);
        if (out)
            return out;
    } catch (e) {
    }
    return "";
}

function _centerLabelText(label) {
    if (!label || !label.clutter_text)
        return;
    try {
        label.clutter_text.set_line_alignment(Pango.Alignment.CENTER);
        label.clutter_text.x_align = Clutter.ActorAlign.CENTER;
    } catch (e) {
    }
}

class ClockTile {
    constructor(clock, widget) {
        this.widget = widget;
        this.data = clock;
        this.id = clock.id;

        this.actor = new St.Button({
            style_class: "world-clock-tile",
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true
        });

        const box = new St.BoxLayout({ vertical: true });
        this._contentBox = box;

        this._time = new St.Label({ style_class: "world-clock-time" });
        this._date = new St.Label({ style_class: "world-clock-date" });
        this._timezoneLabel = new St.Label({ style_class: "world-clock-timezone" });

        try {
            this._time.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._time.clutter_text.line_wrap = false;
            this._date.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            this._date.clutter_text.line_wrap = false;
            this._timezoneLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            this._timezoneLabel.clutter_text.line_wrap = false;
        } catch (e) {
        }
        _centerLabelText(this._time);
        _centerLabelText(this._date);
        _centerLabelText(this._timezoneLabel);

        box.add_child(this._time);
        box.add_child(this._date);
        box.add_child(this._timezoneLabel);

        const bin = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        bin.set_child(box);
        this.actor.set_child(bin);

        this._timezoneLabel.set_text(CA.getClockLabel(this.data));
        this._clickedId = this.actor.connect("clicked", () => this.widget.onTileActivated(this));
    }

    destroy() {
        if (this._clickedId) {
            this.actor.disconnect(this._clickedId);
            this._clickedId = 0;
        }
        this.actor.destroy();
    }

    /* Font sizes are recomputed on grid rebuild and setting changes,
     * never on the 1s tick. Settings values are caps; tiles shrink to
     * fit, then a second pass shrinks further using real font metrics. */
    applyFittedSizes(inner, samples) {
        inner = inner || {};
        samples = samples || {};
        const box = {
            width: Math.max(0, Number(inner.width) || 0),
            height: Math.max(0, Number(inner.height) || 0)
        };
        if (box.width < 1 || box.height < 1)
            return;

        const texts = {
            time: samples.time || this._time.get_text() || "23:59:59",
            date: samples.date || this._date.get_text() || "Wednesday, 31 December",
            label: this._timezoneLabel.get_text() || ""
        };
        const maxSizes = {
            time: Number(this.widget.settings.timeSize) || 40,
            date: Number(this.widget.settings.dateSize) || 15,
            timezone: Number(this.widget.settings.timezoneSize) || 12
        };

        const sizes = CA.computeFittedFontSizes(box.width, box.height, texts, maxSizes);
        this._setFontSizes(sizes);
        this._constrainLabelWidth(box.width);
        this._refineWithMetrics(box, sizes);
    }

    _setFontSizes(sizes) {
        this._time.style = "font-size: " + sizes.time + "pt;";
        this._date.style = "font-size: " + sizes.date + "pt;";
        this._timezoneLabel.style = "font-size: " + sizes.timezone + "pt;";
    }

    _constrainLabelWidth(width) {
        try {
            let w = this._contentBox.width;
            if (!(w > 1))
                w = width;
            if (w > 1)
                this._timezoneLabel.width = Math.max(1, Math.floor(w));
        } catch (e) {
        }
    }

    _refineWithMetrics(inner, sizes) {
        /* Skip until the tile is on the stage: preferred size queries on
         * an unmapped actor return -1 and flood St-CRITICAL warnings. */
        if (!this.actor || !this.actor.get_stage())
            return;
        try {
            const gap = CA.TILE_LAYOUT.lineGap;
            for (let i = 0; i < 8; i++) {
                const timeW = this._time.get_preferred_width(-1)[1];
                const dateW = this._date.get_preferred_width(-1)[1];
                const timeH = this._time.get_preferred_height(-1)[1];
                const dateH = this._date.get_preferred_height(-1)[1];
                const tzH = this._timezoneLabel.get_preferred_height(-1)[1];
                const totalH = timeH + dateH + tzH + 2 * gap;
                const wide = timeW > inner.width + 1 || dateW > inner.width + 1;
                const tall = totalH > inner.height + 1;
                if (!wide && !tall)
                    return;
                sizes.time = Math.max(1, sizes.time * 0.88);
                sizes.date = Math.max(1, Math.min(sizes.date * 0.88, sizes.time));
                sizes.timezone = Math.max(1, Math.min(sizes.timezone * 0.88, sizes.date));
                this._setFontSizes(sizes);
            }
        } catch (e) {
            console.error("world-clock: font metric refine failed: " + e);
        }
    }

    update(baseMs) {
        let timezoneName = this.data.timezone || "local";
        let displayTz = timezoneName === "local" ? "" : timezoneName;

        if (timezoneName !== "local") {
            try {
                GLib.TimeZone.new(timezoneName);
                this._lastBadTimezone = null;
            } catch (e) {
                if (this._lastBadTimezone !== timezoneName) {
                    this._lastBadTimezone = timezoneName;
                    console.error("world-clock: invalid timezone: " + timezoneName + ": " + e);
                }
                timezoneName = "local";
                displayTz = "";
            }
        }

        this._timezoneLabel.set_text(CA.getClockLabel(this.data));

        try {
            const timeFormat = this.widget.settings.timeFormat || DEFAULT_TIME_FORMAT;
            const dateFormat = this.widget.settings.dateFormat || DEFAULT_DATE_FORMAT;
            this._time.set_text(formatStrftime(baseMs, timeFormat, displayTz));
            this._date.set_text(formatStrftime(baseMs, dateFormat, displayTz));
        } catch (e) {
            console.error("world-clock: could not format clock: " + e);
            this._time.set_text("");
            this._date.set_text("");
        }
    }
}

export class WorldClockWidget {
    constructor(extension, store) {
        this.extension = extension;
        this.store = store;
        this.settings = store.values();

        this._clockTiles = [];
        this._addTile = null;
        this._timeout = 0;
        this._rebuildTimeout = 0;
        this._fitSource = 0;
        this._fitRetrySource = 0;
        this._destroyed = false;
        this._dragging = false;
        this._dragOffset = [0, 0];
        this._lastDragEnd = 0;

        this.actor = new St.Bin({
            style_class: "world-clock-container",
            reactive: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START
        });
        this._box = new St.BoxLayout({ vertical: true });
        this.actor.set_child(this._box);

        this._capturedId = this.actor.connect("captured-event", (a, event) =>
            this._onCaptured(event));

        store.onChanged(() => this._onSettingsReloaded());

        this._rebuildGrid();
        this._applySize();
        this._applyLayer();
        this._applyPosition();
        this._scheduleTick();
    }

    get settings() {
        return this._settings;
    }

    set settings(values) {
        this._settings = values;
    }

    show() {
        if (this._destroyed)
            return;
        this._applyLayer();
        this._applyPosition();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;

        for (const source of [this._timeout, this._rebuildTimeout,
                              this._fitSource, this._fitRetrySource]) {
            if (source)
                GLib.source_remove(source);
        }
        this._timeout = 0;
        this._rebuildTimeout = 0;
        this._fitSource = 0;
        this._fitRetrySource = 0;

        this._clockTiles = [];
        this._addTile = null;

        if (this._capturedId) {
            this.actor.disconnect(this._capturedId);
            this._capturedId = 0;
        }
        if (this.actor.get_parent())
            this.actor.get_parent().remove_child(this.actor);
        this.actor.destroy();
    }

    /* A tile was clicked (left button). With Alt held the captured
     * handler already started a drag and stopped the event, so a click
     * arriving right after a drag is swallowed. */
    onTileActivated(tile) {
        const sinceDrag = Date.now() - this._lastDragEnd;
        if (sinceDrag < 350)
            return;
        this.extension.openPreferences();
    }

    /* ------------------------------------------------------------------ *
     * Settings reactions
     * ------------------------------------------------------------------ */

    _onSettingsReloaded() {
        if (this._destroyed)
            return;
        this.settings = this.store.values();
        this._applySize();
        this._applyLayer();
        this._applyPosition();
        if (this._rebuildTimeout)
            GLib.source_remove(this._rebuildTimeout);
        this._rebuildTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._rebuildTimeout = 0;
            this._rebuildGrid();
            return GLib.SOURCE_REMOVE;
        });
    }

    _applySize() {
        this._box.width = Math.max(200, Number(this.settings.width) || 600);
        this._box.height = Math.max(200, Number(this.settings.height) || 400);
    }

    _applyLayer() {
        const parent = this.actor.get_parent();
        if (parent)
            parent.remove_child(this.actor);
        const group = this.settings.layer === "overlay"
            ? Main.uiGroup
            : Main.layoutManager._backgroundGroup;
        group.add_child(this.actor);
    }

    _applyPosition() {
        const monitor = Main.layoutManager.primaryMonitor;
        const width = this._box.width;
        const height = this._box.height;
        let x = Number(this.settings.positionX) || 0;
        let y = Number(this.settings.positionY) || 0;
        if (monitor) {
            x = Math.min(Math.max(x, monitor.x), monitor.x + Math.max(0, monitor.width - width));
            y = Math.min(Math.max(y, monitor.y), monitor.y + Math.max(0, monitor.height - height));
        }
        this.actor.set_position(Math.round(x), Math.round(y));
    }

    /* ------------------------------------------------------------------ *
     * Alt+drag movement
     * ------------------------------------------------------------------ */

    _onCaptured(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS) {
            const button = event.get_button();
            const state = event.get_state();
            const alt = (state & Clutter.ModifierType.MOD1_MASK) !== 0;
            if (button === 1 && alt) {
                const [stageX, stageY] = event.get_coords();
                const [actorX, actorY] = this.actor.get_position();
                this._dragging = true;
                this._dragOffset = [stageX - actorX, stageY - actorY];
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        }
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;
        if (type === Clutter.EventType.MOTION) {
            const [stageX, stageY] = event.get_coords();
            this.actor.set_position(
                Math.round(stageX - this._dragOffset[0]),
                Math.round(stageY - this._dragOffset[1]));
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_RELEASE) {
            this._dragging = false;
            this._lastDragEnd = Date.now();
            const [x, y] = this.actor.get_position();
            this.store.set("positionX", x);
            this.store.set("positionY", y);
            this.store.save();
            this._applyPosition();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    /* ------------------------------------------------------------------ *
     * Grid construction
     * ------------------------------------------------------------------ */

    _getClockList() {
        const result = CA.normalizeClockList(this.settings.clocks);
        if (result.changed)
            this.store.set("clocks", result.clocks);
        return result.clocks;
    }

    _rebuildGrid() {
        if (this._destroyed)
            return;
        try {
            this._box.destroy_all_children();
            this._clockTiles = [];
            this._addTile = null;

            const clocks = this._getClockList();
            const showAdd = !!(this.settings.showAddTile && CA.canAdd(clocks));
            const cellCount = clocks.length + (showAdd ? 1 : 0);
            const dims = CA.computeGridDims(
                cellCount, this.settings.layoutMode,
                this.settings.fixedRows, this.settings.fixedCols);
            const cells = CA.planCells(clocks.length, showAdd, dims.rows, dims.cols);

            const table = new St.Widget({
                style_class: "world-clock-grid",
                layout_manager: new Clutter.GridLayout(),
                x_expand: true,
                y_expand: true
            });
            const grid = table.layout_manager;
            grid.set_row_homogeneous(true);
            grid.set_column_homogeneous(true);

            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                const row = Math.floor(i / dims.cols);
                const col = i % dims.cols;
                const actor = cell.kind === "add"
                    ? this._createAddTile()
                    : this._createClockTile(clocks[cell.index]);
                grid.attach(actor, col, row, 1, 1);
            }

            this._box.add_child(table);

            this._updateClocks();
            const samples = this._formatWidthSamples();
            const inner = this._computeTileInnerSize(dims);
            this._scheduleFit(inner, samples);
            this._updateHighlight();
        } catch (e) {
            console.error("world-clock: grid rebuild failed: " + e);
        }
    }

    _createClockTile(clock) {
        const tile = new ClockTile(clock, this);
        tile.actor.style = "margin:" + Math.max(0, Number(this.settings.tileSpacing) || 0) + "px;";
        this._clockTiles.push(tile);
        return tile.actor;
    }

    _createAddTile() {
        const button = new St.Button({
            style_class: "world-clock-add-tile",
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: true
        });
        const label = new St.Label({
            text: "+",
            style_class: "world-clock-add-label"
        });
        try {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            label.clutter_text.line_wrap = false;
        } catch (e) {
        }
        _centerLabelText(label);
        const bin = new St.Bin({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER
        });
        bin.set_child(label);
        button.set_child(bin);
        button.connect("clicked", () => this.onTileActivated(null));
        button.style = "margin:" + Math.max(0, Number(this.settings.tileSpacing) || 0) + "px;";
        this._addTile = { button, label };
        return button;
    }

    _computeGridDims() {
        const clocks = this._getClockList();
        const showAdd = !!(this.settings.showAddTile && CA.canAdd(clocks));
        const cellCount = clocks.length + (showAdd ? 1 : 0);
        return CA.computeGridDims(
            cellCount, this.settings.layoutMode,
            this.settings.fixedRows, this.settings.fixedCols);
    }

    _computeTileInnerSize(dims) {
        dims = dims || this._computeGridDims();
        return CA.computeTileInnerSize(
            Number(this.settings.width) || 600,
            Number(this.settings.height) || 400,
            dims.rows, dims.cols,
            Number(this.settings.tileSpacing) || 0);
    }

    _formatWidthSamples() {
        const timeFormat = this.settings.timeFormat || DEFAULT_TIME_FORMAT;
        const dateFormat = this.settings.dateFormat || DEFAULT_DATE_FORMAT;
        const dates = [
            Date.UTC(2023, 11, 27, 23, 59, 59),
            Date.UTC(2023, 8, 20, 12, 0, 0),
            Date.now()
        ];
        let time = CA.worstTimeSample(timeFormat);
        let date = "";
        for (let i = 0; i < dates.length; i++) {
            const t = formatStrftime(dates[i], timeFormat, "");
            const d = formatStrftime(dates[i], dateFormat, "");
            if (String(t).length > time.length)
                time = t;
            if (String(d).length > date.length)
                date = d;
        }
        for (const tile of this._clockTiles) {
            const t = tile._time.get_text();
            const d = tile._date.get_text();
            if (t && t.length > time.length)
                time = t;
            if (d && d.length > date.length)
                date = d;
        }
        if (!time)
            time = "23:59:59";
        if (!date)
            date = "Wednesday, 31 December";
        return { time, date };
    }

    _scheduleFit(inner, samples) {
        if (this._fitSource)
            GLib.source_remove(this._fitSource);
        this._fitSource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
            this._fitSource = 0;
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;
            this._fitAllTiles(inner, samples);
            if (this._fitRetrySource)
                GLib.source_remove(this._fitRetrySource);
            this._fitRetrySource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                this._fitRetrySource = 0;
                if (this._destroyed)
                    return GLib.SOURCE_REMOVE;
                this._fitAllTiles(inner, samples);
                return GLib.SOURCE_REMOVE;
            });
            return GLib.SOURCE_REMOVE;
        });
    }

    _fitAllTiles(inner, samples) {
        if (!inner)
            return;
        for (const tile of this._clockTiles)
            tile.applyFittedSizes(inner, samples);
        if (this._addTile)
            this._applyAddTileSize(this._addTile.label, inner);
    }

    _applyAddTileSize(label, inner) {
        if (!label || !inner)
            return;
        const sizes = CA.computeFittedFontSizes(inner.width, inner.height, {}, {
            time: Number(this.settings.timeSize) || 40,
            date: Number(this.settings.dateSize) || 15,
            timezone: Number(this.settings.timezoneSize) || 12
        });
        label.style = "font-size: " + sizes.add + "pt;";
    }

    _updateHighlight() {
        try {
            for (const tile of this._clockTiles) {
                if (tile.data && tile.data.timezone === "local")
                    tile.actor.add_style_pseudo_class("outlined");
                else
                    tile.actor.remove_style_pseudo_class("outlined");
            }
        } catch (e) {
            console.error("world-clock: highlight update failed: " + e);
        }
    }

    /* ------------------------------------------------------------------ *
     * Tick
     * ------------------------------------------------------------------ */

    _updateClocks() {
        const now = Date.now();
        for (const tile of this._clockTiles)
            tile.update(now);
    }

    _scheduleTick() {
        if (this._timeout)
            GLib.source_remove(this._timeout);
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;
            try {
                this._updateClocks();
            } catch (e) {
                console.error("world-clock: tick failed: " + e);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
}
