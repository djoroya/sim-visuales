#!/bin/bash
# Graba y comprime las cuatro animaciones de la sección del modelo → tmp/modelo-<modo>.mp4 y su póster.
#   bash anim/grabar-modelo.sh        (con sim-visuales servido en http://127.0.0.1:4397/)
set -e
declare -A POSTER=([bilamina]=8.5 [malla]=7 [elementos]=6 [giros]=6)
for m in bilamina malla elementos giros; do
  rm -rf tmp/fot_$m
  PAGINA="modelo.html?modo=$m" node anim/grabar.mjs tmp/fot_$m 24 1280 720 | grep -v 404 || true
  ffmpeg -loglevel error -y -framerate 24 -i tmp/fot_$m/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 28 -preset slow -movflags +faststart tmp/modelo-$m.mp4
  k=$(python3 -c "print(f'{round(${POSTER[$m]}*24):04d}')")
  ffmpeg -loglevel error -y -i tmp/fot_$m/f$k.png -q:v 4 tmp/modelo-$m.jpg
  ls -la tmp/modelo-$m.mp4
done
