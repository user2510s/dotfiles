import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {LabelSubPage} from './labelSubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const CommandLabelSubPage = GObject.registerClass(
class AzClockCommandLabelSubPage extends LabelSubPage {
    _init(params) {
        super._init(params);

        const commandExpanderRow = new Adw.ExpanderRow({
            title: _('Command'),
            expanded: true,
            enable_expansion: true,
        });
        this._customGroup.add(commandExpanderRow);

        const commandEntry = this._createTextEntry('command');
        const commandRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });
        commandRow.set_child(commandEntry);
        commandExpanderRow.add_row(commandRow);

        const hideOnErrorSwitch = new Gtk.Switch({
            valign: Gtk.Align.CENTER,
            active: this.settings.get_boolean('hide-on-error'),
        });
        const hideOnErrorRow = new Adw.ActionRow({
            title: _('Hide Element on Error'),
            activatable_widget: hideOnErrorSwitch,
        });
        hideOnErrorSwitch.connect('notify::active', widget => {
            this.settings.set_boolean('hide-on-error', widget.get_active());
        });
        hideOnErrorRow.add_suffix(hideOnErrorSwitch);
        this._customGroup.add(hideOnErrorRow);

        const pollingIntervalButton = this.createSpinButton(this.settings.get_int('polling-interval'), 250, 2000000);
        pollingIntervalButton.connect('value-changed', widget => {
            this.settings.set_int('polling-interval', widget.get_value());
        });
        const pollingIntervalRow = new Adw.ActionRow({
            title: _('Polling Interval (ms)'),
            activatable_widget: pollingIntervalButton,
        });
        pollingIntervalRow.add_suffix(pollingIntervalButton);
        this._customGroup.add(pollingIntervalRow);
    }
});
