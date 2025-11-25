import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Mtk from 'gi://Mtk';
import St from 'gi://St';

import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Utils from './utils.js';

import {AnalogClock} from './elements/analogClock.js';
import {CommandLabel} from './elements/commandLabel.js';
import {DigitalClock} from './elements/digitalClock.js';
import {ImageElement} from './elements/image.js';
import {TextLabel} from './elements/textLabel.js';
import {WeatherElement} from './elements/weather.js';

import {UpdateNotification} from './updateNotifier.js';

const DEBUG_LOG = false;

const ElementType = {
    DIGITAL_CLOCK: 0,
    ANALOG_CLOCK: 1,
    TEXT_LABEL: 2,
    COMMAND_LABEL: 3,
    WEATHER_ELEMENT: 4,
    IMAGE_ELEMENT: 5,
};

let SETTINGS, EXTENSION;

const AnchorPoint = {
    TOP_LEFT: 0,
    BOTTOM_LEFT: 1,
    TOP_RIGHT: 2,
    BOTTOM_RIGHT: 3,
    CENTER: 4,
    CENTER_TOP: 5,
    CENTER_BOTTOM: 6,
    CENTER_LEFT: 7,
    CENTER_RIGHT: 8,
};

function debugLog(msg) {
    if (DEBUG_LOG)
        console.log(msg);
}

