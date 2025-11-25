import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {SubPage} from './subPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const WidgetSubPage = GObject.registerClass(
class AzClockWidgetClockSubPage extends SubPage {
    _init(params) {
        super._init(params);

        const generalGroup = new Adw.PreferencesGroup();
        this.add(generalGroup);

        const locationRow = new Adw.ExpanderRow({
            title: _('Widget Location'),
        });
        generalGroup.add(locationRow);

        const locationData = JSON.parse(this.settings.get_string('location-data'));

        const display = Gdk.Display.get_default();
        const numMonitors = display.get_monitors().get_n_items();

        const monitorIndexButton = this.createSpinButton(locationData.monitorIndex, 0, numMonitors - 1);
        monitorIndexButton.connect('value-changed', widget => {
            const locationData1 = JSON.parse(this.settings.get_string('location-data'));
            locationData1.monitorIndex = widget.get_value();
            this.settings.set_string('location-data', JSON.stringify(locationData1));
        });
        const monitorIndexRow = new Adw.ActionRow({
            title: _('Monitor Index'),
            activatable_widget: monitorIndexButton,
        });
        monitorIndexRow.add_suffix(monitorIndexButton);
        locationRow.add_row(monitorIndexRow);

        const xLocationButton = this.createSpinButton(locationData.relativeX * 100, -10, 100, 1);
        xLocationButton.connect('value-changed', widget => {
            const locationData1 = JSON.parse(this.settings.get_string('location-data'));
            locationData1.relativeX = widget.get_value() / 100;
            this.settings.set_string('location-data', JSON.stringify(locationData1));
        });
        const xLocationRow = new Adw.ActionRow({
            title: _('X Position'),
            subtitle: _('The X position as a percentage of the screen width.\n0% = left, 100% = right.'),
            activatable_widget: xLocationButton,
        });
        xLocationRow.add_suffix(xLocationButton);
        locationRow.add_row(xLocationRow);

        const yLocationButton = this.createSpinButton(locationData.relativeY * 100, -10, 100, 1);
        yLocationButton.connect('value-changed', widget => {
            const locationData1 = JSON.parse(this.settings.get_string('location-data'));
            locationData1.relativeY = widget.get_value() / 100;
            this.settings.set_string('location-data', JSON.stringify(locationData1));
        });
        const yLocationRow = new Adw.ActionRow({
            title: _('Y Position'),
            subtitle: _('The Y position as a percentage of the screen height.\n0% = top, 100% = bottom.'),
            activatable_widget: yLocationButton,
        });
        yLocationRow.add_suffix(yLocationButton);
        locationRow.add_row(yLocationRow);

        const anchorPoint = this.settings.get_enum('anchor-point');
        const anchorPointList = new Gtk.StringList();
        anchorPointList.append(_('Top Left'));
        anchorPointList.append(_('Bottom Left'));
        anchorPointList.append(_('Top Right'));
        anchorPointList.append(_('Bottom Right'));
        anchorPointList.append(_('Center'));
        anchorPointList.append(_('Center Top'));
        anchorPointList.append(_('Center Bottom'));
        anchorPointList.append(_('Center Left'));
        anchorPointList.append(_('Center Right'));
        const anchorPointRow = new Adw.ComboRow({
            title: _('Anchor Point'),
            model: anchorPointList,
            selected: anchorPoint,
        });
        anchorPointRow.connect('notify::selected', widget => {
            this.settings.set_enum('anchor-point', widget.selected);
        });
        generalGroup.add(anchorPointRow);

        const spacingButton = this.createSpinButton(this.settings.get_int('spacing'), 0, 500);
        spacingButton.connect('value-changed', widget => {
            this.settings.set_int('spacing', widget.get_value());
        });
        const spacingRow = new Adw.ActionRow({
            title: _('Spacing'),
            activatable_widget: spacingButton,
        });
        spacingRow.add_suffix(spacingButton);
        generalGroup.add(spacingRow);

        const paddingExpanderRow = this.createPaddingMarginsExpander('padding', _('Padding'));
        generalGroup.add(paddingExpanderRow);

        const verticalLayoutSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.settings.get_boolean('vertical'),
        });
        verticalLayoutSwitch.connect('notify::active', widget => {
            this.settings.set_boolean('vertical', widget.get_active());
        });
        const verticalLayoutRow = new Adw.ActionRow({
            title: _('Vertical Layout'),
            activatable_widget: verticalLayoutSwitch,
        });
        verticalLayoutRow.add_suffix(verticalLayoutSwitch);
        generalGroup.add(verticalLayoutRow);

        const borderOptionsRow = new Adw.ExpanderRow({
            title: _('Enable Border'),
            show_enable_switch: true,
            enable_expansion: this.settings.get_boolean('show-border'),
        });
        generalGroup.add(borderOptionsRow);
        borderOptionsRow.connect('notify::enable-expansion', widget => {
            this.settings.set_boolean('show-border', widget.enable_expansion);
        });

        const borderWidthButton = this.createSpinButton(this.settings.get_int('border-width'), 0, 15);
        borderWidthButton.connect('value-changed', widget => {
            this.settings.set_int('border-width', widget.get_value());
        });
        const borderWidthRow = new Adw.ActionRow({
            title: _('Border Width'),
            activatable_widget: borderWidthButton,
        });
        borderWidthRow.add_suffix(borderWidthButton);
        borderOptionsRow.add_row(borderWidthRow);

        const borderColorButton = this.createColorButton(this.settings.get_string('border-color'));
        borderColorButton.connect('color-set', widget => {
            this.settings.set_string('border-color', widget.get_rgba().to_string());
        });
        const borderColorRow = new Adw.ActionRow({
            title: _('Border Color'),
            activatable_widget: borderColorButton,
        });
        borderColorRow.add_suffix(borderColorButton);
        borderOptionsRow.add_row(borderColorRow);

        const backgroundRow = new Adw.ExpanderRow({
            title: _('Enable Background'),
            show_enable_switch: true,
            enable_expansion: this.settings.get_boolean('show-background'),
        });
        backgroundRow.connect('notify::enable-expansion', widget => {
            this.settings.set_boolean('show-background', widget.enable_expansion);
        });
        generalGroup.add(backgroundRow);

        const backgroundColorButton = this.createColorButton(this.settings.get_string('background-color'));
        backgroundColorButton.connect('color-set', widget => {
            this.settings.set_string('background-color', widget.get_rgba().to_string());
        });
        const backgroundColorRow = new Adw.ActionRow({
            title: _('Background Color'),
            activatable_widget: backgroundColorButton,
        });
        backgroundColorRow.add_suffix(backgroundColorButton);
        backgroundRow.add_row(backgroundColorRow);

        const backgroundRadiusButton = this.createSpinButton(this.settings.get_int('border-radius'), 0, 999);
        backgroundRadiusButton.connect('value-changed', widget => {
            this.settings.set_int('border-radius', widget.get_value());
        });
        const backgroundRadiusRow = new Adw.ActionRow({
            title: _('Background Radius'),
            activatable_widget: backgroundRadiusButton,
        });
        backgroundRadiusRow.add_suffix(backgroundRadiusButton);
        backgroundRow.add_row(backgroundRadiusRow);
    }
});
