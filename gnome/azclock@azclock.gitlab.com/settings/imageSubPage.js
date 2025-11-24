import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import {SubPage} from './subPage.js';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export const ImageSubPage = GObject.registerClass(
class AzClockImageSubPage extends SubPage {
    _init(params) {
        super._init(params);

        const generalGroup = new Adw.PreferencesGroup({
            title: _('Image Settings'),
        });
        this.add(generalGroup);

        const fileFilter = new Gtk.FileFilter();
        fileFilter.add_pixbuf_formats();

        const fileChooserButton = new Gtk.Button({
            label: _('Browse Files...'),
            valign: Gtk.Align.CENTER,
        });
        fileChooserButton.connect('clicked', () => {
            const dialog = new Gtk.FileChooserDialog({
                title: _('Select an Image File'),
                transient_for: this.get_root(),
                modal: true,
                action: Gtk.FileChooserAction.OPEN,
                filter: fileFilter,
            });

            dialog.add_button(_('Cancel'), Gtk.ResponseType.CANCEL);
            dialog.add_button(_('Select'), Gtk.ResponseType.ACCEPT);

            dialog.connect('response', (_self, response) => {
                if (response === Gtk.ResponseType.ACCEPT) {
                    const path = dialog.get_file().get_path();
                    imageRow.subtitle = path;
                    this.settings.set_string('image-path', path);
                }

                dialog.destroy();
            });
            dialog.show();
        });
        const imageRow = new Adw.ActionRow({
            title: _('Image'),
            subtitle: this.settings.get_string('image-path'),
            activatable_widget: fileChooserButton,
        });
        imageRow.add_suffix(fileChooserButton);
        generalGroup.add(imageRow);

        const [urlEnabled, url] = this.settings.get_value('image-url').deepUnpack();
        const urlExpanderRow = new Adw.ExpanderRow({
            title: _('Image URL'),
            subtitle: _('Download an image from a URL. Overrides selected image file.'),
            show_enable_switch: true,
            expanded: urlEnabled,
            enable_expansion: urlEnabled,
        });
        generalGroup.add(urlExpanderRow);
        urlExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue('image-url', '(bs)', widget.enable_expansion, 0);
        });

        const urlTextRow = new Adw.ActionRow({
            activatable: false,
            selectable: false,
        });
        urlExpanderRow.add_row(urlTextRow);

        const urlApplyButton = new Gtk.Button({
            halign: Gtk.Align.END,
            icon_name: 'dialog-apply-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
            sensitive: false,
            tooltip_text: _('Apply'),
        });
        urlApplyButton.connect('clicked', () => {
            this._setVariantValue('image-url', '(bs)', urlEntry.get_text(), 1);
            urlApplyButton.sensitive = false;
        });

        const urlEntry = new Gtk.Entry({
            halign: Gtk.Align.FILL,
            hexpand: true,
            text: url || '',
        });
        urlEntry.connect('changed', () => {
            urlApplyButton.sensitive = true;
        });
        urlEntry.connect('activate', widget => {
            this._setVariantValue('image-url', '(bs)', widget.get_text(), 1);
            urlApplyButton.sensitive = false;
        });

        const urlEntryBox = new Gtk.Box({
            halign: Gtk.Align.FILL,
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['linked'],
        });
        urlEntryBox.append(urlEntry);
        urlEntryBox.append(urlApplyButton);
        urlTextRow.set_child(urlEntryBox);

        const [updateEnabled, updateInterval] = this.settings.get_value('image-update-interval').deepUnpack();
        const updateIntervalExpanderRow = new Adw.ExpanderRow({
            title: _('Update Image on Interval'),
            show_enable_switch: true,
            expanded: updateEnabled,
            enable_expansion: updateEnabled,
        });
        generalGroup.add(updateIntervalExpanderRow);
        updateIntervalExpanderRow.connect('notify::enable-expansion', widget => {
            this._setVariantValue('image-update-interval', '(bi)', widget.enable_expansion, 0);
        });

        const updateIntervalButton = this.createSpinButton(updateInterval, 5, 10000, 0, 15);
        updateIntervalButton.connect('value-changed', widget => {
            this._setVariantValue('image-update-interval', '(bi)', widget.get_value(), 1);
        });
        const updateIntervalRow = new Adw.ActionRow({
            title: _('Update Interval (seconds))'),
            activatable_widget: updateIntervalButton,
        });
        updateIntervalRow.add_suffix(updateIntervalButton);
        updateIntervalExpanderRow.add_row(updateIntervalRow);

        const imageSizeButton = this.createSpinButton(this.settings.get_int('image-size'), 20, 2000, 0, 15);
        imageSizeButton.connect('value-changed', widget => {
            this.settings.set_int('image-size', widget.get_value());
        });

        const imageSizeRow = new Adw.ActionRow({
            title: _('Image Size'),
            activatable_widget: imageSizeButton,
        });
        imageSizeRow.add_suffix(imageSizeButton);
        generalGroup.add(imageSizeRow);
    }
});
