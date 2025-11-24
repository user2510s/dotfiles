import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Utils from '../utils.js';

export const AnalogClock = GObject.registerClass(
class AzClockAnalogClock extends Clutter.Actor {
    _init(settings, extension) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this._settings = settings;
        this._extension = extension;

        this._settings.connectObject('changed::timezone-override', () => {
            const [timeZoneEnabled, timeZone] = this._settings.get_value('timezone-override').deepUnpack();
            this._timeZoneCache = timeZoneEnabled ? GLib.TimeZone.new(timeZone) : null;
        }, this);

        const [timeZoneEnabled, timeZone] = this._settings.get_value('timezone-override').deepUnpack();
        this._timeZoneCache = timeZoneEnabled ? GLib.TimeZone.new(timeZone) : null;

        this._clockFace = new St.Icon({
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: this._settings.get_boolean('clock-face-visible'),
        });

        this._secondHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_expand: false,
            y_align: Clutter.ActorAlign.START,
            visible: this._settings.get_boolean('second-hand-visible'),
        });

        this._minuteHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });

        this._hourHand = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            y_align: Clutter.ActorAlign.START,
        });

        this._clockButton = new St.Icon({
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: this._settings.get_boolean('clock-button-visible'),
        });

        if (this.add_actor) {
            this.add_actor(this._clockFace);
            this.add_actor(this._hourHand);
            this.add_actor(this._minuteHand);
            this.add_actor(this._secondHand);
            this.add_actor(this._clockButton);
        } else {
            this.add_child(this._clockFace);
            this.add_child(this._hourHand);
            this.add_child(this._minuteHand);
            this.add_child(this._secondHand);
            this.add_child(this._clockButton);
        }

        this._settings.connectObject('changed', () => this.setStyle(), this);
        this.setStyle();

        this.connect('destroy', () => this._onDestroy());
    }

    setAnalogClockStyle(actor, namePrefix) {
        const directoryName = 'analog-clock-components';
        const filePath = `${this._extension.path}/media/${directoryName}/`;

        actor.style = this.getStyle(namePrefix);

        if (namePrefix === 'clock-face' || namePrefix === 'second-hand' || namePrefix === 'clock-button')
            actor.visible = this._settings.get_boolean(`${namePrefix}-visible`);

        const iconStyle = this._settings.get_int(`${namePrefix}-style`);
        actor.gicon = Gio.icon_new_for_string(`${filePath}/${namePrefix}-${iconStyle}-symbolic.svg`);

        actor.icon_size = this._settings.get_int('clock-size');
    }

    getStyle(namePrefix) {
        let color, shadow, backgroundColor, showBorder, borderWidth, borderColor, borderRadius, boxShadow;

        if (namePrefix === 'clock-face') {
            color = this._settings.get_string('foreground-color');
            backgroundColor = this._settings.get_string('background-color');
            borderRadius = this._settings.get_int('border-radius');
            borderWidth = this._settings.get_int('border-width');
            borderColor = this._settings.get_string('border-color');
            showBorder = this._settings.get_boolean('show-border');
            shadow = this._settings.get_value('shadow').deepUnpack();
            boxShadow = this._settings.get_value('clock-face-shadow').deepUnpack();
        } else {
            color = this._settings.get_string(`${namePrefix}-color`);
            shadow = this._settings.get_value(`${namePrefix}-shadow`).deepUnpack();
        }

        let style = `color: ${color};`;

        if (backgroundColor)
            style += `background-color: ${backgroundColor};`;
        if (borderRadius)
            style += `border-radius: ${borderRadius}px;`;

        if (showBorder) {
            if (borderWidth)
                style += `border: ${borderWidth}px;`;
            if (borderColor)
                style += `border-color: ${borderColor};`;
        }

        let [shadowEnabled, shadowColor, shadowX, shadowY,
            shadowSpread, shadowBlur] = shadow;

        if (shadowEnabled)
            style += `icon-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;

        if (boxShadow) {
            [shadowEnabled, shadowColor, shadowX, shadowY,
                shadowSpread, shadowBlur] = boxShadow;

            if (shadowEnabled)
                style += `box-shadow: ${shadowX}px ${shadowY}px ${shadowBlur}px ${shadowSpread}px ${shadowColor};`;
        }

        return style;
    }

    setStyle() {
        this.setAnalogClockStyle(this._clockFace, 'clock-face');
        this.setAnalogClockStyle(this._secondHand, 'second-hand');
        this.setAnalogClockStyle(this._minuteHand, 'minute-hand');
        this.setAnalogClockStyle(this._hourHand, 'hour-hand');
        this.setAnalogClockStyle(this._clockButton, 'clock-button');
    }

    updateClock(immediate = false) {
        const date = new Date();

        const elementDate = Utils.getClockDate(this._settings, date, this._timeZoneCache);
        this.tickClock(elementDate, immediate);

        this.queue_relayout();
    }

    tickClock(date, immediate) {
        // Keep hours in 12 hour format for analog clock
        if (date.getHours() >= 12)
            date.setHours(date.getHours() - 12);


        const smoothTicks = this._settings.get_boolean('smooth-hand-ticks');
        if (smoothTicks)
            date.setSeconds(date.getSeconds() + 1);

        const seconds = date.getSeconds();
        const degrees = 6; // each minute and second tick represents a 6 degree increment.
        const secondsInDegrees = seconds * degrees;
        const minutesInDegrees = date.getMinutes() * degrees;
        const hoursInDegrees = date.getHours() * 30;

        if (this._secondHand.visible)
            this.tickClockHand(this._secondHand, secondsInDegrees, immediate);

        const adjustMinutesWithSeconds = this._settings.get_boolean('minute-hand-adjust-with-seconds');
        const minutesRotationDegree = adjustMinutesWithSeconds ? minutesInDegrees + secondsInDegrees / 60 : minutesInDegrees;
        this.tickClockHand(this._minuteHand, minutesRotationDegree, immediate);
        this.tickClockHand(this._hourHand, hoursInDegrees + minutesInDegrees / 12, immediate);
    }

    tickClockHand(hand, rotationDegree, immediate) {
        const smoothTicks = this._settings.get_boolean('smooth-hand-ticks');
        // eslint-disable-next-line no-nested-ternary
        const duration = immediate ? 0 : smoothTicks ? 1000 : 300;
        hand.remove_all_transitions();

        // The onComplete() of the hand.ease() might not trigger when removing the transition.
        if (hand.checkRotationDegree) {
            hand.checkRotationDegree = false;
            if (hand.rotation_angle_z !== 0)
                hand.rotation_angle_z = 0;
        }

        if (rotationDegree === hand.rotation_angle_z)
            return;

        // Prevents the clock hand from spinning counter clockwise back to 0.
        if (rotationDegree === 0 && hand.rotation_angle_z !== 0) {
            rotationDegree = 360;
            hand.checkRotationDegree = true;
        }


        hand.ease({
            opacity: 255, // onComplete() seems to trigger instantly without this.
            rotation_angle_z: rotationDegree,
            mode: smoothTicks ? Clutter.AnimationMode.LINEAR : Clutter.AnimationMode.EASE_OUT_QUAD,
            duration,
            onComplete: () => {
                // Prevents the clock hand from spinning counter clockwise back to 0.
                if (rotationDegree === 360)
                    hand.rotation_angle_z = 0;
            },
        });
    }

    _onDestroy() {
        this._secondHand.remove_all_transitions();
        this._minuteHand.remove_all_transitions();
        this._hourHand.remove_all_transitions();
        this._clockFace = null;
        this._hourHand = null;
        this._minuteHand = null;
        this._secondHand = null;
        this._clockButton = null;
        this._timeZoneCache = null;

        this._settings.disconnectObject(this);
        this._settings = null;
        this._extension = null;
    }
});
