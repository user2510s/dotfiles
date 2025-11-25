import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {formatDateWithCFormatString} from 'resource:///org/gnome/shell/misc/dateUtils.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Label} from './baseLabel.js';
import * as Utils from '../utils.js';

export const DigitalClock = GObject.registerClass(
class AzClockDigitalClock extends Label {
    _init(settings, extension) {
        super._init(settings, extension);
        this._urls = [];

        this._settings.connectObject('changed::timezone-override', () => {
            const [timeZoneEnabled, timeZone] = this._settings.get_value('timezone-override').deepUnpack();
            this._timeZoneCache = timeZoneEnabled ? GLib.TimeZone.new(timeZone) : null;
        }, this);

        const [timeZoneEnabled, timeZone] = this._settings.get_value('timezone-override').deepUnpack();
        this._timeZoneCache = timeZoneEnabled ? GLib.TimeZone.new(timeZone) : null;
    }

    setStyle() {
        super.setStyle();
        const dateFormat = this._settings.get_string('date-format');
        this._dateFormat = dateFormat;
    }

    updateClock() {
        const date = new Date();

        const dateFormat = this._dateFormat;
        const elementDate = Utils.getClockDate(this._settings, date, this._timeZoneCache);

        if (dateFormat)
            this.text = formatDateWithCFormatString(elementDate, dateFormat);

        this.setMarkup(this.text);

        this.queue_relayout();
    }

    _highlightUrls() {
    }

    _findUrlAtPos() {
        return -1;
    }

    _onDestroy() {
        this._urls = null;
        this._timeZoneCache = null;
        this._dateFormat = null;
        super._onDestroy();
    }
});
