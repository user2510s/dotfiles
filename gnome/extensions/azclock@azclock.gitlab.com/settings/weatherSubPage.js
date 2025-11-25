import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {SubPage} from './subPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const WeatherSubPage = GObject.registerClass(
class AzClockWeatherSubPage extends SubPage {
    _init(params) {
        super._init(params);

        const weatherOptionsGroup = new Adw.PreferencesGroup();
        this.add(weatherOptionsGroup);

        const timeZoneRow = this.createLocationRow();
        if (timeZoneRow)
            weatherOptionsGroup.add(timeZoneRow);

        const temperatureUnit = this.settings.get_enum('temperature-unit');
        const temperatureUnitList = new Gtk.StringList();
        temperatureUnitList.append(_('System Default'));
        temperatureUnitList.append(_('Celsius'));
        temperatureUnitList.append(_('Fahrenheit'));

        const temperatureUnitComboRow = new Adw.ComboRow({
            title: _('Temperature Unit'),
            model: temperatureUnitList,
            selected: temperatureUnit,
        });
        temperatureUnitComboRow.connect('notify::selected', widget => {
            this.settings.set_enum('temperature-unit', widget.selected);
        });
        weatherOptionsGroup.add(temperatureUnitComboRow);

        const pollingIntervalButton = this.createSpinButton(this.settings.get_int('polling-interval') / 60, 1, 30);
        pollingIntervalButton.connect('value-changed', widget => {
            const valueInSeconds = widget.get_value() * 60;
            this.settings.set_int('polling-interval', valueInSeconds);
        });
        const pollingIntervalRow = new Adw.ActionRow({
            title: _('Polling Interval (minutes)'),
            subtitle: _('How often the weather will update'),
            activatable_widget: pollingIntervalButton,
        });
        pollingIntervalRow.add_suffix(pollingIntervalButton);
        weatherOptionsGroup.add(pollingIntervalRow);

        const displayOptionsGroup = new Adw.PreferencesGroup();
        this.add(displayOptionsGroup);

        const showCurrentConditionRow = this._createExpanderRow(_('Current Weather'), 'show-current-conditions');
        const currentWeatherIconType = this._createIconTypeRow(_('Icon Type'), 'current-weather-icon-type');
        showCurrentConditionRow.add_row(currentWeatherIconType);
        const showHumiditySwitchRow = this._createSwitchRow(_('Humidity'), 'show-current-humidity');
        showCurrentConditionRow.add_row(showHumiditySwitchRow);
        const showDescriptionSwitchRow = this._createSwitchRow(_('Weather Description'), 'show-current-summary');
        showCurrentConditionRow.add_row(showDescriptionSwitchRow);
        const showApparentSwitchRow = this._createSwitchRow(_('Apparent Temperature'), 'show-current-apparent-temp');
        showCurrentConditionRow.add_row(showApparentSwitchRow);
        const showLocationSwitchRow = this._createSwitchRow(_('Location'), 'show-location');
        showCurrentConditionRow.add_row(showLocationSwitchRow);
        displayOptionsGroup.add(showCurrentConditionRow);

        const showHourlyForecastRow = this._createExpanderRow(_('Hourly Forecast'), 'show-hourly-forecast');
        const hourlyForecastIconType = this._createIconTypeRow(_('Icon Type'), 'hourly-weather-icon-type');
        showHourlyForecastRow.add_row(hourlyForecastIconType);
        const maxHourlyForecastsRow = this._createSpinRow(_('Max Hourly Forecasts'), 'max-hourly-forecasts', 3, 12);
        showHourlyForecastRow.add_row(maxHourlyForecastsRow);
        displayOptionsGroup.add(showHourlyForecastRow);

        const showDailyForecastRow = this._createExpanderRow(_('Daily Forecast'), 'show-daily-forecast');
        const dailyForecastIconType = this._createIconTypeRow(_('Icon Type'), 'daily-weather-icon-type');
        showDailyForecastRow.add_row(dailyForecastIconType);
        const showThermometerScaleRow = this._createSwitchRow(_('Thermometer Scale'), 'show-daily-forecast-thermometer-scale');
        showDailyForecastRow.add_row(showThermometerScaleRow);
        const maxDailyForecastsRow = this._createSpinRow(_('Max Daily Forecasts'), 'max-daily-forecasts', 1, 7);
        showDailyForecastRow.add_row(maxDailyForecastsRow);

        const linkButton = new Gtk.LinkButton({
            label: _('Format Guide'),
            uri: 'https://docs.gtk.org/glib/method.DateTime.format.html#description',
            css_classes: ['caption'],
            valign: Gtk.Align.CENTER,
        });
        const dateFormatTextRow = new Adw.ActionRow({
            title: _('Date Format'),
        });
        dateFormatTextRow.add_suffix(linkButton);

        const dateFormatEntry = new Gtk.Entry({
            valign: Gtk.Align.FILL,
            vexpand: true,
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: this.settings.get_string('daily-forecast-date-format') || '',
        });
        dateFormatEntry.connect('changed', widget => {
            this.settings.set_string('daily-forecast-date-format', widget.get_text());
        });
        const dateFormatRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });
        dateFormatRow.set_child(dateFormatEntry);
        showDailyForecastRow.add_row(dateFormatTextRow);
        showDailyForecastRow.add_row(dateFormatRow);
        displayOptionsGroup.add(showDailyForecastRow);

        const styleGroup = new Adw.PreferencesGroup({
            title: _('Style'),
        });
        this.add(styleGroup);

        const [overrideFontFamily, fontFamily] = this.settings.get_value('font-family-override').deepUnpack();
        const fontExpanderRow = new Adw.ExpanderRow({
            title: _('Override Font Family'),
            show_enable_switch: true,
            expanded: overrideFontFamily,
            enable_expansion: overrideFontFamily,
        });
        styleGroup.add(fontExpanderRow);
        fontExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue('font-family-override', '(bs)', widget.enable_expansion, 0);
        });

        const fontButton = new Gtk.FontDialogButton({
            valign: Gtk.Align.CENTER,
            use_size: false,
            use_font: true,
            level: Gtk.FontLevel.FAMILY,
            font_desc: Pango.font_description_from_string(fontFamily),
            dialog: new Gtk.FontDialog(),
        });
        fontButton.connect('notify::font-desc', widget => {
            const newFontFamily = widget.font_desc.get_family();
            this._setVariantValue('font-family-override', '(bs)', newFontFamily, 1);
        });
        const fontRow = new Adw.ActionRow({
            title: _('Font'),
        });
        fontRow.add_suffix(fontButton);
        fontExpanderRow.add_row(fontRow);
        const fontWeightSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 100, upper: 1000, step_increment: 100, page_increment: 1, page_size: 0,
            }),
            climb_rate: 1,
            numeric: true,
            valign: Gtk.Align.CENTER,
            value: this.settings.get_int('font-weight'),
        });
        fontWeightSpinButton.connect('value-changed', widget => {
            this.settings.set_int('font-weight', widget.get_value());
        });
        const fontWeightRow = new Adw.ActionRow({
            title: _('Font Weight'),
            /** TRANSLATORS: This shows some standard font weight names and how they correlate to a numerical value*/
            subtitle: _('100 = Thin, 400 = Normal, 700 = Bold'),
            activatable_widget: fontWeightSpinButton,
        });
        fontWeightRow.add_suffix(fontWeightSpinButton);
        fontExpanderRow.add_row(fontWeightRow);

        const fontSyle = this.settings.get_enum('font-style');
        const fontSyleStringList = new Gtk.StringList();
        fontSyleStringList.append(_('Normal'));
        fontSyleStringList.append(_('Oblique'));
        fontSyleStringList.append(_('Italic'));

        const fontSyleComboRow = new Adw.ComboRow({
            title: _('Font Style'),
            model: fontSyleStringList,
            selected: fontSyle,
        });
        fontSyleComboRow.connect('notify::selected', widget => {
            this.settings.set_enum('font-style', widget.selected);
        });
        fontExpanderRow.add_row(fontSyleComboRow);

        const textColorButton = this.createColorButton(this.settings.get_string('foreground-color'));
        textColorButton.connect('color-set', widget => {
            this.settings.set_string('foreground-color', widget.get_rgba().to_string());
        });
        const textColorRow = new Adw.ActionRow({
            title: _('Text Color'),
            activatable_widget: textColorButton,
        });
        textColorRow.add_suffix(textColorButton);
        styleGroup.add(textColorRow);

        const iconColorButton = this.createColorButton(this.settings.get_string('icon-color'));
        iconColorButton.connect('color-set', widget => {
            this.settings.set_string('icon-color', widget.get_rgba().to_string());
        });
        const iconColorRow = new Adw.ActionRow({
            title: _('Symbolic Icon Color'),
            activatable_widget: iconColorButton,
        });
        iconColorRow.add_suffix(iconColorButton);
        styleGroup.add(iconColorRow);

        const shadowExpanderRow = this.createShadowExpanderRow(_('Drop Shadow'), 'weather-actor-shadow');
        styleGroup.add(shadowExpanderRow);
    }

    _createIconTypeRow(title, setting) {
        const iconType = this.settings.get_enum(setting);
        const iconTypeList = new Gtk.StringList();
        iconTypeList.append(_('Symbolic'));
        iconTypeList.append(_('Full Color'));

        const iconTypeComboRow = new Adw.ComboRow({
            title: _(title),
            model: iconTypeList,
            selected: iconType,
        });
        iconTypeComboRow.connect('notify::selected', widget => {
            this.settings.set_enum(setting, widget.selected);
        });
        return iconTypeComboRow;
    }

    _createSpinRow(title, setting, min, max) {
        const value = this.settings.get_int(setting);
        const spinButton = this.createSpinButton(value, min, max);
        spinButton.connect('value-changed', widget => {
            this.settings.set_int(setting, widget.get_value());
        });
        const spinRow = new Adw.ActionRow({
            title: _(title),
            activatable_widget: spinButton,
        });
        spinRow.add_suffix(spinButton);

        return spinRow;
    }

    _createExpanderRow(title, settingString) {
        const enabled = this.settings.get_boolean(settingString);
        const expanderRow = new Adw.ExpanderRow({
            title: _(title),
            show_enable_switch: true,
            enable_expansion: enabled,
        });
        expanderRow.connect('notify::enable-expansion', widget => {
            this.settings.set_boolean(settingString, widget.enable_expansion);
        });
        return expanderRow;
    }

    _createSwitchRow(title, settingString) {
        const switchRow = new Adw.SwitchRow({
            title: _(title),
            active: this.settings.get_boolean(settingString),
        });
        switchRow.connect('notify::active', widget => {
            this.settings.set_boolean(settingString, widget.active);
        });
        return switchRow;
    }
});
