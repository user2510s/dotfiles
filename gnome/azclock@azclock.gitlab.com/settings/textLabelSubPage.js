import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {LabelSubPage} from './labelSubPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const TextLabelSubPage = GObject.registerClass(
class AzClockTextLabelSubPage extends LabelSubPage {
    _init(params) {
        super._init(params);

        const textExpanderRow = new Adw.ExpanderRow({
            title: _('Text'),
            expanded: true,
            enable_expansion: true,
        });
        this._customGroup.add(textExpanderRow);

        const textRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });
        textExpanderRow.add_row(textRow);

        const textEntry = this._createTextEntry('text');
        textRow.set_child(textEntry);
    }
});
