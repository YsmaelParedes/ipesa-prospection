#!/usr/bin/env node
/**
 * Convierte una tabla de fórmulas exportada a Markdown (PDF -> MD) en un
 * catálogo JSON estructurado, listo para usarse en /formulas.
 *
 * Formato de entrada esperado (una fila por colorante, filas de continuación
 * dejan en blanco Product Line/Colour Name/Base/Fandeck):
 *
 *   |Vinipesa<br>Matte|AB238-1/Remember Romanc|4|INFINITE 2000|F|9|36|3Y 27|
 *   |||||V|1Y 24.25|6Y 1|28Y 28.75|
 *
 * Las cantidades están en "shots" de 1/48 de onza (de ahí "48 Shots" en el
 * nombre del archivo original): "nY m" = n*48 + m shots; un número solo = m shots.
 *
 * Uso:
 *   node scripts/parse-formula-catalog.mjs <entrada.md> <catalogId> <salida.json>
 *
 * Ejemplo:
 *   node scripts/parse-formula-catalog.mjs \
 *     "C:\Users\iysma\Downloads\IPESA Vinipesa Mate - 48 Shots - INFINITE 2000.md" \
 *     vinipesa-matte-infinite-2000 \
 *     data/formulas/vinipesa-matte-infinite-2000.json
 *
 * Después de correr esto, corre scripts/extract-pdf-swatches.py sobre el
 * mismo .json para agregar la muestra de color ("swatch") de cada color —
 * este script no la genera, solo la borra si ya estaba (regenera desde cero).
 */

import fs from 'node:fs'
import path from 'node:path'

const SHOTS_PER_OZ = 48
const ML_PER_OZ = 29.5735295625

function shotsToMl(shots) {
  return (shots / SHOTS_PER_OZ) * ML_PER_OZ
}

function parseShots(raw) {
  const s = raw.replace(/<br>/gi, '').trim()
  if (!s) return null
  const m = s.match(/^(\d+(?:\.\d+)?)\s*Y\s*(\d+(?:\.\d+)?)$/i)
  if (m) return Number(m[1]) * SHOTS_PER_OZ + Number(m[2])
  const n = Number(s)
  if (Number.isNaN(n)) return null
  return n
}

function splitCell(raw) {
  // Filtra segmentos vacíos y artefactos de conversión PDF->MD: a veces un
  // punto decimal suelto queda en su propia línea de la celda (p. ej.
  // ".<br>34.5"), separado del número real. El valor real siempre es el
  // último segmento no-artefacto.
  return raw
    .split('<br>')
    .map(s => s.trim())
    .filter(s => s && s !== '.')
}

function round(n, dp = 4) {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function parseCatalog(mdText, catalogId) {
  const lines = mdText.split(/\r?\n/)
  const colors = []
  let current = null
  let productLine = ''
  let fandeck = ''
  const warnings = []
  const needsReviewList = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('|')) continue
    if (line.includes('**Product Line**') || /^\|-+\|/.test(line)) continue

    const cells = line.split('|').slice(1, -1)
    if (cells.length !== 8) {
      warnings.push(`Línea ${i + 1}: se esperaban 8 columnas, hay ${cells.length} -> ${line}`)
      continue
    }
    const [plCell, nameCell, baseCell, fandeckCell, colourantCell, l1Cell, l4Cell, l19Cell] = cells

    if (nameCell.trim()) {
      // Nueva fila de color
      const [code, ...nameParts] = nameCell.trim().split('/')
      productLine = plCell.replace(/<br>/g, ' ').trim() || productLine
      fandeck = fandeckCell.trim() || fandeck
      current = {
        code: code.trim(),
        name: nameParts.join('/').trim(),
        base: baseCell.trim(),
        colourants: [],
      }
      colors.push(current)
    }

    if (!current) {
      warnings.push(`Línea ${i + 1}: fila de continuación sin color previo -> ${line}`)
      continue
    }

    const colourantCodes = splitCell(colourantCell)
    const l1Values = splitCell(l1Cell)
    const l4Values = splitCell(l4Cell)
    const l19Values = splitCell(l19Cell)

    if (colourantCodes.length === 1) {
      // Caso frecuente: <br> sobrante (a veces con un "." artefacto) en las
      // celdas aunque solo hay 1 colorante — el valor real es el último
      // segmento no vacío de cada celda.
      const shots1 = parseShots(l1Values[l1Values.length - 1] ?? '')
      const shots4 = parseShots(l4Values[l4Values.length - 1] ?? '')
      const shots19 = parseShots(l19Values[l19Values.length - 1] ?? '')
      current.colourants.push(buildColourant(colourantCodes[0], shots1, shots4, shots19, i + 1, warnings, needsReviewList, current))
      continue
    }

    if (
      colourantCodes.length !== l1Values.length ||
      colourantCodes.length !== l4Values.length ||
      colourantCodes.length !== l19Values.length
    ) {
      warnings.push(`Línea ${i + 1}: cantidad de colorantes/valores no coincide -> ${line}`)
      continue
    }

    for (let k = 0; k < colourantCodes.length; k++) {
      const shots1 = parseShots(l1Values[k])
      const shots4 = parseShots(l4Values[k])
      const shots19 = parseShots(l19Values[k])
      current.colourants.push(buildColourant(colourantCodes[k], shots1, shots4, shots19, i + 1, warnings, needsReviewList, current))
    }
  }

  return {
    id: catalogId,
    productLine,
    fandeck,
    unit: 'ml',
    sourceUnit: 'shots (1/48 fl oz)',
    colorCount: colors.length,
    colors,
    _warnings: warnings,
    _needsReview: needsReviewList,
  }
}

