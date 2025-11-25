# GNOME QuickSettings close autofocus

A GNOME Shell Extension that automatically focuses the window under the mouse when panel menus are closed or windows are destroyed.

## What does this extension do?

Normally, after closing panel menus (QuickSettings, tiling extension menus, etc.) or closing windows, the focus stays on the previous window or gets lost. This extension changes that behavior:

**When closing any panel menu or window, the window under the mouse cursor is automatically focused.**

This makes the behavior more intuitive and follows the "Focus-Follows-Mouse" principle.

## Features

- Automatically focuses the window under the mouse when closing panel menus
- Automatically focuses the window under the mouse when closing windows
- Works with QuickSettings and other panel button menus (e.g., tiling extension menus)
- Lightweight and non-intrusive
- No configuration needed

## Requirements

- GNOME Shell 45 or newer
- Linux with GNOME Desktop

## Installation

### Method 1: Manual

1. Copy the extension to the correct folder:
```bash
mkdir -p ~/.local/share/gnome-shell/extensions
cp -r quicksettings-close-autofocus@gammelsami ~/.local/share/gnome-shell/extensions/
```

2. Reload GNOME Shell:
   - **X11:** `Alt+F2` → `r` → Enter
   - **Wayland:** Log out and log back in

3. Enable the extension:
```bash
gnome-extensions enable quicksettings-close-autofocus@gammelsami
```

### Method 2: Symlink (for development)

```bash
ln -s $(pwd) ~/.local/share/gnome-shell/extensions/quicksettings-close-autofocus@gammelsami
gnome-extensions enable quicksettings-close-autofocus@gammelsami
```

## Usage

After installation, the extension works automatically:

**For panel menus:**
1. Open any panel menu (e.g., QuickSettings in the top right)
2. Move the mouse over a window
3. Close the menu
4. The window under the mouse is automatically focused

**For closing windows:**
1. Close any window
2. The window under the mouse cursor is automatically focused

## Debugging

View logs:
```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep "QuickSettings Focus on Hover"
```

Check extension status:
```bash
gnome-extensions info quicksettings-close-autofocus@gammelsami
```

## Uninstallation

```bash
gnome-extensions disable quicksettings-close-autofocus@gammelsami
rm -rf ~/.local/share/gnome-shell/extensions/quicksettings-close-autofocus@gammelsami
```

## How it works

1. The extension connects to the `open-state-changed` signal of all panel menus
2. The extension connects to the `destroy` signal of the window manager
3. When a menu is closed or a window is destroyed, the current mouse position is determined
4. All windows are searched (by stacking order)
5. The topmost visible window under the mouse is focused

## Compatibility

Tested with:
- GNOME 45
- GNOME 46
- GNOME 47
- GNOME 48
- GNOME 49

## License

GPL-2.0-or-later

This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

## Contributing

Feedback and pull requests are welcome!
