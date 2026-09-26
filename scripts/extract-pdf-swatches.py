#!/usr/bin/env python3
"""
Extrae las muestras de color (swatches) reales del PDF original y las agrega
al catálogo JSON ya generado por parse-formula-catalog.mjs.

El PDF no tiene imágenes, pero cada fila de color trae un rectángulo con
relleno RGB (un "chip" de color) alineado verticalmente con esa fila. Se
verificó 1-a-1 que el número de rectángulos con relleno de color en cada
página coincide exactamente con el número de colores en esa página (0
discrepancias en las 203 páginas), así que se emparejan en orden: colores
de arriba hacia abajo <-> rectángulos de arriba hacia abajo (por `top`).

IMPORTANTE — orden del pipeline:
  1. node scripts/parse-formula-catalog.mjs <entrada.md> <catalogId> <salida.json>
  2. python scripts/extract-pdf-swatches.py <entrada.pdf> <entrada.md> <salida.json>

El paso 2 MODIFICA el JSON del paso 1 in-place, agregando "swatch": "#rrggbb"
a cada color. Si vuelves a correr el paso 1, se pierde el campo "swatch" —
hay que volver a correr el paso 2 después.

Requiere: pip install pdfplumber

Uso:
  python scripts/extract-pdf-swatches.py \
    "C:\\ruta\\archivo.pdf" \
    "C:\\ruta\\archivo.md" \
    data/formulas/vinipesa-matte-infinite-2000.json
"""

import json
import re
import sys
from collections import defaultdict

import pdfplumber


def to_hex(rgb):
    r, g, b = rgb
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def main():
    if len(sys.argv) != 4:
        print("Uso: python scripts/extract-pdf-swatches.py <entrada.pdf> <entrada.md> <catalogo.json>")
        sys.exit(1)

    pdf_path, md_path, catalog_path = sys.argv[1], sys.argv[2], sys.argv[3]

    lines = open(md_path, encoding="utf-8").read().split("\n")

    # Mapea cada línea del .md a su número de página de pie de página ("Page: N/203")
    page_for_line = {}
    cur_page = None
    for i, line in enumerate(lines):
        m = re.match(r"^Page:\s*(\d+)/(\d+)", line)
        if m:
            cur_page = int(m.group(1))
        page_for_line[i] = cur_page

    # Lista ordenada de (codigo, pagina) tal como los parsea parse-formula-catalog.mjs
    color_pages = []
    for i, line in enumerate(lines):
        if line.startswith("|") and not line.startswith("|||||") and "**Product Line**" not in line and not re.match(r"^\|-+\|", line):
            cells = line.split("|")[1:-1]
            if len(cells) == 8 and cells[1].strip():
                code = cells[1].strip().split("/")[0]
                color_pages.append((code, page_for_line[i]))

    by_page = defaultdict(list)
    for code, fp in color_pages:
        by_page[fp].append(code)

    swatches = {}
    skipped_pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for footer_page, codes in by_page.items():
            # El PDF tiene una portada antes del contenido numerado ->
            # página física (0-based) = número de pie de página.
            physical_idx = footer_page
            page = pdf.pages[physical_idx]
            colored = [r for r in page.rects if isinstance(r.get("non_stroking_color"), tuple)]
            colored.sort(key=lambda r: r["top"])
            if len(colored) != len(codes):
                skipped_pages.append(footer_page)
                continue
            for code, rect in zip(codes, colored):
                swatches[code] = to_hex(rect["non_stroking_color"])

    catalog = json.load(open(catalog_path, encoding="utf-8"))
    missing = []
    for color in catalog["colors"]:
        hex_val = swatches.get(color["code"])
        if hex_val:
            color["swatch"] = hex_val
        else:
            missing.append(color["code"])

    with open(catalog_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(swatches)} muestras extraídas, {len(missing)} colores sin muestra.")
    if skipped_pages:
        print(f"Páginas omitidas por descuadre rects/colores: {skipped_pages}")
    if missing:
        print("Sin muestra:", ", ".join(missing[:20]), "..." if len(missing) > 20 else "")
    print("Guardado en", catalog_path)


if __name__ == "__main__":
    main()
