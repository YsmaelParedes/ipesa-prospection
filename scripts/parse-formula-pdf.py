#!/usr/bin/env python3
"""
Convierte un PDF de fórmulas "48 Shots" (texto nativo, no escaneado) en un
catálogo JSON listo para /formulas, con la muestra de color de cada fila.

A diferencia de parse-formula-catalog.mjs (que parte de un .md convertido),
este script lee el PDF directamente, así que no hay corrupción de decimales
por conversión. Pensado para PDFs con este formato de fila:

  Vintek 001-5 Enchantress Eve 5 INFINITE 1000 KX 34.75 2Y 43 13Y 36.25
                                               B  3.5   14   1Y 18.5

Las cantidades son "shots" de 1/48 de onza: "nY m" = n*48 + m shots.

Cada fila de color tiene un recuadro de color (x≈51..86) alineado
verticalmente con ella. Se empareja POR POSICIÓN VERTICAL (no por tipo de
color: algunas muestras grises vienen como escala de grises y no como RGB).

Los valores del PDF vienen redondeados a 1/4 de shot en cada columna
(1 L, 4 L, 19 L). Para no arrastrar ese redondeo, `shotsPerLiter` es el
punto medio del rango de valores que cuadra con las tres columnas a la vez;
así 1, 4 y 19 L reproducen exactamente lo impreso en el PDF. Si las tres
columnas no se pueden cuadrar entre sí, la línea queda `needsReview` (la
pantalla muestra "Verificar fórmula original" en vez de una cantidad).

Requiere: pip install pdfplumber

Uso:
  python scripts/parse-formula-pdf.py <entrada.pdf> <catalogId> <lineaProducto> <fandeck> <salida.json>

Ejemplo:
  python scripts/parse-formula-pdf.py \
    "C:\\ruta\\IPESA Vintek - 48 Shots - INFINITE 1000.pdf" \
    vintek-infinite-1000 Vintek "INFINITE 1000" \
    data/formulas/vintek-infinite-1000.json
"""

import json
import re
import sys

import pdfplumber

SHOTS_PER_OZ = 48
ML_PER_OZ = 29.5735295625
STEP = 0.25            # el PDF redondea cada cantidad a 1/4 de shot
HALF = STEP / 2
EPS = 1e-9

VALUE_RE = re.compile(r"(?:(\d+(?:\.\d+)?)Y\s+)?(\d+(?:\.\d+)?)")
COLOURANT_RE = re.compile(r"^([A-Z]{1,4}) (.+)$")


def to_hex(color):
    if isinstance(color, (int, float)):
        color = (color, color, color)
    r, g, b = color[:3]
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def parse_values(rest):
    """'24.25 2Y 0.75 9Y 27.25' -> [24.25, 96.75, 459.25] (en shots)."""
    found = list(VALUE_RE.finditer(rest))
    # Todo el texto debe quedar explicado por exactamente 3 valores.
    rebuilt = " ".join(m.group(0) for m in found)
    if len(found) != 3 or re.sub(r"\s+", " ", rest.strip()) != rebuilt:
        return None
    out = []
    for m in found:
        oz = float(m.group(1)) if m.group(1) else 0.0
        out.append(oz * SHOTS_PER_OZ + float(m.group(2)))
    return out


def best_shots_per_liter(s1, s4, s19):
    """Punto medio del rango que cuadra con las tres columnas. None si no cuadra."""
    lo = max(s1 - HALF, (s4 - HALF) / 4, (s19 - HALF) / 19)
    hi = min(s1 + HALF, (s4 + HALF) / 4, (s19 + HALF) / 19)
    if lo > hi + EPS:
        return None
    return (lo + hi) / 2


