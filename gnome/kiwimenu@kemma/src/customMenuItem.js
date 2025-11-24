/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 * customMenuItem.js - Handles custom menu item functionality.
 */

import GLib from 'gi://GLib';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

/**
 * Creates a custom menu item if enabled in settings.
 * 
 * @param {Gio.Settings} settings - The extension settings object
 * @param {Function} gettextFunc - Translation function
 * @returns {PopupMenu.PopupMenuItem|null} The custom menu item or null if disabled
 */
export function createCustomMenuItem(settings, gettextFunc) {
    if (!settings) {
        return null;
    }

    const enabled = settings.get_boolean('custom-menu-enabled');
    if (!enabled) {
        return null;
    }

    const label = settings.get_string('custom-menu-label');
    const command = settings.get_string('custom-menu-command');

    // Don't create menu item if label or command is empty
    const trimmedLabel = label?.trim?.() ?? '';
    const trimmedCommand = command?.trim?.() ?? '';

    if (trimmedLabel.length === 0 || trimmedCommand.length === 0) {
        return null;
    }

    const menuItem = new PopupMenu.PopupMenuItem(trimmedLabel);

    menuItem.connect('activate', () => {
        try {
            const [success, argv] = GLib.shell_parse_argv(trimmedCommand);
            if (success && Array.isArray(argv) && argv.length > 0) {
                Util.spawn(argv);
            } else {
                logError(new Error(`Failed to parse command: ${trimmedCommand}`));
            }
        } catch (error) {
            logError(error, `Failed to execute custom menu command: ${trimmedCommand}`);
        }
    });

    return menuItem;
}