var DesktopWidget = GObject.registerClass(
class AzClockDesktopWidget extends St.Widget {
    _init(settings, settingsId) {
        super._init({
            layout_manager: new Clutter.BoxLayout(),
            reactive: true,
            track_hover: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            pivot_point: new Graphene.Point({x: 0.5, y: .5}),
        });
        this._settings = settings;
        this._settingsId = settingsId;

        this._setParent();
        this._convertOldLocationSetting();

        this._elements = new Map();
        this._oldElementIds = [];
        this._hasWeatherElement = false;

        const isVertical = this._settings.get_boolean('vertical');
        this.layout_manager.orientation = isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        this._menuManager = new PopupMenu.PopupMenuManager(this);

        this.connect('notify::hover', () => this._onHover());
        this.connect('destroy', () => this._onDestroy());

        this._settings.connectObject('changed', () => {
            this._setParent();
            this._updateDnD();
            this.createElements();
            this.setStyle();
            this.setPositionFromSettings();
        }, this);

        Main.layoutManager.connectObject('monitors-changed', () => this.setPositionFromSettings(), this);

        this.makeDraggable();
        this._updateDnD();

        this._createPopUpMenu();

        this.createElements();
        this.setStyle();
        this.setPositionFromSettings();
        this.updateClocks(true);
    }

    _updateDnD() {
        // If the widget is locked, block draggable _grabActor()
        if (!this._settings.get_boolean('lock-widget')) {
            this._draggable._grabActor = this._dragGrabActor;
            this._draggable._grabEvents = this._dragGrabEvents;
        } else {
            this._draggable._grabEvents = () => {
                this._draggable._grab = null;
            };
            this._draggable._grabActor = () => {};
        }
    }

    _setParent() {
        const parent = this.get_parent();
        if (parent === Main.layoutManager.uiGroup)
            Main.layoutManager.removeChrome(this);
        else if (parent === Main.layoutManager._backgroundGroup)
            Main.layoutManager._backgroundGroup.remove_child(this);

        const alwaysOnTop = this._settings.get_boolean('always-on-top');
        if (alwaysOnTop)
            Main.layoutManager.addTopChrome(this);
        else
            Main.layoutManager._backgroundGroup.add_child(this);
    }

    vfunc_allocate(box) {
        if (this._isDragging) {
            super.vfunc_allocate(box);
            return;
        }

        const {x, y} = this._getPosition();
        box.set_origin(x, y);

        super.vfunc_allocate(box);
    }

    createElements() {
        this.remove_all_children();
        this._hasWeatherElement = false;

        const elementIds = [];
        const elements = this._settings.get_value('elements').recursiveUnpack();
        elements.forEach(element => {
            for (const [elementId, properties] of Object.entries(element)) {
                if (properties.enabled)
                    elementIds.push(elementId);
            }
        });

        const deletedElement = this._oldElementIds.filter(x => !elementIds.includes(x));

        for (let i = 0; i < deletedElement.length; i++) {
            const elementId = deletedElement[i];
            const element = this._elements.get(elementId);
            if (element) {
                element.destroy();
                this._elements.delete(elementId);
            }
        }

        for (let i = 0; i < elementIds.length; i++) {
            const elementId = elementIds[i];
            const elementSchema = `${SETTINGS.schema_id}.element-data`;
            const elementPath = `${this._settings.path}element-data/${elementId}/`;
            const elementSettings = Utils.getSettings(EXTENSION, elementSchema, elementPath);

            let element = this._elements.get(elementId);
            if (!element) {
                const elementType = elementSettings.get_enum('element-type');
                let elementConstructor;
                if (elementType === ElementType.DIGITAL_CLOCK)
                    elementConstructor = DigitalClock;
                else if (elementType === ElementType.ANALOG_CLOCK)
                    elementConstructor = AnalogClock;
                else if (elementType === ElementType.TEXT_LABEL)
                    elementConstructor = TextLabel;
                else if (elementType === ElementType.COMMAND_LABEL)
                    elementConstructor = CommandLabel;
                else if (elementType === ElementType.WEATHER_ELEMENT)
                    elementConstructor = WeatherElement;
                else if (elementType === ElementType.IMAGE_ELEMENT)
                    elementConstructor = ImageElement;

                element = new elementConstructor(elementSettings, EXTENSION);
                this._elements.set(elementId, element);
            }
            this.add_child(element);

            if (element instanceof WeatherElement)
                this._hasWeatherElement = true;
        }

        if (this._hasWeatherElement)
            this._addRefreshWeatherMenuItem();
        else
            this._removeRefreshWeatherMenuItem();

        this._oldElementIds = elementIds;
        this.queue_relayout();
    }

    updateClocks(immediate = false) {
        this._elements.forEach(element => {
            if (element instanceof DigitalClock || element instanceof AnalogClock)
                element.updateClock(immediate);
        });
    }

    _convertOldLocationSetting() {
        const data = this._settings.get_value('location').deepUnpack();
        const needsConvert = !this._settings.get_boolean('convert-old-location-done');

        if (!data.length || !needsConvert)
            return;

        const [x, y] = data;
        this._saveLocationData(x, y);

        this._settings.set_boolean('convert-old-location-done', true);
    }

    _saveLocationData(x, y) {
        const [width, height] = this.get_size();
        const rect = new Mtk.Rectangle({x, y, width, height});
        const monitorIndex = global.display.get_monitor_index_for_rect(rect);
        const monitorGeometry = global.display.get_monitor_geometry(monitorIndex);

        // Store the location based on anchor point
        const [adjustedX, adjustedY] = this._adjustForAnchorPoint(x, y, 1);
        const relativeX = (adjustedX - monitorGeometry.x) / monitorGeometry.width;
        const relativeY = (adjustedY - monitorGeometry.y) / monitorGeometry.height;

        const locationData = {
            monitorIndex,
            relativeX,
            relativeY,
        };

        this._settings.set_string('location-data', JSON.stringify(locationData));
    }

    setPositionFromSettings() {
        const {x, y} = this._getPosition();

        this.set_position(x, y);
        this.queue_relayout();
    }

    _adjustForAnchorPoint(x, y, sign = -1) {
        const width = this.get_width();
        const height = this.get_height();

        const xAnchorRight = x + sign * width;
        const yAnchorBottom = y + sign * height;
        const xAnchorCenter = x + sign * (width / 2);
        const yAnchorCenter = y + sign * (height / 2);

        const anchorPoint = this._settings.get_enum('anchor-point');
        switch (anchorPoint) {
        case AnchorPoint.TOP_LEFT:
            return [x, y];
        case AnchorPoint.BOTTOM_LEFT:
            return [x, yAnchorBottom];
        case AnchorPoint.TOP_RIGHT:
            return [xAnchorRight, y];
        case AnchorPoint.BOTTOM_RIGHT:
            return [xAnchorRight, yAnchorBottom];
        case AnchorPoint.CENTER:
            return [xAnchorCenter, yAnchorCenter];
        case AnchorPoint.CENTER_TOP:
            return [xAnchorCenter, y];
        case AnchorPoint.CENTER_BOTTOM:
            return [xAnchorCenter, yAnchorBottom];
        case AnchorPoint.CENTER_LEFT:
            return [x, yAnchorCenter];
        case AnchorPoint.CENTER_RIGHT:
            return [xAnchorRight, yAnchorCenter];
        default:
            return [x, y];
        }
    }

    _getPosition() {
        const locationData = JSON.parse(this._settings.get_string('location-data'));
        const monitorIndex = locationData.monitorIndex;
        const monitor = Main.layoutManager.monitors[monitorIndex] || Main.layoutManager.primaryMonitor;

        if (!monitor) {
            console.log('AzClock Error: monitor null. Fallback to (0,0) widget position.');
            return {x: 0, y: 0};
        }

        // The raw (x, y) location of where the widget should be located.
        const rawX = monitor.x + locationData.relativeX * monitor.width;
        const rawY = monitor.y + locationData.relativeY * monitor.height;

        const [adjustedX, adjustedY] = this._adjustForAnchorPoint(rawX, rawY);

        return {x: adjustedX, y: adjustedY};
    }

    setStyle() {
        const isVertical = this._settings.get_boolean('vertical');
        this.layout_manager.orientation = isVertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL;

        const showBorder = this._settings.get_boolean('show-border');
        const borderColor = this._settings.get_string('border-color');
        const borderWidth = this._settings.get_int('border-width');
        const borderRadius = this._settings.get_int('border-radius');

        const showBackground = this._settings.get_boolean('show-background');
        const backgroundColor = this._settings.get_string('background-color');

        const spacing = this._settings.get_int('spacing');
        const [paddingTop, paddingRight, paddingBottom, paddingLeft] = this._settings.get_value('padding').deepUnpack();

        this.layoutManager.spacing = spacing;

        let style = `padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`;

        if (showBackground) {
            style += `background-color: ${backgroundColor};
                      border-radius: ${borderRadius}px;`;
        }

        if (showBorder) {
            style += `border-width: ${borderWidth}px;
                      border-color: ${borderColor};`;
        }

        this.style = style;

        this.queue_relayout();
    }

    vfunc_button_press_event() {
        const event = Clutter.get_current_event();

        if (event.get_button() === 1) {
            this._setPopupTimeout();
        } else if (event.get_button() === 3) {
            this._popupMenu();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event() {
        this._removeMenuTimeout();
        return Clutter.EVENT_PROPAGATE;
    }

    _onDragBegin() {
        if (this._menu)
            this._menu.close(true);
        this._removeMenuTimeout();

        this._isDragging = true;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);

        this._dragX = this.x;
        this._dragY = this.y;
    }

    _onDragMotion(dragEvent) {
        this.deltaX = dragEvent.x - (dragEvent.x - this._dragX);
        this.deltaY = dragEvent.y - (dragEvent.y - this._dragY);

        const [x, y] = this.allocation.get_origin();
        this._dragX = x;
        this._dragY = y;

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragEnd() {
        this._isDragging = false;
        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        const [x, y] = [Math.round(this.deltaX), Math.round(this.deltaY)];

        this._saveLocationData(x, y);
        debugLog(`drag end - (${x}, ${y})`);
    }

    getDragActorSource() {
        return this;
    }

    makeDraggable() {
        this._draggable = DND.makeDraggable(this);
        this._draggable._dragActorDropped = () => {
            this._draggable._animationInProgress = true;
            this._draggable._dragCancellable = false;
            this._draggable._dragState = 0; // DND.DragState.INIT;
            this._draggable._onAnimationComplete(this._draggable._dragActor, Clutter.get_current_event().get_time());
            return true;
        };

        this._dragGrabActor = this._draggable._grabActor;
        this._dragGrabEvents = this._draggable._grabEvents;

        this.dragBeginId = this._draggable.connect('drag-begin', this._onDragBegin.bind(this));
        this.dragEndId = this._draggable.connect('drag-end', this._onDragEnd.bind(this));
    }

    _onHover() {
        if (!this.hover)
            this._removeMenuTimeout();
    }

    _removeMenuTimeout() {
        if (this._menuTimeoutId > 0) {
            GLib.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    }

    _setPopupTimeout() {
        this._removeMenuTimeout();
        this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => {
            this._menuTimeoutId = 0;
            this._popupMenu();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[azclock] this.popupMenu');
    }

    _popupMenu() {
        this._removeMenuTimeout();

        this._menu.open();
        return false;
    }

    _createPopUpMenu() {
        this._menu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);

        const lockWidget = this._settings.get_boolean('lock-widget');
        const lockPositionSwitch = new PopupMenu.PopupSwitchMenuItem(_('Lock Position'), lockWidget);
        this._menu.addMenuItem(lockPositionSwitch);
        lockPositionSwitch.connect('toggled', item => {
            this._menu.close();
            this._settings.set_boolean('lock-widget', item.state);
        });

        const alwaysOnTop = this._settings.get_boolean('always-on-top');
        const alwaysOnTopSwitch = new PopupMenu.PopupSwitchMenuItem(_('Always on Top'), alwaysOnTop);
        this._menu.addMenuItem(alwaysOnTopSwitch);
        alwaysOnTopSwitch.connect('toggled', item => {
            this._menu.close();
            this._settings.set_boolean('always-on-top', item.state);
        });

        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._menu.addAction(_('Desktop Widgets Settings'), () => {
            EXTENSION.openPreferences();
        });

        Main.uiGroup.add_child(this._menu.actor);
        this._menuManager.addMenu(this._menu);
        this._menu.actor.hide();
    }

    _addRefreshWeatherMenuItem() {
        if (this._refreshWeatherMenuItem)
            return;

        this._refreshWeatherMenuItem = new PopupMenu.PopupMenuItem(_('Refresh Weather'));
        this._refreshWeatherMenuItem.connect('activate', () => {
            this._elements.forEach(element => {
                if (element instanceof WeatherElement)
                    element.refreshWeather();
            });
            this._menu.close();
        });
        this._menu.addMenuItem(this._refreshWeatherMenuItem, 2);
    }

    _removeRefreshWeatherMenuItem() {
        if (!this._refreshWeatherMenuItem)
            return;

        this._refreshWeatherMenuItem.destroy();
        this._refreshWeatherMenuItem = null;
    }

    _disconnectDnD() {
        if (this._draggable && this.dragBeginId) {
            this._draggable.disconnect(this.dragBeginId);
            this.dragBeginId = null;
        }

        if (this._draggable && this.dragEndId) {
            this._draggable.disconnect(this.dragEndId);
            this.dragEndId = null;
        }

        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        this._draggable = null;
    }

    _onDestroy() {
        this._removeMenuTimeout();

        if (this._updateClockId) {
            GLib.source_remove(this._updateClockId);
            this._updateClockId = null;
        }

        this._removeRefreshWeatherMenuItem();

        this._disconnectDnD();
        this._settings.disconnectObject(this);
        this._settings = null;
        this._settingsId = null;
        this._elements = null;
        this._oldElementIds = null;
        this._hasWeatherElement = false;
        this._menu.destroy();
        this._menu = null;
        this._menuManager = null;
    }
});

export default class AzClock extends Extension {
    enable() {
        EXTENSION = this;
        this.settings = SETTINGS = this.getSettings();

        Utils.createInitialWidget(EXTENSION, SETTINGS);

        this.widgets = new Map();
        this._oldWidgetIds = [];

        if (!Main.layoutManager._startingUp)
            this._enable();
        else
            Main.layoutManager.connectObject('startup-complete', () => this._enable(), this);

        this._updateNotification = new UpdateNotification(this);
    }

    _enable() {
        this._createWidgets();
        SETTINGS.connectObject('changed::widgets', () => this._createWidgets(), this);
    }

    disable() {
        SETTINGS.disconnectObject(this);
        Main.layoutManager.disconnectObject(this);

        if (this._dataChangedTimeoutId) {
            GLib.source_remove(this._dataChangedTimeoutId);
            this._dataChangedTimeoutId = null;
        }

        this._updateNotification.destroy();
        this._updateNotification = null;

        this._removeTimers();
        this._destroyWidgets();
        this._oldWidgetIds = null;

        SETTINGS.disconnectObject(this);
        EXTENSION = null;
        SETTINGS = null;
        this.settings = null;
    }

    _syncClockTimerToNearestSecond() {
        const now = new Date();
        const milliseconds = now.getMilliseconds();

        // JS Date.getMilliseconds() returns range 0 - 999.
        // If Date.getMilliseconds() returns 0, startClockTimer() immediately.
        if (milliseconds === 0) {
            this._startClockTimer();
            return;
        }

        // Sync the startClockTimer() to the next full second.
        const delay = 1000 - milliseconds;
        this._syncClockTimerId = GLib.timeout_add(GLib.PRIORITY_HIGH, delay, () => {
            this.widgets.forEach(widget => {
                widget.updateClocks();
            });

            this._startClockTimer();
            this._syncClockTimerId = 0;
            return GLib.SOURCE_REMOVE;
        });
    }

    _startClockTimer() {
        this._updateClockId = GLib.timeout_add(GLib.PRIORITY_HIGH, 1000, () => {
            this.widgets.forEach(widget => {
                widget.updateClocks();
            });

            return GLib.SOURCE_CONTINUE;
        });
    }

    _removeTimers() {
        if (this._syncClockTimerId) {
            GLib.source_remove(this._syncClockTimerId);
            this._syncClockTimerId = null;
        }
        if (this._updateClockId) {
            GLib.source_remove(this._updateClockId);
            this._updateClockId = null;
        }
    }

    _destroyWidgets() {
        this.widgets.forEach(widget => {
            widget.destroy();
        });

        this.widgets = null;
    }

    _createWidget(widgetId) {
        const widgetSchema = `${SETTINGS.schema_id}.widget-data`;
        const widgetPath = `${SETTINGS.path}widget-data/${widgetId}/`;
        const widgetSettings = Utils.getSettings(EXTENSION, widgetSchema, widgetPath);

        const widget = new DesktopWidget(widgetSettings, widgetId);
        return widget;
    }

    _createWidgets() {
        this._removeTimers();

        const widgetIds = [];
        const widgets = SETTINGS.get_value('widgets').recursiveUnpack();
        widgets.forEach(widget => {
            for (const [widgetId, properties] of Object.entries(widget)) {
                if (properties.enabled)
                    widgetIds.push(widgetId);
            }
        });

        const deletedWidgets = this._oldWidgetIds.filter(x => !widgetIds.includes(x));

        for (let i = 0; i < deletedWidgets.length; i++) {
            const widgetId = deletedWidgets[i];
            const widget = this.widgets.get(widgetId);
            if (widget) {
                widget.destroy();
                this.widgets.delete(widgetId);
            }
        }

        for (let i = 0; i < widgetIds.length; i++) {
            const widgetId = widgetIds[i];
            let widget = this.widgets.get(widgetId);
            if (!widget) {
                widget = this._createWidget(widgetId);
                this.widgets.set(widgetId, widget);
            }
            widget.z_position = widgetIds.length - i;
        }

        this._oldWidgetIds = widgetIds;

        this._syncClockTimerToNearestSecond();
    }

    openPreferences() {
        // Find if an extension preferences window is already open
        const prefsWindow = global.get_window_actors().map(wa => wa.meta_window).find(w => w.wm_class === 'org.gnome.Shell.Extensions');

        if (!prefsWindow) {
            super.openPreferences();
            return;
        }

        // The current prefsWindow belongs to this extension, activate it
        if (prefsWindow.title === this.metadata.name) {
            Main.activateWindow(prefsWindow);
            return;
        }

        // If another extension's preferences are open, close it and open this extension's preferences
        prefsWindow.connectObject('unmanaged', () => {
            super.openPreferences();
            prefsWindow.disconnectObject(this);
        }, this);
        prefsWindow.delete(global.get_current_time());
    }
}
