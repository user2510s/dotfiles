import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import * as Utils from '../utils.js';

/**
 * Processes a string containing markup to retain valid Pango tags while escaping invalid or unsupported tags and other text.
 * Valid Pango tags (e.g., <b>, <i>, <u>, <span>) are preserved for text styling,
 * while other markup or special characters are escaped to ensure safe rendering with Pango.
 *
 * @param {string} text - The input string containing HTML-like markup to process.
 * @returns {string} A string with valid Pango tags preserved and invalid markup or special characters escaped.
 */

function fixMarkup(text) {
    const validPangoTags = ['b', 'i', 'u', 's', 'sub', 'sup', 'small', 'big', 'tt', 'span'];

    try {
        Pango.parse_markup(text, -1, '');
        return text;
    } catch {
        let result = '';
        const parts = text.split(/(<\/?[a-zA-Z]+(?:\s+[^>]*)?>)/g);

        for (const part of parts) {
            if (part.match(/^<\/?[a-zA-Z]+(?:\s+[^>]*)?>$/)) {
                const match = part.match(/^<\/?([a-zA-Z]+)/);
                if (match && validPangoTags.includes(match[1].toLowerCase()))
                    result += part;
                else
                    result += GLib.markup_escape_text(part, -1);
            } else {
                result += GLib.markup_escape_text(part, -1);
            }
        }

        try {
            Pango.parse_markup(result, -1, '');
            return result;
        } catch {
            return GLib.markup_escape_text(text, -1);
        }
    }
}

