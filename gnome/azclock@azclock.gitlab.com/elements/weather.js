import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import GWeather from 'gi://GWeather';
import NM from 'gi://NM';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatTime} from 'resource:///org/gnome/shell/misc/dateUtils.js';

import * as Utils from '../utils.js';
import * as WeatherUtils from './weatherUtils.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

Gio._promisify(NM.Client, 'new_async');

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_INTERVAL = 3; // seconds

const IconType = {
    SYMBOLIC: 0,
    FULL_COLOR: 1,
};

function formatTemperature(value) {
    return typeof value === 'number' ? `${Math.round(value).toFixed(0)}°` : undefined;
}

export const WeatherElement = GObject.registerClass(
class AzClockWeatherElement extends St.Widget {
    _init(settings, extension) {
        super._init({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            layout_manager: new Clutter.BoxLayout(),
        });

        this._isLoading = false;

        this.layout_manager.set({
            spacing: 28,
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._settings = settings;
        this._extension = extension;
        this._world = GWeather.Location.get_world();

        this._createWeatherGrids();

        this._settings.connectObject('changed::polling-interval', () => this.refreshWeather(), this);
        this._settings.connectObject('changed::locations', () => this._setWeatherInfo(), this);

        this._settings.connectObject('changed', () => this._sync(), this);
        this._setWeatherInfo();

        this.connect('destroy', () => this._onDestroy());
        this._createNMClient().catch(e => console.log(e));
    }

    _createWeatherGrids() {
        this._currentWeatherGrid = null;
        this._forecastGrid = null;
        this._dailyForecastGrid = null;

        const currentWeatherLayout = new Clutter.GridLayout({
            column_spacing: 6,
            row_spacing: 2,
        });
        this._currentWeatherGrid = new St.Widget({
            layout_manager: currentWeatherLayout,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        currentWeatherLayout.hookup_style(this._currentWeatherGrid);
        this.add_child(this._currentWeatherGrid);

        const forecastLayout = new Clutter.GridLayout({
            column_spacing: 20,
            row_spacing: 10,
        });
        this._forecastGrid = new St.Widget({
            layout_manager: forecastLayout,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        forecastLayout.hookup_style(this._forecastGrid);
        this.add_child(this._forecastGrid);

        const dailyForecastLayout = new Clutter.GridLayout({
            column_spacing: 20,
            row_spacing: 10,
        });
        this._dailyForecastGrid = new St.Widget({
            layout_manager: dailyForecastLayout,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        dailyForecastLayout.hookup_style(this._dailyForecastGrid);
        this.add_child(this._dailyForecastGrid);
    }

    async _createNMClient() {
        this._client = await NM.Client.new_async(null);
        this._client.connectObject('notify::connectivity', () => this._onConnectivityChanged(), this);
    }

    _onConnectivityChanged() {
        const connectivity = this._client.get_connectivity();

        if (connectivity === NM.ConnectivityState.FULL) {
            this._attemptReconnect = false;
            this._setWeatherInfo();
        } else {
            this._attemptReconnect = false;
            this._setStatusLabel(_('Go Online for Weather Information'));
        }
    }

    _setStatusLabel(status, needsReconnect = true) {
        this._removePollingInterval();
        this.destroy_all_children();
        this._createWeatherGrids();
        this.queue_relayout();
        this._forecastGrid.visible = false;
        this._dailyForecastGrid.visible = false;
        const layout = this._currentWeatherGrid.layout_manager;
        const errorLabel = new St.Label({
            text: _(status),
            x_align: Clutter.ActorAlign.START,
            style: 'text-align: center; font-size: 12pt;',
        });
        layout.attach(errorLabel, 0, 0, 1, 1);

        if (!needsReconnect) {
            this.queue_relayout();
            return;
        }

        if (this._reconnectCount === MAX_RECONNECT_ATTEMPTS) {
            const reloadButton = new St.Button({
                style_class: 'icon-button',
                icon_name: 'view-refresh-symbolic',
                x_align: Clutter.ActorAlign.CENTER,
            });
            reloadButton.connect('clicked', () => {
                this.refreshWeather();
            });
            layout.attach(reloadButton, 0, 1, 1, 1);
        } else {
            const reconnectingLabel = new St.Label({
                text: _('Retrying...'),
                x_align: Clutter.ActorAlign.START,
                style: 'text-align: center; font-size: 12pt;',
            });
            layout.attach(reconnectingLabel, 0, 1, 1, 1);
        }

        this.queue_relayout();

        // If there is an error gathering the weather info, add a 3 second Glib.timeout that runs 3 times
        // to attempt to retry to gather the weather info.
        if (!this._attemptReconnect)
            this._startReconnectAttempt();
    }

    refreshWeather() {
        this._reconnectCount = 0;
        this._setStatusLabel(_('Refresh Weather'), false);
        this._attemptReconnect = false;
        this._removeReconnectId();
        this._removePollingInterval();
        this._setWeatherInfo();
    }

    _startReconnectAttempt() {
        this._attemptReconnect = true;
        this._reconnectCount = 0;
        this._reconnectId = GLib.timeout_add_seconds(GLib.PRIORITY_HIGH, RECONNECT_INTERVAL, () => {
            this._reconnectCount++;
            this._setWeatherInfo();

            if (this._reconnectCount === MAX_RECONNECT_ATTEMPTS) {
                this._reconnectId = null;
                return GLib.SOURCE_REMOVE;
            }

            return GLib.SOURCE_CONTINUE;
        });
    }

    _removeReconnectId() {
        if (this._reconnectId) {
            GLib.source_remove(this._reconnectId);
            this._reconnectId = null;
        }
    }

    _startPollingInterval() {
        const pollingInterval = this._settings.get_int('polling-interval');
        this._pollingIntervalId = GLib.timeout_add_seconds(GLib.PRIORITY_HIGH, pollingInterval, () => {
            this._loadInfo();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _removePollingInterval() {
        if (this._pollingIntervalId) {
            GLib.source_remove(this._pollingIntervalId);
            this._pollingIntervalId = null;
        }
    }

    _setWeatherInfo() {
        const locations = this._settings.get_value('locations').deepUnpack();
        const serialized = locations.shift();
        if (!serialized) {
            this._setStatusLabel(_('Location not set!'), false);
            return;
        }

        // Disconnect the previous weatherInfo
        if (this._updatedId && this._weatherInfo) {
            this._weatherInfo.disconnect(this._updatedId);
            this._updatedId = null;
        }

        const providers =
            GWeather.Provider.METAR |
            GWeather.Provider.MET_NO |
            GWeather.Provider.OWM;

        const location = this._world.deserialize(serialized);
        this._weatherInfo = new GWeather.Info({
            application_id: 'org.gnome.Shell',
            contact_info: 'https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/HEAD/gnome-shell.doap',
            enabled_providers: providers,
            location,
        });

        this._updatedId = this._weatherInfo.connect_after('updated', () => {
            this._sync();
            this.queue_relayout();
        });
        this._loadInfo();
        this.queue_relayout();
    }

    _loadInfo() {
        if (!this._weatherInfo)
            return;

        const id = this._weatherInfo.connect('updated', () => {
            this._weatherInfo.disconnect(id);
            this._isLoading = false;
        });

        this._isLoading = true;
        this._weatherInfo.update();
    }

    _sync() {
        if (!this._weatherInfo)
            return;

        if (this._isLoading) {
            this._setStatusLabel(_('Loading…'), false);
            return;
        }

        if (this._weatherInfo.is_valid()) {
            this._displayWeather();
            this._removeReconnectId();
            this._startPollingInterval();
            return;
        }

        if (this._weatherInfo.network_error())
            this._setStatusLabel(_('Go Online for Weather Information'));
        else
            this._setStatusLabel(_('Weather Information Unavailable'));
    }

    _displayWeather() {
        this.destroy_all_children();
        this._createWeatherGrids();

        this.queue_relayout();

        const showCurrent = this._settings.get_boolean('show-current-conditions');
        const showHourly = this._settings.get_boolean('show-hourly-forecast');
        const showDaily = this._settings.get_boolean('show-daily-forecast');

        this._currentWeatherGrid.visible = showCurrent;
        if (showCurrent)
            this._getCurrentWeather();

        this._forecastGrid.visible = showHourly;
        if (showHourly)
            this._getHourlyForecast();

        this._dailyForecastGrid.visible = showDaily;
        if (showDaily)
            this._getDailyForecast();

        this.queue_relayout();
    }

    _getCurrentWeather() {
        const layout = this._currentWeatherGrid.layout_manager;
        if (!layout)
            return;

        const location = this._weatherInfo.get_location_name();
        const temperatureUnit = WeatherUtils.getTemperatureUnit(this._settings.get_enum('temperature-unit'));
        const [, tempApparentValue] = this._weatherInfo.get_value_apparent(temperatureUnit);
        const [, tempValue] = this._weatherInfo.get_value_temp(temperatureUnit);
        const iconName = this._weatherInfo.get_icon_name();
        const iconSymbolicName = this._weatherInfo.get_symbolic_icon_name();
        const summary = this._weatherInfo.get_weather_summary();
        const humidity = this._weatherInfo.get_humidity();

        const iconType = this._settings.get_enum('current-weather-icon-type');
        const showHumidity = this._settings.get_boolean('show-current-humidity');
        const showConditions = this._settings.get_boolean('show-current-summary');
        const showApparentTemp = this._settings.get_boolean('show-current-apparent-temp');
        const showLocation = this._settings.get_boolean('show-location');

        const locationLabel = new St.Label({
            text: location,
            x_align: Clutter.ActorAlign.START,
        });
        this._setActorStyle(locationLabel, 'text-align: center; font-size: 12pt;');
        const icon = new St.Icon({
            icon_name: iconType === IconType.SYMBOLIC ? iconSymbolicName : iconName,
            x_align: Clutter.ActorAlign.START,
            x_expand: false,
            icon_size: 62,
        });
        this._setActorStyle(icon);

        const padding = showLocation ? ' padding-top: 12px;' : ' padding-top: 0px;';

        const temp = new St.Label({
            text: `${formatTemperature(tempValue)}`,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._setActorStyle(temp, `text-align: center; font-size: 32pt;${padding}`);

        const conditions = new St.Label({
            text: `${summary.replace(`${location}: `, '')}`,
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this._setActorStyle(conditions, 'text-align: center; font-size: 9pt;');

        const humidityLabel = new St.Label({
            text: _('Humidity: %s').format(humidity),
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this._setActorStyle(humidityLabel, 'text-align: center; font-size: 9pt;');

        const feelsLike = new St.Label({
            text: _('Feels like %s').format(formatTemperature(tempApparentValue)),
            x_align: Clutter.ActorAlign.END,
            x_expand: true,
        });
        this._setActorStyle(feelsLike, 'text-align: center; font-size: 9pt;');

        layout.attach(icon, 0, 0, 1, 3);
        if (showLocation)
            layout.attach(locationLabel, 1, 0, 1, 3);
        layout.attach(temp, 1, 0, 1, 3);

        let y = 0;
        if (showHumidity) {
            layout.attach(humidityLabel, 2, y, 1, 1);
            y++;
        }
        if (showConditions) {
            layout.attach(conditions, 2, y, 1, 1);
            y++;
        }
        if (showApparentTemp)
            layout.attach(feelsLike, 2, y, 1, 1);
    }

    _getHourlyForecast() {
        const forecasts = this._weatherInfo.get_forecast_list();
        const maxForecasts = this._settings.get_int('max-hourly-forecasts');
        const forecast = WeatherUtils.getHourlyForecast(this._weatherInfo, forecasts, maxForecasts);
        if (!forecast)
            return;

        const iconType = this._settings.get_enum('hourly-weather-icon-type');
        const layout = this._forecastGrid.layout_manager;
        let col = 0;
        forecast.forEach(data => {
            const iconName = data.get_icon_name();
            const iconSymbolicName = data.get_symbolic_icon_name();
            const temperatureUnit = WeatherUtils.getTemperatureUnit(this._settings.get_enum('temperature-unit'));
            const [, tempValue] = data.get_value_temp(temperatureUnit);
            const [valid_, timestamp] = data.get_value_update();
            const timeStr = formatTime(new Date(timestamp * 1000), {
                timeOnly: true,
                ampm: false,
            });

            const time = new St.Label({
                text: timeStr,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.START,
            });
            this._setActorStyle(time, 'text-align: center; font-size: 9pt;');
            const icon = new St.Icon({
                icon_name: iconType === IconType.SYMBOLIC ? iconSymbolicName : iconName,
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                icon_size: 34,
            });
            this._setActorStyle(icon);
            const temp = new St.Label({
                text: `${formatTemperature(tempValue)}`,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.START,
            });
            this._setActorStyle(temp, 'text-align: center; font-size: 9pt;');

            layout.attach(time, col, 0, 1, 1);
            layout.attach(icon, col, 1, 1, 1);
            layout.attach(temp, col, 2, 1, 1);
            col++;
        });
    }

    _getDailyForecast() {
        const forecasts = this._weatherInfo.get_forecast_list();
        const maxForecasts = this._settings.get_int('max-daily-forecasts');
        const temperatureUnit = WeatherUtils.getTemperatureUnit(this._settings.get_enum('temperature-unit'));
        const forecast = WeatherUtils.getDailyForecast(forecasts, maxForecasts, temperatureUnit);
        if (!forecast)
            return;

        const iconType = this._settings.get_enum('daily-weather-icon-type');
        const showThermometerScale = this._settings.get_boolean('show-daily-forecast-thermometer-scale');
        let weeklyMax, weeklyMin;
        const layout = this._dailyForecastGrid.layout_manager;
        let row = 0;
        forecast.forEach(dayData => {
            const dateFormat = this._settings.get_string('daily-forecast-date-format');
            const dateString = `${dayData.datetime.format(dateFormat)}`;
            const dayHigh = Math.round(dayData.maxTemp).toFixed(0);
            const dayMin = Math.round(dayData.minTemp).toFixed(0);
            const maxTemp = formatTemperature(dayData.maxTemp);
            const minTemp = formatTemperature(dayData.minTemp);
            weeklyMax = Math.round(dayData.weekHighestTemp).toFixed(0);
            weeklyMin = Math.round(dayData.weekLowestTemp).toFixed(0);

            const iconName = `${dayData.day.get_icon_name()}-small`;
            const iconSymbolicName = dayData.day.get_symbolic_icon_name();

            const dateLabel = new St.Label({
                text: dateString,
                x_align: Clutter.ActorAlign.START,
            });
            this._setActorStyle(dateLabel, 'text-align: center; font-size: 9pt;');
            const icon = new St.Icon({
                icon_name: iconType === IconType.SYMBOLIC ? iconSymbolicName : iconName,
                x_align: Clutter.ActorAlign.CENTER,
                x_expand: true,
                icon_size: 16,
            });
            this._setActorStyle(icon);

            const tempMax = new St.Label({
                text: `${maxTemp}`,
                x_align: Clutter.ActorAlign.END,
                x_expand: false,
            });
            this._setActorStyle(tempMax, 'text-align: center; font-size: 9pt;');
            const tempMin = new St.Label({
                text: `${minTemp}`,
                x_align: Clutter.ActorAlign.END,
                x_expand: true,
            });
            this._setActorStyle(tempMin, 'text-align: center; font-size: 9pt;');

            const tempScale = new ThermometerScale(dayHigh, dayMin, weeklyMax, weeklyMin);
            this._setActorStyle(tempScale);

            const temperatureBox = new St.BoxLayout({
                style: 'spacing: 4px;',
            });
            temperatureBox.add_child(tempMin);
            temperatureBox.add_child(tempScale);
            temperatureBox.add_child(tempMax);

            const tempMinMax = new St.Label({
                text: `${maxTemp} | ${minTemp}`,
                x_align: Clutter.ActorAlign.END,
                x_expand: true,
            });
            this._setActorStyle(tempMinMax, 'text-align: center; font-size: 9pt;');

            layout.attach(dateLabel, 0, row, 1, 1);
            layout.attach(icon, 1, row, 1, 1);
            if (showThermometerScale)
                layout.attach(temperatureBox, 2, row, 1, 1);
            else
                layout.attach(tempMinMax, 2, row, 1, 1);
            row++;
        });
    }

    _setActorStyle(actor, style = '') {
        const [shadowEnabled, shadowColor, shadowX, shadowY,
            shadowSpread, shadowBlur] = this._settings.get_value('weather-actor-shadow').deepUnpack();
        const [customFontEnabled, customFontFamily] = this._settings.get_value('font-family-override').deepUnpack();
        const textColor = this._settings.get_string('foreground-color');
        const iconColor = this._settings.get_string('icon-color');

        let shadowType, color;

        if (actor instanceof St.Label) {
            shadowType = 'text-shadow';
            color = textColor;
        } else if (actor instanceof St.Icon) {
            shadowType = 'icon-shadow';
            color = iconColor;
        } else {
            shadowType = 'box-shadow';
            color = textColor;
        }

        style += `color: ${color};`;

        if (actor instanceof St.Label) {
            actor.clutter_text.set({
                ellipsize: Pango.EllipsizeMode.NONE,
            });
            style += ' font-feature-settings: "tnum";';
        }

        if (shadowEnabled)
            style += `${shadowType}: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;

        if (customFontEnabled && actor instanceof St.Label) {
            const fontStyleEnum = this._settings.get_enum('font-style');
            const fontStyle = Utils.fontStyleEnumToString(fontStyleEnum);
            const fontWeight = this._settings.get_int('font-weight');

            style += ` font-family: "${customFontFamily}";`;

            if (fontWeight)
                style += ` font-weight: ${fontWeight};`;
            if (fontStyle)
                style += ` font-style: ${fontStyle};`;
        }
        if (!actor.style)
            actor.style = style;
        else
            actor.style += style;
    }

    _onDestroy() {
        this._client.disconnectObject(this);
        this._settings.disconnectObject(this);
        this._removePollingInterval();
        this._removeReconnectId();
        if (this._updatedId) {
            this._weatherInfo.disconnect(this._updatedId);
            this._updatedId = null;
        }
        this._world = null;
        this._client = null;
        this._weatherInfo = null;
        this._settings = null;
        this._extension = null;
    }
});

var ThermometerScale = GObject.registerClass(
class AzClockThermometerScale extends St.Widget {
    _init(dayHigh, dayLow, weeklyHigh, weeklyLow) {
        super._init({
            x_expand: false,
            x_align: Clutter.ActorAlign.CENTER,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._dayHigh = dayHigh;
        this._dayLow = dayLow;
        this._weeklyHigh = weeklyHigh;
        this._weeklyLow = weeklyLow;

        this._drawingArea = new St.DrawingArea({
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            width: 140,
            height: 6,
        });
        this._drawingArea.connect('repaint', this._onRepaint.bind(this));
        this.add_child(this._drawingArea);
    }

    _onRepaint(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();

        const weeklyRange = (this._weeklyHigh - this._weeklyLow) || 1;
        const factor = width / weeklyRange;
        const gradientWidth = Math.max(factor * (this._dayHigh - this._dayLow), 6);

        const x = factor * (this._dayLow - this._weeklyLow);
        const y = 0;

        // Draw the background
        const fill = Cairo.SolidPattern.createRGBA(0.25, 0.25, 0.25, 1.0);
        drawRoundedLine(cr, 0, 0, width, height, fill);

        // Create a linear gradient for the temperature bar
        const gradient = new Cairo.LinearGradient(x, y, x + gradientWidth, height);
        gradient.addColorStopRGBA(0, 0.43, 0.76, 0.89, 0.8);
        gradient.addColorStopRGBA(1, 0.45, 0.88, 0.46, 0.8);

        // Draw the temperature bar
        drawRoundedLine(cr, x, y, gradientWidth, height, gradient);

        cr.$dispose();
    }
});

function drawRoundedLine(cr, x, y, width, height, fill) {
    const DEGREES = Math.PI / 180;
    const RADIUS = height / 2.0;

    cr.newSubPath();
    cr.arc(x + RADIUS, y + RADIUS, RADIUS, 90 * DEGREES, 270 * DEGREES);
    cr.arc(x + width - RADIUS, y + RADIUS, RADIUS, 270 * DEGREES, 90 * DEGREES);
    cr.closePath();

    if (fill !== null) {
        cr.setSource(fill);
        cr.fillPreserve();
    }
    cr.fill();
}

