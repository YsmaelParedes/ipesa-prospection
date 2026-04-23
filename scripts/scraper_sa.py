"""
Scraper de prospectos — Sección Amarilla México (usa Scrapling)
Uso:
    python scripts/scraper_sa.py --giro ferreterias --estado puebla --paginas 5
    python scripts/scraper_sa.py --giro "pinturas" --estado puebla --paginas 3
    python scripts/scraper_sa.py --multi --estado puebla --paginas 5
Salida: prospects_<giro>_<estado>.json  (compatible con importador de la app)
"""
import os
import json
import re
import html as html_mod
import argparse

from scrapling.fetchers import DynamicFetcher, DynamicSession

SLUG_ESTADOS = {
    'jalisco': 'jalisco', 'nuevo leon': 'nuevo-leon', 'nuevo león': 'nuevo-leon',
    'cdmx': 'ciudad-de-mexico', 'ciudad de mexico': 'ciudad-de-mexico',
    'ciudad de méxico': 'ciudad-de-mexico', 'estado de mexico': 'estado-de-mexico',
    'estado de méxico': 'estado-de-mexico', 'guanajuato': 'guanajuato',
    'chihuahua': 'chihuahua', 'sonora': 'sonora', 'veracruz': 'veracruz',
    'puebla': 'puebla', 'baja california': 'baja-california',
    'tamaulipas': 'tamaulipas', 'coahuila': 'coahuila', 'sinaloa': 'sinaloa',
    'michoacan': 'michoacan', 'michoacán': 'michoacan', 'oaxaca': 'oaxaca',
    'queretaro': 'queretaro', 'querétaro': 'queretaro',
    'yucatan': 'yucatan', 'yucatán': 'yucatan',
}

GIROS_IPESA_PUEBLA = [
    'ferreterias',
    'pinturas',
    'tlapalerias',
    'materiales-de-construccion',
    'impermeabilizantes',
    'recubrimientos',
    'techadores',
    'construccion',
    'acabados',
    'contratistas',
]

def clean(s):
    return html_mod.unescape(str(s)).strip() if s else ''

def fmt_phone(p):
    if not p: return ''
    d = re.sub(r'\D', '', str(p))
    if len(d) == 10: return d
    if len(d) == 12 and d.startswith('52'): return d[2:]
    return d[-10:] if len(d) > 10 else d

def map_segment(actividad: str) -> str:
    a = actividad.lower()
    if any(x in a for x in ['ferret', 'materi', 'construc', 'plomer', 'electric', 'pintur', 'herrer', 'carpint', 'tlapal', 'recubrim', 'imperme', 'techad', 'acabado', 'contrat']): return 'construccion'
    if any(x in a for x in ['tienda', 'minori', 'super', 'abarrot']): return 'retail'
    if any(x in a for x in ['industri', 'fabric', 'manufactur', 'mayoreo']): return 'industrial'
    if any(x in a for x in ['auto', 'taller', 'refacci']): return 'automotriz'
    return 'construccion'

def scrape_page(session: DynamicSession, giro_slug: str, estado_slug: str | None, num_page: int) -> list:
    if estado_slug:
        url = f'https://www.seccionamarilla.com.mx/resultados/{giro_slug}/{estado_slug}/{num_page}'
    else:
        url = f'https://www.seccionamarilla.com.mx/resultados/{giro_slug}/{num_page}'

    captured: dict = {}

    def extract(page):
        captured['data'] = page.evaluate(
            '() => typeof resultados !== "undefined" ? resultados : []'
        )

    session.fetch(url, page_action=extract, wait=3000, network_idle=True, disable_resources=True)

    resultados = captured.get('data', [])
    if not isinstance(resultados, list):
        resultados = []

    contactos = []
    for r in resultados:
        nombre = clean(r.get('bn', ''))
        tel = fmt_phone(r.get('phone', '') or r.get('telefono', ''))
        dir1 = clean(r.get('address1', ''))
        dir2 = clean(r.get('address2', ''))
        wa = f'52{tel}' if len(tel) == 10 else ''
        cp_match = re.search(r'\b(\d{5})\b', dir2)

        contactos.append({
            'name': nombre,
            'phone': tel,
            'whatsapp': wa,
            'whatsapp_link': f'https://wa.me/{wa}' if wa else '',
            'address': f'{dir1}, {dir2}'.strip(', '),
            'postal_code': cp_match.group(1) if cp_match else '',
            'segment': map_segment(giro_slug),
            'activity': giro_slug.replace('-', ' ').capitalize(),
            'acquisition_channel': 'Seccion Amarilla',
            'prospect_status': 'nuevo',
        })

    return contactos

