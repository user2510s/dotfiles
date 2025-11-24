<b><span size="large">v15.3</span></b>

- Ensure GNOME Layout Manager startup is complete before creating widgets.
- Fallback to widget position (0, 0) if no monitors found in layout manager.

<b><span size="large">v15.2</span></b>

- Add GNOME 49 Support

<b><span size="large">v15.1</span></b>

- Digital Clock: fix missing setMarkup() causing markup to not render.

<b><span size="large">v15.0</span></b>

- Add new Image Element (from local file or URL).
- Weather Widget: add option to change temperature unit.
- Command Label: add option to hide element on error. 
- Labels: add support for URL hyperlinks and HTML anchor tags.
    - Ctrl+Click activates the hyperlink.
- Labels: improve pango markup parsing.
- New widget positioning system and anchor points.
- Analog Clock: fix bug with second hand movement when smooth hand ticks enabled.
- Clocks: fix bug causing clock to be slightly out of sync with real time.