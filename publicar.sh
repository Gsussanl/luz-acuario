#!/bin/sh
# Copia la app desde el proyecto de trabajo y sube solo lo que cambió a GitHub Pages.
# Solo pasa app/ (sin pruebas) y los 4 datos que usa; capturas, APKs, notas y la MAC nunca salen.
set -e
S="C:/Users/Gsus Santana/Proyectos/luz-acuario"; W="$(dirname "$0")"
rm -rf "$W/app" && cp -r "$S/app" "$W/" && rm -f "$W"/app/js/*.test.mjs
for f in habitantes.json mezclas.json plantas.json recomendar.js; do cp "$S/datos/$f" "$W/datos/"; done
cd "$W"; git add -A
git diff --cached --quiet && { echo "Sin cambios"; exit 0; }
git diff --cached --stat
git commit -q -m "${1:-Actualizar app}"; git push -q && echo "Publicado"
