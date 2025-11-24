import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Rsvg from 'gi://Rsvg';
import Soup from 'gi://Soup';
import St from 'gi://St';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const [ShellVersion] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));
const TempImageFileName = 'XXXXXX-Desktop-Widgets-Downloaded-Image';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');

/**
 *
 * @param {GdkPixbuf} pixbuf
 * @returns {St.ImageContent | null} St.ImageContent or null on fail
 */
function getImageContentFromPixbuf(pixbuf) {
    try {
        const hasAlpha = pixbuf.get_has_alpha();
        const pixels = pixbuf.read_pixel_bytes();
        const content = St.ImageContent.new_with_preferred_size(pixbuf.get_width(), pixbuf.get_height());

        if (ShellVersion >= 48) {
            const coglContext = global.stage.context.get_backend().get_cogl_context();
            content.set_bytes(
                coglContext,
                pixels,
                hasAlpha ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
                pixbuf.get_width(),
                pixbuf.get_height(),
                pixbuf.get_rowstride()
            );
        } else {
            content.set_bytes(
                pixels,
                hasAlpha ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
                pixbuf.get_width(),
                pixbuf.get_height(),
                pixbuf.get_rowstride()
            );
        }

        return content;
    } catch {
        return null;
    }
}

export const ImageElement = GObject.registerClass(
class AzClockImageElement extends Clutter.Actor {
    _init(settings, extension) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });

        this._settings = settings;
        this._extension = extension;

        const SESSION_TYPE = GLib.getenv('XDG_SESSION_TYPE');
        const PACKAGE_VERSION = Config.PACKAGE_VERSION;
        const USER_AGENT = `User-Agent: Mozilla/5.0 (${SESSION_TYPE}; GNOME Shell/${PACKAGE_VERSION}; Linux ${GLib.getenv('CPU')};) AzClock/${this._extension.metadata.version}`;
        this._session = new Soup.Session({user_agent: USER_AGENT, timeout: 60});

        this._tempImageFile = null;

        this._image = new St.Icon({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        if (this.add_actor)
            this.add_actor(this._image);
        else
            this.add_child(this._image);

        this._settings.connectObject('changed', () => this._updateImage(), this);

        this.connect('destroy', () => this._onDestroy());
        this.connect('notify::mapped', () => this._onCreated());
    }

    _onCreated() {
        if (this._isCreated)
            return;

        this._isCreated = true;
        this._updateImage().catch(e => console.log(e));
    }

    _startUpdateInterval(interval) {
        this._updateIntervalId = GLib.timeout_add_seconds(GLib.PRIORITY_NORMAL, interval, () => {
            this._updateImage(false);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _removeUpdateInterval() {
        if (this._updateIntervalId) {
            GLib.source_remove(this._updateIntervalId);
            this._updateIntervalId = null;
        }
    }

    async _updateImage(removeUpdateInterval = true) {
        if (!this.mapped)
            return;

        this._session.abort();

        if (removeUpdateInterval)
            this._removeUpdateInterval();

        const [urlEnabled, url] = this._settings.get_value('image-url').deepUnpack();
        const [updateEnabled, updateInterval] = this._settings.get_value('image-update-interval').deepUnpack();

        this._size = this._settings.get_int('image-size');

        let pixbuf = null;
        if (urlEnabled) {
            pixbuf = await this._getPixbufFromUrl(url);
        } else {
            const filePath = this._settings.get_string('image-path');
            pixbuf = await this._getPixbufFromFile(filePath);
        }

        let gicon = null;
        if (pixbuf)
            gicon = getImageContentFromPixbuf(pixbuf);

        // Fallback to image-missing gicon if gicon is null.
        if (!gicon)
            gicon = Gio.icon_new_for_string('image-missing');

        const imageWidth = gicon?.preferred_width ?? this._size;
        const imageHeight = gicon?.preferred_height ?? this._size;

        const ratio = Math.min(this._size / imageWidth, this._size / imageHeight);

        const width = Math.round(imageWidth * ratio);
        const height = Math.round(imageHeight * ratio);

        this._image.set({
            width,
            height,
            gicon,
            icon_size: this._size,
        });

        if (updateEnabled && !this._updateIntervalId)
            this._startUpdateInterval(updateInterval);
    }

    async _getPixbufFromFile(filePath) {
        const file = Gio.File.new_for_path(filePath);
        if (!file.query_exists(null)) {
            console.log(`AzClock: Image file does not exist - ${filePath}`);
            return null;
        }

        try {
            const info = await file.query_info_async('standard::content-type', Gio.FileQueryInfoFlags.NONE, 0, null);
            const contentType = info.get_content_type();
            if (contentType.startsWith('image/svg')) {
                const handle = Rsvg.Handle.new_from_gfile_sync(file, Rsvg.HandleFlags.FLAGS_NONE, null);
                const dimensions = handle.get_dimensions();
                const ratio = Math.min(this._size / dimensions.width, this._size / dimensions.height);
                const width = Math.round(dimensions.width * ratio);
                const height = Math.round(dimensions.height * ratio);

                return Rsvg.pixbuf_from_file_at_size(filePath, width, height);
            }

            return GdkPixbuf.Pixbuf.new_from_file(filePath);
        } catch (e) {
            console.error(`AzClock: Error processing ${file.get_basename()} - ${e}`);
            return null;
        }
    }

    async _getPixbufFromUrl(url) {
        const message = Soup.Message.new('GET', url);

        let data;
        try {
            const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);

            if (message.statusCode === Soup.Status.OK) {
                data = bytes.get_data();

                let contentType = message.response_headers.get_content_type();
                if (!contentType) {
                    // Fallback to guessing if no content type header
                    const [guessedType, uncertain] = Gio.content_type_guess(null, data);
                    contentType = guessedType;
                    if (uncertain)
                        console.log(`Content type guess for ${url} is uncertain: ${contentType}`);
                } else {
                    contentType = contentType[0];
                }

                if (!contentType.startsWith('image/'))
                    throw new Error(`URL is not an image! Content-Type: ${contentType}, URL: ${url}`);

                if (!this._tempImageFile) {
                    const [file] = Gio.File.new_tmp(TempImageFileName);
                    this._tempImageFile = file;
                }

                await this._tempImageFile.replace_contents_async(data, null, false, Gio.FileCreateFlags.NONE, null);

                return this._getPixbufFromFile(this._tempImageFile.get_path());
            } else {
                console.log(`AzClock: failed to download image - ${message.statusCode}`);
                return null;
            }
        } catch (e) {
            console.log(`AzClock: failed to download image - ${e}`);
            return null;
        }
    }

    _onDestroy() {
        this._removeUpdateInterval();
        this._session.abort();
        this._session = null;
        this._settings.disconnectObject(this);
        this._settings = null;

        if (this._tempImageFile) {
            this._tempImageFile.delete_async(GLib.PRIORITY_DEFAULT, null).then(() => {
                this._tempImageFile = null;
            });
        }

        this._extension = null;
    }
});
