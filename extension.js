/**
 * extension.js
 *
 * Composition root for the World Clock GNOME extension. Builds the
 * JSON settings store, starts the directory watch that bridges edits
 * from the preferences process, and creates the desktop widget.
 */

import { Extension } from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import * as CA from './lib/clockActions.js';
import { DEFAULTS } from './lib/defaults.js';
import { Store } from './lib/store.js';
import { WorldClockWidget } from './widget.js';

export default class WorldClockExtension extends Extension {
    enable() {
        CA.setTranslate((str) => this.gettext(str));

        this._store = new Store(this.uuid, DEFAULTS);
        this._store.watch();

        this._widget = new WorldClockWidget(this, this._store);
        this._widget.show();
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
        if (this._store) {
            this._store.unwatch();
            this._store = null;
        }
    }
}