export const Label = GObject.registerClass(
class AzClockLabel extends St.Label {
    _init(settings, extension) {
        super._init({
            reactive: true,
            style_class: 'url-highlighter',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),

        });

        this._settings = settings;
        this._extension = extension;
        this._lastStyleHash = null;

        this._linkColor = '#ccccff';
        this.connect('style-changed', () => {
            const [hasColor, color] = this.get_theme_node().lookup_color('link-color', false);
            if (hasColor) {
                const linkColor = color.to_string().substring(0, 7);
                if (linkColor !== this._linkColor) {
                    this._linkColor = linkColor;
                    this._highlightUrls();
                }
            }
        });

        this.clutter_text.set({
            ellipsize: Pango.EllipsizeMode.NONE,
            use_markup: true,
        });

        this._settings.connectObject('changed', () => this.setStyle(), this);
        this.connect('notify::mapped', () => this.setStyle());

        this.connect('destroy', () => this._onDestroy());
    }

    /* Parses HTML anchor tags in text, replacing them with their title (or URL if title is empty) and collecting anchor metadata. */
    _parseAnchorTags(text, escaped = false) {
        const anchorRegexEscaped = /&lt;a\s+href=(?:&quot;([\s\S]*?)&quot;|&apos;([\s\S]*?)&apos;)\s*&gt;([\s\S]*?)&lt;\/a&gt;/gi;
        const anchorRegexLiteral = /<a\s+href=(?:"([\s\S]*?)"|'([\s\S]*?)')\s*>([\s\S]*?)<\/a>/gi;
        const anchorRegex = escaped ? anchorRegexEscaped : anchorRegexLiteral;
        const urls = [];
        let adjustText = '';
        let lastIndex = 0;

        let match;
        while ((match = anchorRegex.exec(text))) {
            const url = match[1] || match[2];
            let displayText = escaped ? match[3] : match[3];
            const tagStart = match.index;
            const tagLength = match[0].length;

            // If the HTML anchor tag is missing a title, set the displayText to the URL.
            const isTitleEmpty = !displayText.trim();
            if (isTitleEmpty)
                displayText = url;

            adjustText += text.substring(lastIndex, tagStart);
            adjustText += displayText;

            // If the display text is a valid URL, don't add it to urls.
            // It will be found later with Util.findUrls()
            const hasUrls = Util.findUrls(displayText).length > 0;
            if (!hasUrls) {
                urls.push({
                    url,
                    displayText,
                    pos: adjustText.length - displayText.length,
                    length: displayText.length,
                    isAnchor: true,
                });
            }
            lastIndex = tagStart + tagLength;
        }

        adjustText += text?.substring(lastIndex);

        return {urls, text: adjustText};
    }

    setMarkup(text) {
        text = text || '';
        text = fixMarkup(text);

        // Store the original markup text and clutter_text
        this._text = text;
        this.clutter_text.set_markup(text);
        this._clutterText = this.clutter_text.text;

        // Find the HTML anchor tags using clutter_text.text (without markup)
        const {urls: anchorUrls} = this._parseAnchorTags(this.clutter_text.text);

        // Regex out the HTML anchor tags from the markup text
        const {text: parsedText} = this._parseAnchorTags(text, true);
        text = fixMarkup(parsedText);
        this.clutter_text.set_markup(text);

        // Find any other URLs
        this._urls = Util.findUrls(this.clutter_text.text).map(url => ({
            ...url,
            url: url.url,
            displayText: url.url,
            length: url.url.length,
            isAnchor: false,
        }));
        this._urls = this._urls.concat(anchorUrls);
        this._urls.sort((a, b) => a.pos - b.pos);

        this._highlightUrls();
    }

    _highlightUrls() {
        let markup = '';
        let pos = 0;

        const {urls: anchorUrls, text: parsedText} = this._parseAnchorTags(this._text, true);
        const text = fixMarkup(parsedText);
        let urls = Util.findUrls(text).map(url => ({
            ...url,
            url: url.url,
            displayText: url.url,
            length: url.url.length,
            isAnchor: false,
        }));
        urls = urls.concat(anchorUrls);
        urls.sort((a, b) => a.pos - b.pos);

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const displayText = url.isAnchor ? url.displayText : url.url;
            const startPos = url.pos;
            const endPos = startPos + (url.isAnchor ? url.length : url.url.length);

            const beforeText = text.substring(pos, startPos);
            const escapedDisplayText = displayText;

            markup += beforeText;
            markup += `<span foreground="${this._linkColor}"><u>${escapedDisplayText}</u></span>`;
            pos = endPos;
        }

        markup += text.substring(pos);
        this.clutter_text.set_markup(markup);
    }

    _findUrlAtPos(event) {
        let [x, y] = event.get_coords();
        [, x, y] = this.transform_stage_point(x, y);
        let findPos = -1;

        for (let i = 0; i < this.clutter_text.text.length; i++) {
            const [, px, py, lineHeight] = this.clutter_text.position_to_coords(i);
            if (py > y || py + lineHeight < y || x < px)
                continue;
            findPos = i;
        }

        if (findPos !== -1) {
            for (let i = 0; i < this._urls.length; i++) {
                const url = this._urls[i];
                const urlLength = url.isAnchor ? url.length : url.url.length;
                if (findPos >= url.pos && url.pos + urlLength > findPos)
                    return i;
            }
        }

        return -1;
    }

    vfunc_button_press_event(event) {
        const button = event.get_button();
        const modifiers = event ? event.get_state() : 0;
        const isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;

        if (!this.visible || this.get_paint_opacity() === 0 || button !== 1 || !isCtrlPressed)
            return Clutter.EVENT_PROPAGATE;

        return this._findUrlAtPos(event) !== -1;
    }

    vfunc_button_release_event(event) {
        const button = event.get_button();
        const modifiers = event ? event.get_state() : 0;
        const isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (!this.visible || this.get_paint_opacity() === 0 || button !== 1 || !isCtrlPressed)
            return Clutter.EVENT_PROPAGATE;

        const urlId = this._findUrlAtPos(event);
        if (urlId !== -1) {
            let url = this._urls[urlId].url;
            if (!url.includes(':'))
                url = `http://${url}`;

            Gio.app_info_launch_default_for_uri(
                url, global.create_app_launch_context(0, -1));
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_motion_event(event) {
        if (!this.visible || this.get_paint_opacity() === 0)
            return Clutter.EVENT_PROPAGATE;

        const modifiers = event ? event.get_state() : 0;
        const isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) !== 0;

        const urlId = this._findUrlAtPos(event);
        if (urlId !== -1 && !this._cursorChanged && isCtrlPressed) {
            global.display.set_cursor(Meta.Cursor.POINTER ?? Meta.Cursor.POINTING_HAND);
            this._cursorChanged = true;
        } else if (urlId !== -1 && this._cursorChanged && !isCtrlPressed) {
            global.display.set_cursor(Meta.Cursor.DEFAULT);
            this._cursorChanged = false;
        } else if (urlId === -1) {
            global.display.set_cursor(Meta.Cursor.DEFAULT);
            this._cursorChanged = false;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    setStyle() {
        if (!this.mapped)
            return;

        const values = {
            shadow: this._settings.get_value('shadow').deepUnpack(),
            font: this._settings.get_value('font-family-override').deepUnpack(),
            color: this._settings.get_string('foreground-color'),
            size: this._settings.get_int('font-size'),
            alignX: this._settings.get_enum('text-align-x'),
            alignY: this._settings.get_enum('text-align-y'),
            lineAlign: this._settings.get_enum('line-alignment'),
            margin: this._settings.get_value('margin').deepUnpack(),
            padding: this._settings.get_value('padding').deepUnpack(),
            border: this._settings.get_boolean('show-border'),
            borderColor: this._settings.get_string('border-color'),
            borderWidth: this._settings.get_int('border-width'),
            borderRadius: this._settings.get_int('border-radius'),
            background: this._settings.get_boolean('show-background'),
            backgroundColor: this._settings.get_string('background-color'),
            fontStyle: this._settings.get_enum('font-style'),
            fontWeight: this._settings.get_int('font-weight'),
        };

        const styleHash = JSON.stringify(values);
        if (styleHash === this._lastStyleHash)
            return;

        this._lastStyleHash = styleHash;

        const styles = [
            `color: ${values.color}`,
            `margin: ${values.margin[0]}px ${values.margin[1]}px ${values.margin[2]}px ${values.margin[3]}px`,
            `padding: ${values.padding[0]}px ${values.padding[1]}px ${values.padding[2]}px ${values.padding[3]}px`,
            `font-size: ${values.size}pt`,
            'font-feature-settings: "tnum"',
        ];

        if (values.background)
            styles.push(`background-color: ${values.backgroundColor}`, `border-radius: ${values.borderRadius}px`);

        if (values.border)
            styles.push(`border-width: ${values.borderWidth}px`, `border-color: ${values.borderColor}`);

        if (values.shadow[0])
            styles.push(`text-shadow: ${values.shadow[2]}px ${values.shadow[3]}px ${values.shadow[5]}px ${values.shadow[4]}px ${values.shadow[1]}`);

        if (values.font[0]) {
            styles.push(`font-family: "${values.font[1]}"`);
            if (values.fontWeight)
                styles.push(`font-weight: ${values.fontWeight}`);
            if (values.fontStyle)
                styles.push(`font-style: ${Utils.fontStyleEnumToString(values.fontStyle)}`);
        }

        const lineAlignment = {
            [Clutter.ActorAlign.START]: 'left',
            [Clutter.ActorAlign.CENTER]: 'center',
            [Clutter.ActorAlign.END]: 'right',
        }[values.lineAlign] || 'left';

        styles.push(`text-align: ${lineAlignment}`);

        this.style = styles.join('; ');

        this.x_align = values.alignX;
        this.y_align = values.alignY;
        this.queue_relayout();
    }

    _onDestroy() {
        this._lastStyleHash = null;
        this._settings.disconnectObject(this);
        this._settings = null;
        this._extension = null;
    }
});