def main():
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    pdf_path, catalog_id, product_line, fandeck, out_path = sys.argv[1:6]
    fandeck_re = re.escape(fandeck)
    color_re = re.compile(
        rf"^{re.escape(product_line)} (?P<code>\S+) (?P<name>.+?) (?P<base>\d+) {fandeck_re} (?P<rest>.+)$"
    )

    colors = []
    problems = []
    needs_review = []
    no_swatch = []

    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            lines = text.split("\n")
            if not any(l.startswith(product_line + " ") for l in lines):
                continue  # portada u hoja sin datos

            # Recuadros de muestra: columna izquierda, ~34 pt de ancho y >40 de alto.
            chips = sorted(
                (r for r in page.rects
                 if r["x0"] < 55 and 83 < r["x1"] < 88 and (r["bottom"] - r["top"]) > 40
                 and r.get("non_stroking_color") is not None),
                key=lambda r: r["top"],
            )
            # Posición vertical de cada fila de color (la palabra inicial de la línea).
            starts = sorted(
                (w for w in page.extract_words()
                 if w["text"] == product_line and w["x0"] < 150 and w["top"] > 70),
                key=lambda w: w["top"],
            )

            current = None
            page_colors = []
            for line in lines:
                line = line.strip()
                if not line or line.startswith("Product Line") or re.match(r"^\d+ shots", line, re.I):
                    continue
                m = color_re.match(line)
                if m:
                    cm = COLOURANT_RE.match(m.group("rest"))
                    current = {
                        "code": m.group("code"),
                        "name": m.group("name").strip(),
                        "base": m.group("base"),
                        "colourants": [],
                    }
                    colors.append(current)
                    page_colors.append(current)
                    line = m.group("rest")
                elif current is None:
                    problems.append(f"p.{pno}: línea sin color previo -> {line}")
                    continue

                cm = COLOURANT_RE.match(line)
                vals = parse_values(cm.group(2)) if cm else None
                if not cm or vals is None:
                    problems.append(f"p.{pno} {current['code']}: no se pudo leer -> {line}")
                    continue
                code = cm.group(1)
                s1, s4, s19 = vals
                best = best_shots_per_liter(s1, s4, s19)
                review = best is None
                spl = s1 if review else best
                cn = {
                    "code": code,
                    "shotsPerLiter": round(spl, 4),
                    "mlPerLiter": round(spl / SHOTS_PER_OZ * ML_PER_OZ, 4),
                    "needsReview": review,
                    "raw": {"1L": s1, "4L": s4, "19L": s19},
                }
                current["colourants"].append(cn)
                if review:
                    needs_review.append((current["code"], current["name"], code, s1, s4, s19, pno))

            if len(starts) != len(page_colors) or len(chips) != len(page_colors):
                problems.append(
                    f"p.{pno}: {len(page_colors)} colores, {len(starts)} filas, {len(chips)} recuadros"
                )
                continue
            for color, w in zip(page_colors, starts):
                # El recuadro que contiene verticalmente a la fila.
                chip = next((c for c in chips if c["top"] - 3 <= w["top"] <= c["bottom"]), None)
                if chip:
                    color["swatch"] = to_hex(chip["non_stroking_color"])
                else:
                    no_swatch.append(color["code"])

    for c in colors:
        if not c["colourants"]:
            problems.append(f"{c['code']}: sin colorantes")
        if "swatch" not in c:
            no_swatch.append(c["code"])

    codes = [c["code"] for c in colors]
    dupes = sorted({x for x in codes if codes.count(x) > 1})
    if dupes:
        problems.append(f"Códigos repetidos: {dupes[:10]}")

    catalog = {
        "id": catalog_id,
        "productLine": product_line,
        "fandeck": fandeck,
        "unit": "ml",
        "sourceUnit": "shots (1/48 fl oz)",
        "colorCount": len(colors),
        "colors": colors,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))

    lines_total = sum(len(c["colourants"]) for c in colors)
    print(f"Catálogo '{catalog_id}': {len(colors)} colores, {lines_total} líneas de colorante.")
    print(f"Muestras: {len(colors) - len(set(no_swatch))} de {len(colors)} colores.")
    print(f"Líneas needsReview (no cuadran entre 1/4/19 L): {len(needs_review)}")
    for r in needs_review[:40]:
        print("  ", r)
    print(f"Problemas de lectura: {len(problems)}")
    for p in problems[:40]:
        print("  -", p)
    print("Guardado en", out_path)


if __name__ == "__main__":
    main()
