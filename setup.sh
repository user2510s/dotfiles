

#.config
cp -r .config/* ~/.config/

# temas e extensões
cp -r gnome/extensions ~/.local/share/gnome-shell/
cp -r gnome/themes ~/.themes/
cp -r gnome/icons ~/.icons/

WALL="$HOME/dotfiles/wallpapers/wallpaper.png"

# Aplicar wallpaper diretamente
gsettings set org.gnome.desktop.background picture-uri "file://$WALL"
gsettings set org.gnome.desktop.background picture-uri-dark "file://$WALL"
gsettings set org.gnome.desktop.background picture-options "zoom"

echo "Wallpaper configurado com sucesso!"

echo "Concluido"
