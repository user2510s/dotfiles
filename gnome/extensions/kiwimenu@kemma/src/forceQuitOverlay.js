/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * forceQuitOverlay.js - Provides a force quit overlay for misbehaving applications.
 *
 * Simplified force-quit overlay adapted from the Logo Menu sample extension.
 * Original work: force-quit/selection.js by Aryan20 and otto.allmendinger (MIT license).
 */

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';

const NON_KILLABLE_WM_CLASSES = new Set([
  'gnome-shell',
  'nautilus',
  'org.gnome.nautilus',
]);

const NON_KILLABLE_APP_IDS = new Set([
  'org.gnome.Nautilus',
]);

let activeSelection = null;

class Capture extends Signals.EventEmitter {
  constructor() {
    super();

    this._overlay = new St.Widget({
      name: 'kiwi-force-quit-overlay',
      reactive: true,
      visible: true,
      x: -10,
      y: -10,
    });

    Main.uiGroup.add_child(this._overlay);
    this._setCursor(Meta.Cursor.CROSSHAIR);

    this._grab = Main.pushModal(this._overlay);

    if (!this._grab) {
      this._teardown();
      return;
    }

    this._eventId = this._overlay.connect('captured-event', (actor, event) => {
      if (event.type() === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
        this.stop();
        return Clutter.EVENT_STOP;
      }

      this.emit('captured-event', event);
      return Clutter.EVENT_STOP;
    });
  }

  stop() {
    this._teardown();
    this.emit('stop');
    this.disconnectAll();
  }

  _setCursor(cursor) {
    const display = global.display ?? global.screen;
    display?.set_cursor(cursor);
  }

  _teardown() {
    if (this._eventId && this._overlay) {
      this._overlay.disconnect(this._eventId);
      this._eventId = 0;
    }

    this._setCursor(Meta.Cursor.DEFAULT);

    if (this._overlay && this._overlay.get_parent()) {
      Main.uiGroup.remove_child(this._overlay);
    }

    if (this._grab) {
      Main.popModal(this._grab);
      this._grab = null;
    }

    if (this._overlay) {
      this._overlay.destroy();
      this._overlay = null;
    }
  }
}

class SelectionWindow extends Signals.EventEmitter {
  constructor() {
    super();

    this._windows = global.get_window_actors();
    this._capture = new Capture();

    if (!this._capture._overlay) {
      // Modal grab failed, bail out.
      this.emit('stop');
      return;
    }

    this._capture.connect('captured-event', (_capture, event) => this._onEvent(event));
    this._capture.connect('stop', () => this.emit('stop'));
  }

  _onEvent(event) {
    const type = event.type();

    if (type === Clutter.EventType.BUTTON_PRESS) {
      const button = event.get_button();
      if (button === Clutter.BUTTON_SECONDARY) {
        this._capture.stop();
        return;
      }

      const [pointerX, pointerY] = global.get_pointer();
      const target = this._pickWindow(pointerX, pointerY);
      if (button === Clutter.BUTTON_PRIMARY && target) {
        try {
          target.get_meta_window().kill();
        } catch (error) {
          logError(error, 'Failed to kill selected window');
        }
      }

      this._capture.stop();
    }
  }

  _pickWindow(x, y) {
    const candidates = this._windows.filter((actor) => {
      if (!actor?.visible || typeof actor.get_meta_window !== 'function') {
        return false;
      }

      const metaWindow = actor.get_meta_window();
      if (!metaWindow) {
        return false;
      }

      if (!this._isKillable(metaWindow)) {
        return false;
      }

      const [width, height] = actor.get_size();
      const [actorX, actorY] = actor.get_position();

      return x >= actorX && x <= actorX + width && y >= actorY && y <= actorY + height;
    });

    candidates.sort((a, b) => {
      const layerA = a.get_meta_window().get_layer();
      const layerB = b.get_meta_window().get_layer();
      return layerB - layerA;
    });

    return candidates[0] ?? null;
  }

  _isKillable(metaWindow) {
    try {
      const windowType = metaWindow.get_window_type();
      switch (windowType) {
        case Meta.WindowType.DESKTOP:
        case Meta.WindowType.DOCK:
        case Meta.WindowType.UTILITY:
        case Meta.WindowType.SPLASHSCREEN:
        case Meta.WindowType.DROPDOWN_MENU:
        case Meta.WindowType.POPUP_MENU:
        case Meta.WindowType.TOOLTIP:
        case Meta.WindowType.MENU:
          return false;
        default:
          break;
      }

      const app = typeof metaWindow.get_application === 'function'
        ? metaWindow.get_application()
        : null;
      const appId = app?.get_id?.() ?? '';
      if (appId && NON_KILLABLE_APP_IDS.has(appId)) {
        return false;
      }

      const wmClass = metaWindow.get_wm_class()?.toLowerCase?.() ?? '';
      if (wmClass && NON_KILLABLE_WM_CLASSES.has(wmClass)) {
        return false;
      }

      if (typeof metaWindow.is_override_redirect === 'function' && metaWindow.is_override_redirect()) {
        return false;
      }
    } catch (error) {
      logError(error, 'Failed to evaluate window for force quit');
      return false;
    }

    return true;
  }
}

export function openForceQuitOverlay() {
  if (activeSelection) {
    return;
  }

  activeSelection = new SelectionWindow();
  activeSelection.connect('stop', () => {
    activeSelection = null;
  });
}