// El .md fuente (conversión PDF -> MD) ocasionalmente pierde puntos decimales
// o dígitos en celdas sueltas, produciendo valores de 4L/19L que no cuadran
// con 1L*4 / 1L*19 (o incluso corrompiendo el propio 1L). No hay forma segura
// de "adivinar" el valor correcto para una fórmula de mezcla real, así que
// estas líneas se marcan needsReview en vez de asumir un número.
function buildColourant(code, shots1, shots4, shots19, lineNo, warnings, needsReviewList, colorRef) {
  if (shots1 == null) {
    warnings.push(`Línea ${lineNo}: no se pudo interpretar la cantidad de 1L para "${code}"`)
  }

  let needsReview = false
  if (shots1 != null && shots4 != null) {
    const expected4 = shots1 * 4
    if (Math.abs(expected4 - shots4) > 0.5) {
      warnings.push(`Línea ${lineNo}: colorante ${code} — 4L (${shots4}) no cuadra con 1L*4 (${expected4})`)
      needsReview = true
    }
  }
  if (shots1 != null && shots19 != null) {
    const expected19 = shots1 * 19
    if (Math.abs(expected19 - shots19) > 0.5) {
      warnings.push(`Línea ${lineNo}: colorante ${code} — 19L (${shots19}) no cuadra con 1L*19 (${expected19})`)
      needsReview = true
    }
  }

  const result = {
    code,
    shotsPerLiter: shots1,
    mlPerLiter: shots1 != null ? round(shotsToMl(shots1)) : null,
    needsReview,
    raw: { '1L': shots1, '4L': shots4, '19L': shots19 },
  }
  if (needsReview || shots1 == null) {
    needsReviewList.push({ line: lineNo, color: colorRef.code, name: colorRef.name, colourant: code, raw: result.raw })
  }
  return result
}

// Correcciones verificadas manualmente contra el PDF original (no contra el
// .md, que es donde vive la corrupción). Se guardan aparte para que sean
// trazables y se re-apliquen automáticamente si el catálogo se regenera.
function applyCorrections(catalog, corrections) {
  const byKey = new Map(corrections.map(c => [`${c.color}::${c.colourant}`, c]))
  let applied = 0
  for (const color of catalog.colors) {
    for (const cn of color.colourants) {
      const fix = byKey.get(`${color.code}::${cn.code}`)
      if (!fix) continue
      cn.shots1Corrected = fix.shots1
      cn.shotsPerLiter = fix.shots1
      cn.mlPerLiter = round(shotsToMl(fix.shots1))
      cn.needsReview = false
      cn.verifiedAgainstPdfPage = fix.verifiedAgainstPdfPage
      applied++
    }
  }
  return applied
}

// ── CLI ──────────────────────────────────────────────────────────────────
const [, , inputPath, catalogId, outputPath] = process.argv
if (!inputPath || !catalogId || !outputPath) {
  console.error('Uso: node scripts/parse-formula-catalog.mjs <entrada.md> <catalogId> <salida.json>')
  process.exit(1)
}

const mdText = fs.readFileSync(inputPath, 'utf8')
const catalog = parseCatalog(mdText, catalogId)

const correctionsPath = outputPath.replace(/\.json$/, '.corrections.json')
let correctionsApplied = 0
if (fs.existsSync(correctionsPath)) {
  const corrections = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'))
  correctionsApplied = applyCorrections(catalog, corrections)
  catalog._needsReview = catalog._needsReview.filter(
    w => !corrections.some(c => c.color === w.color && c.colourant === w.colourant)
  )
}

const { _warnings, _needsReview, ...catalogOut } = catalog
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(catalogOut, null, 0))

const reviewPath = outputPath.replace(/\.json$/, '.revisar.json')
fs.writeFileSync(reviewPath, JSON.stringify(_needsReview, null, 2))

const totalColourantLines = catalog.colors.reduce((n, c) => n + c.colourants.length, 0)
console.log(`Catálogo "${catalogId}": ${catalog.colorCount} colores, ${totalColourantLines} líneas de colorante.`)
if (correctionsApplied) {
  console.log(`${correctionsApplied} correcciones verificadas contra el PDF aplicadas desde ${correctionsPath}`)
}
console.log(`${_needsReview.length} líneas siguen marcadas needsReview (no se usan para calcular hasta revisarse contra el PDF original) -> ${reviewPath}`)
if (_warnings.length) {
  console.log(`\n${_warnings.length} advertencias de parseo:`)
  for (const w of _warnings.slice(0, 50)) console.log(' -', w)
  if (_warnings.length > 50) console.log(`  ... y ${_warnings.length - 50} más`)
} else {
  console.log('Sin advertencias de parseo.')
}
console.log(`Guardado en ${outputPath}`)
