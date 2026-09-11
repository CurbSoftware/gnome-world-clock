/**
 * prefs.js
 *
 * Preferences window: clock list editor (name plus timezone picker),
 * layout, and format controls. Runs in the extensions prefs process;
 * writes go through the same JSON store the extension watches, so edits
 * apply live without a bridge.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import * as CA from './lib/clockActions.js';
import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';

const LAYOUT_MODES = ["auto", "fixed"];
const LAYERS = ["desktop", "overlay"];

export default class WorldClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._store = new Store(this.uuid, DEFAULTS);
        this._zones = CA.listTimezones();

        window.add(this._clocksPage());
        window.add(this._layoutPage());
        window.add(this._formatPage());
        window.set_default_size(560, 620);
    }

    _save() {
        this._store.save();
    }

    _clocks() {
        const result = CA.normalizeClockList(this._store.get("clocks"));
        if (result.changed)
            this._store.set("clocks", result.clocks);
        return result.clocks;
    }

    _setClocks(clocks) {
        this._store.set("clocks", clocks);
        this._save();
        this._rebuildClockRows();
    }

    /* ------------------------------------------------------------------ *
     * Clocks page
     * ------------------------------------------------------------------ */

    _clocksPage() {
        const page = new Adw.PreferencesPage({
            title: "Clocks",
            icon_name: "preferences-system-time-symbolic"
        });

        const group = new Adw.PreferencesGroup({
            title: "Clocks",
            description: "Add clocks and search timezones by city or region."
        });

        const addButton = new Gtk.Button({
            label: "+",
            valign: Gtk.Align.CENTER,
            tooltip_text: "Add clock"
        });
        addButton.connect("clicked", () => {
            this._setClocks(CA.addClock(this._clocks(), CA.DEFAULT_CLOCK));
        });
        group.add(addButton);

        this._clockList = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE
        });
        this._clockList.add_css_class("boxed-list");
        group.add(this._clockList);

        page.add(group);
        this._rebuildClockRows();
        return page;
    }

    _rebuildClockRows() {
        if (!this._clockList)
            return;
        let child = this._clockList.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._clockList.remove(child);
            child = next;
        }

        const clocks = this._clocks();
        const canRemove = CA.canRemove(clocks);
        for (const clock of clocks)
            this._clockList.append(this._clockRow(clock, canRemove));
    }

    _clockRow(clock, canRemove) {
        const row = new Adw.PreferencesRow();
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            margin_top: 8,
            margin_bottom: 8,
            margin_start: 8,
            margin_end: 8
        });

        const name = new Gtk.Entry({
            text: clock.name || "",
            placeholder_text: "Name",
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        name.connect("changed", () => {
            const next = CA.updateClock(this._clocks(), clock.id, {
                name: name.get_text(),
                timezone: clock.timezone
            });
            this._store.set("clocks", next);
            this._save();
        });

        const zones = this._zones;
        const labels = new Gtk.StringList();
        for (const zone of zones)
            labels.append(CA.timezoneListLabel(zone));
        const picker = new Gtk.DropDown({
            model: labels,
            enable_search: true,
            hexpand: true,
            valign: Gtk.Align.CENTER
        });
        picker.set_expression(Gtk.PropertyExpression.new(
            Gtk.StringObject, null, "string"));
        const index = zones.indexOf(clock.timezone);
        if (index >= 0)
            picker.set_selected(index);
        picker.connect("notify::selected", () => {
            const zone = zones[picker.get_selected()];
            if (!zone || zone === clock.timezone)
                return;
            const next = CA.updateClock(this._clocks(), clock.id, {
                name: clock.name,
                timezone: zone
            });
            this._store.set("clocks", next);
            this._save();
        });

        const remove = new Gtk.Button({
            icon_name: "user-trash-symbolic",
            valign: Gtk.Align.CENTER,
            sensitive: canRemove,
            tooltip_text: "Remove clock"
        });
        remove.connect("clicked", () => {
            this._setClocks(CA.removeClock(this._clocks(), clock.id));
        });

        box.append(name);
        box.append(picker);
        box.append(remove);
        row.set_child(box);
        return row;
    }

    /* ------------------------------------------------------------------ *
     * Layout page
     * ------------------------------------------------------------------ */

    _layoutPage() {
        const page = new Adw.PreferencesPage({
            title: "Layout",
            icon_name: "preferences-desktop-appearance-symbolic"
        });
        const group = new Adw.PreferencesGroup({ title: "Layout" });

        const mode = new Adw.ComboRow({
            title: "Grid layout mode",
            model: Gtk.StringList.new(["Auto (near-square)", "Fixed (rows x cols)"])
        });
        mode.set_selected(LAYOUT_MODES.indexOf(this._store.get("layoutMode")) || 0);
        mode.connect("notify::selected", () => {
            this._store.set("layoutMode", LAYOUT_MODES[mode.get_selected()] || "auto");
            this._save();
        });
        group.add(mode);

        const rows = this._spinRow("Rows (fixed layout)", "fixedRows",
            this._store.get("fixedRows"), 1, 10, 1);
        const cols = this._spinRow("Columns (fixed layout)", "fixedCols",
            this._store.get("fixedCols"), 1, 10, 1);
        const syncFixed = (sensitive) => {
            rows.set_sensitive(sensitive);
            cols.set_sensitive(sensitive);
        };
        syncFixed(LAYOUT_MODES[mode.get_selected()] === "fixed");
        mode.connect("notify::selected", () =>
            syncFixed(LAYOUT_MODES[mode.get_selected()] === "fixed"));
        group.add(rows);
        group.add(cols);

        const spacing = this._spinRow("Tile spacing (px)", "tileSpacing",
            this._store.get("tileSpacing"), 0, 24, 1);
        group.add(spacing);

        const size = new Adw.PreferencesGroup({ title: "Widget size" });
        size.add(this._spinRow("Width (px)", "width", this._store.get("width"), 200, 2000, 50));
        size.add(this._spinRow("Height (px)", "height", this._store.get("height"), 200, 2000, 50));
        size.add(this._spinRow("Position X (px)", "positionX", this._store.get("positionX"), 0, 8000, 10));
        size.add(this._spinRow("Position Y (px)", "positionY", this._store.get("positionY"), 0, 8000, 10));

        const placement = new Adw.PreferencesGroup({ title: "Placement" });
        const layer = new Adw.ComboRow({
            title: "Layer",
            model: Gtk.StringList.new(["Desktop (under windows)", "Overlay (always visible)"])
        });
        layer.set_selected(LAYERS.indexOf(this._store.get("layer")) || 0);
        layer.connect("notify::selected", () => {
            this._store.set("layer", LAYERS[layer.get_selected()] || "desktop");
            this._save();
        });
        placement.add(layer);

        const tiles = new Adw.PreferencesGroup({ title: "Tiles" });
        const addTile = new Adw.SwitchRow({
            title: "Show \"+\" tile",
            subtitle: "Opens the preferences window so you can add a clock"
        });
        addTile.set_active(!!this._store.get("showAddTile"));
        addTile.connect("notify::active", () => {
            this._store.set("showAddTile", addTile.get_active());
            this._save();
        });
        tiles.add(addTile);

        page.add(group);
        page.add(size);
        page.add(placement);
        page.add(tiles);
        return page;
    }

    _spinRow(title, key, value, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            adjustment: new Gtk.Adjustment({
                value: Number(value) || lower,
                lower,
                upper,
                step_increment: step
            })
        });
        row.connect("notify::value", () => {
            this._store.set(key, Math.round(row.get_value()));
            this._save();
        });
        return row;
    }

    /* ------------------------------------------------------------------ *
     * Format page
     * ------------------------------------------------------------------ */

    _formatPage() {
        const page = new Adw.PreferencesPage({
            title: "Format",
            icon_name: "document-properties-symbolic"
        });
        const group = new Adw.PreferencesGroup({
            title: "Formats",
            description: "strftime patterns, for example %H:%M:%S or %A, %e %B"
        });

        const time = new Adw.EntryRow({ title: "Time format (strftime)" });
        time.set_text(this._store.get("timeFormat") || "");
        time.connect("changed", () => {
            this._store.set("timeFormat", time.get_text());
            this._save();
        });

        const date = new Adw.EntryRow({ title: "Date format (strftime)" });
        date.set_text(this._store.get("dateFormat") || "");
        date.connect("changed", () => {
            this._store.set("dateFormat", date.get_text());
            this._save();
        });

        group.add(time);
        group.add(date);
        page.add(group);

        const sizes = new Adw.PreferencesGroup({ title: "Maximum font sizes" });
        sizes.add(this._spinRow("Time (pt)", "timeSize", this._store.get("timeSize"), 6, 72, 1));
        sizes.add(this._spinRow("Date (pt)", "dateSize", this._store.get("dateSize"), 6, 72, 1));
        sizes.add(this._spinRow("Label (pt)", "timezoneSize", this._store.get("timezoneSize"), 6, 72, 1));
        page.add(sizes);
        return page;
    }
}