def run_giro(giro: str, estado: str | None, max_pages: int) -> list:
    estado_slug = None
    if estado:
        estado_norm = estado.lower().strip()
        estado_slug = SLUG_ESTADOS.get(estado_norm, estado.lower().replace(' ', '-'))
        print(f'Estado: {estado} -> {estado_slug}')

    giro_slug = (giro.lower()
                 .replace(' ', '-')
                 .replace('á','a').replace('é','e').replace('í','i')
                 .replace('ó','o').replace('ú','u').replace('ñ','n'))

    todos = []
    with DynamicSession(headless=True) as session:
        for num in range(1, max_pages + 1):
            print(f'  [{giro_slug}] Pagina {num}/{max_pages}...', end=' ', flush=True)
            try:
                lote = scrape_page(session, giro_slug, estado_slug, num)
                print(f'{len(lote)} resultados')
                todos.extend(lote)
                if not lote:
                    print('  Sin mas resultados, deteniendo.')
                    break
            except Exception as e:
                print(f'Error: {e}')
                break

    seen = set()
    unicos = []
    for c in todos:
        key = c['phone'] or c['name']
        if key and key not in seen:
            seen.add(key)
            unicos.append(c)

    return unicos

def main(giro: str | None, estado: str | None, max_pages: int, multi: bool):
    if multi:
        todos_combinados = []
        seen_global = set()
        for g in GIROS_IPESA_PUEBLA:
            print(f'\n=== Scrapeando: {g} ===')
            lote = run_giro(g, estado, max_pages)
            nuevos = 0
            for c in lote:
                key = c['phone'] or c['name']
                if key and key not in seen_global:
                    seen_global.add(key)
                    todos_combinados.append(c)
                    nuevos += 1
            print(f'  +{nuevos} nuevos (total: {len(todos_combinados)})')

        os.makedirs('scripts/data', exist_ok=True)
        sufijo = f'_{estado.replace(" ","_")}' if estado else ''
        fname = f'scripts/data/prospects_ipesa{sufijo}_multi.json'
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(todos_combinados, f, ensure_ascii=False, indent=2)
        print(f'\nOK: {len(todos_combinados)} prospectos unicos guardados en {fname}')
    else:
        if not giro:
            print('Error: especifica --giro o usa --multi')
            return
        unicos = run_giro(giro, estado, max_pages)
        giro_slug = (giro.lower()
                     .replace(' ', '-')
                     .replace('á','a').replace('é','e').replace('í','i')
                     .replace('ó','o').replace('ú','u').replace('ñ','n'))
        os.makedirs('scripts/data', exist_ok=True)
        sufijo = f'_{estado.replace(" ","_")}' if estado else ''
        fname = f'scripts/data/prospects_{giro_slug}{sufijo}.json'
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(unicos, f, ensure_ascii=False, indent=2)
        print(f'\nOK: {len(unicos)} prospectos guardados en {fname}')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--giro', default=None, help='Giro a buscar (ej: ferreterias, pinturas)')
    parser.add_argument('--estado', default=None, help='Filtrar por estado (ej: puebla, jalisco)')
    parser.add_argument('--paginas', type=int, default=3, help='Paginas por giro (20 negocios/pagina)')
    parser.add_argument('--multi', action='store_true', help='Scrapear todos los giros IPESA de una vez')
    args = parser.parse_args()

    if not args.multi and not args.giro:
        args.giro = 'ferreterias'

    print(f'Buscando: {args.giro or "MULTI"} | Estado: {args.estado or "todos"} | Paginas: {args.paginas}')
    main(args.giro, args.estado, args.paginas, args.multi)
