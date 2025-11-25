import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';

import {domain} from 'gettext';
const {gettext: _} = domain('azclock');

export const ElementType = {
    DIGITAL_CLOCK: 0,
    ANALOG_CLOCK: 1,
    TEXT_LABEL: 2,
    COMMAND_LABEL: 3,
    WEATHER_ELEMENT: 4,
    IMAGE_ELEMENT: 5,
};

/**
 *
 * @param {Pango.Style} pangoStyle
 * @returns A string representing the Pango.Style | null
 */
export function fontStyleEnumToString(pangoStyle) {
    switch (pangoStyle) {
    case Pango.Style.NORMAL:
        return null;
    case Pango.Style.OBLIQUE:
        return 'oblique';
    case Pango.Style.ITALIC:
        return 'italic';
    default:
        return null;
    }
}

/**
 *
 * @param {GSetting} settings
 * @param {JS.Date} origDate
 * @param {GLib.TimeZone} timeZone
 * @returns A new JS.Date with modified timezone or original date
 */
export function getClockDate(settings, origDate, timeZone) {
    const [overrideTimeZone] = settings.get_value('timezone-override').deepUnpack();

    if (!overrideTimeZone)
        return origDate;

    const modifiedDateTime = GLib.DateTime.new_now(timeZone);

    const year = modifiedDateTime.get_year();
    const month = modifiedDateTime.get_month() - 1;
    const day = modifiedDateTime.get_day_of_month();
    const hours = modifiedDateTime.get_hour();
    const minutes = modifiedDateTime.get_minute();
    const seconds = modifiedDateTime.get_second();

    return new Date(year, month, day, hours, minutes, seconds);
}

/**
 *
 * @param {Extension} extension
 * @param {string} schema
 * @param {string} path
 * @returns Gio.Settings
 */
export function getSettings(extension, schema, path) {
    const schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null)) {
        schemaSource = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir.get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false
        );
    } else {
        schemaSource = Gio.SettingsSchemaSource.get_default();
    }

    const schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj) {
        throw new Error(`Desktop Widgets Error! Unable to find/create schema ${schema} with path ${path}.
                            Please report the issue at https://gitlab.com/AndrewZaech/azclock/-/issues`);
    }

    const args = {settings_schema: schemaObj};
    if (path)
        args.path = path;

    return new Gio.Settings(args);
}

/**
 *
 * @param {Extension} extension
 * @param {GSetting} settings
 */
export function createInitialWidget(extension, settings) {
    const needsInitialWidget = settings.get_boolean('create-initial-widget');

    // The initial widget has already been created
    if (!needsInitialWidget)
        return;

    let hasWidgets = false;
    const newWidgets = settings.get_value('widgets').recursiveUnpack();
    newWidgets.forEach(widget => {
        for (const [widgetId, properties_] of Object.entries(widget)) {
            if (widgetId) {
                hasWidgets = true;
                break;
            }
        }
    });

    // New wigdet format already exists
    if (hasWidgets) {
        settings.set_boolean('create-initial-widget', false);
        return;
    }

    const widgets = [];
    const widget = {};
    let randomId = GLib.uuid_string_random();
    const widgetSchema = `${settings.schema_id}.widget-data`;
    const widgetPath = `${settings.path}widget-data/${randomId}/`;
    const widgetSettings = getSettings(extension, widgetSchema, widgetPath);

    widget[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    widgets.push(widget);

    const elements = widgetSettings.get_value('elements').deepUnpack();
    const elementSchema = `${settings.schema_id}.element-data`;
    const elementPath = `${widgetSettings.path}element-data/`;
    let element = {};
    widgetSettings.set_string('name', _('Digital Clock Widget'));

    randomId = GLib.uuid_string_random();
    let elementSettings = getSettings(extension, elementSchema, `${elementPath}${randomId}/`);
    element[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    elements.push(element);
    elementSettings.set_string('name', _('Time Label'));

    element = {};
    randomId = GLib.uuid_string_random();
    elementSettings = getSettings(extension, elementSchema, `${elementPath}${randomId}/`);
    element[randomId] = new GLib.Variant('a{sv}', {
        enabled: GLib.Variant.new_boolean(true),
    });
    elements.push(element);
    elementSettings.set_string('name', _('Date Label'));
    elementSettings.set_string('date-format', '%A %b %d');
    elementSettings.set_int('font-size', 32);

    widgetSettings.set_value('elements', new GLib.Variant('aa{sv}', elements));
    settings.set_value('widgets', new GLib.Variant('aa{sv}', widgets));
    settings.set_boolean('create-initial-widget', false);
}
