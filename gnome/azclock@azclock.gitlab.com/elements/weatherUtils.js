/**
 * Code adapted from GNOME Weather App
 * https://gitlab.gnome.org/GNOME/gnome-weather
 */

import GLib from 'gi://GLib';
import GWeather from 'gi://GWeather';

// In microseconds
const ONE_HOUR = 60 * 60 * 1000 * 1000;
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR;

function getNight(date) {
    return GLib.DateTime.new_local(date.get_year(),
        date.get_month(),
        date.get_day_of_month(),
        2, 0, 0);
}

function getMorning(date) {
    return GLib.DateTime.new_local(date.get_year(),
        date.get_month(),
        date.get_day_of_month(),
        7, 0, 0);
}

function getDay(date) {
    return GLib.DateTime.new_local(date.get_year(),
        date.get_month(),
        date.get_day_of_month(),
        12, 0, 0);
}

function getAfternoon(date) {
    return GLib.DateTime.new_local(date.get_year(),
        date.get_month(),
        date.get_day_of_month(),
        17, 0, 0);
}

function getEvening(date) {
    return GLib.DateTime.new_local(date.get_year(),
        date.get_month(),
        date.get_day_of_month(),
        22, 0, 0);
}

function getTemp(info, temperatureUnit) {
    const [, temp] = info.get_value_temp(temperatureUnit);
    return temp;
}

function getDateTime(info) {
    const [, date] = info.get_value_update();
    return GLib.DateTime.new_from_unix_local(date);
}

function arrayEqual(one, two) {
    if (one.length !== two.length)
        return false;

    return one.every((a, i) => a === two[i]);
}

/**
 *
 * @param {int} temperatureUnit
 * @returns {GWeather.TemperatureUnit}
 */
export function getTemperatureUnit(temperatureUnit) {
    if (temperatureUnit === 1)
        return GWeather.TemperatureUnit.CENTIGRADE;
    else if (temperatureUnit === 2)
        return GWeather.TemperatureUnit.FAHRENHEIT;
    else
        return GWeather.TemperatureUnit.DEFAULT;
}

/**
 *
 * @param {GWeather.Info[]} forecasts
 * @param {int} maxForecasts
 * @param {int} temperatureUnit
 */
export function getDailyForecast(forecasts, maxForecasts, temperatureUnit) {
    const dailyForecastInfo = [];
    const forecast = preprocess(forecasts, maxForecasts, temperatureUnit);
    if (forecast.days.length > 1) {
        forecast.days.forEach(dayInfos => {
            const dayData = buildDayEntry(dayInfos, forecast.weekHighestTemp, forecast.weekLowestTemp, temperatureUnit);
            dailyForecastInfo.push(dayData);
        });
        return dailyForecastInfo;
    } else {
        return null;
    }
}

/**
 *
 * @param {GWeather.Info} forecastInfo
 * @param {GWeather.Info[]} forecasts
 * @param {int} maxForecasts
 */
export function getHourlyForecast(forecastInfo, forecasts, maxForecasts) {
    const coords = forecastInfo.location.get_coords();
    const nearestCity = GWeather.Location.get_world().find_nearest_city(coords[0], coords[1]);
    const tz = nearestCity.get_timezone();
    const now = GLib.DateTime.new_now(tz);

    const hourlyInfo = [...forecasts].filter(info => {
        const [, date] = info.get_value_update();
        const datetime = GLib.DateTime.new_from_unix_utc(date).to_timezone(now.get_timezone());

        // Show the previous hour's forecast until 30 minutes in
        if (datetime.difference(now) <= -ONE_HOUR / 2)
            return false;

        if (datetime.difference(now) > TWENTY_FOUR_HOURS)
            return false;

        return true;
    });

    if (hourlyInfo.length > 0) {
        hourlyInfo.splice(maxForecasts);
        return hourlyInfo;
    } else {
        return null;
    }
}

function preprocess(infos, maxForecasts, temperatureUnit) {
    let i;

    let day = GLib.DateTime.new_now_local();
    day = day.add_days(1);

    // First ignore all infos that are on a different
    // older than day.
    // infos are ordered by time, and it's assumed at some point
    // there is an info for the day (otherwise, nothing
    // is shown)
    for (i = 0; i < infos.length; i++) {
        const info = infos[i];

        const datetime = getDateTime(info);
        if (arrayEqual(day.get_ymd(), datetime.get_ymd()))
            break;
    }

    const weekInfos = [];
    while (i < infos.length) {
        const dayInfos = {day, infos: []};
        for (; i < infos.length; i++) {
            const info = infos[i];

            const datetime = getDateTime(info);
            if (!arrayEqual(day.get_ymd(), datetime.get_ymd()))
                break;

            dayInfos.infos.push(info);
        }
        weekInfos.push(dayInfos);
        day = day.add_days(1);
    }

    weekInfos.splice(maxForecasts);

    const temperatures = weekInfos.map(dayInfos => dayInfos.infos)
            .flat()
            .map(info => getTemp(info, temperatureUnit));

    const weekHighestTemp = Math.max(...temperatures);
    const weekLowestTemp = Math.min(...temperatures);

    return {
        weekHighestTemp,
        weekLowestTemp,
        days: weekInfos,
    };
}

function buildDayEntry({day, infos}, weekHighestTemp, weekLowestTemp, temperatureUnit) {
    const datetime = getDay(day);

    const temperatures = infos.map(info => getTemp(info, temperatureUnit));
    const minTemp = Math.min(...temperatures);
    const maxTemp = Math.max(...temperatures);

    const periodInfos = {}, times = {
        day: getDay(datetime),
        night: getNight(datetime),
        morning: getMorning(datetime),
        afternoon: getAfternoon(datetime),
        evening: getEvening(datetime),
    };

    const datetimes = infos.map(info => getDateTime(info));

    for (const period of ['day', 'night', 'morning', 'afternoon', 'evening']) {
        const differences = datetimes.map(dt => Math.abs(dt.difference(times[period])));

        const index = differences.indexOf(Math.min(...differences));

        periodInfos[period] = infos[index];
    }


    const {day: dayInfo, night, morning, afternoon, evening} = periodInfos;

    return {
        datetime,
        weekHighestTemp,
        weekLowestTemp,
        maxTemp,
        minTemp,
        day: dayInfo,
        night,
        morning,
        afternoon,
        evening,
    };
}
