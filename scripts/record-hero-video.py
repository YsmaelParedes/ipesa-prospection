"""
Graba el video del hero de la portada (public/video/matices-demo.{mp4,webm,jpg}).

Recorre las demos del sitio (app/inicio/demos) con clientes de ejemplo; no toca
la base de datos ni necesita sesión. Para regrabar cuando cambien las demos:
  1. Crea una página temporal app/inicio/grabacion-temporal/page.tsx que muestre
     <DemoTabs bare /> a pantalla completa (fondo #F4F4F5, logo y "Sistema Comercial"
     arriba) y levanta el servidor de desarrollo.
  2. pip install playwright && playwright install chromium; ffmpeg completo con
     H.264 y VP9 (por ejemplo: npm i ffmpeg-static en una carpeta aparte).
  3. python scripts/record-hero-video.py http://localhost:3000/inicio/grabacion-temporal public/video <ffmpeg.exe> <carpeta-temporal>
  4. Borra la página temporal (no se sube).
"""
import base64, json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
OUT = sys.argv[2]            # carpeta de salida (public/video)
FFMPEG = sys.argv[3]
WORK = sys.argv[4]           # carpeta temporal de cuadros
W, H = 960, 640
SCALE = 1.5
os.makedirs(WORK, exist_ok=True)
for f in os.listdir(WORK):
    os.remove(os.path.join(WORK, f))

CURSOR_JS = """
(() => {
  const st = document.createElement('style');
  st.textContent = `nextjs-portal{display:none!important}
  #rec-cursor{position:fixed;left:0;top:0;z-index:99999;width:26px;height:26px;margin:-4px 0 0 -4px;pointer-events:none;transition:transform .55s cubic-bezier(.2,0,0,1)}
  #rec-ring{position:fixed;z-index:99998;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(229,10,38,.25);pointer-events:none;transform:scale(0);opacity:0}
  #rec-ring.on{animation:recp .45s ease-out}
  @keyframes recp{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.3);opacity:0}}`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'rec-cursor';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9-7 2-3 7z" fill="#131313" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = 'rec-ring';
  document.body.appendChild(c); document.body.appendChild(r);
  c.style.transform = 'translate(900px,500px)';
})()
"""

frames = []

def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=SCALE)
        page.goto(URL, wait_until='networkidle')
        page.wait_for_timeout(1500)
        page.evaluate(CURSOR_JS)
        cdp = page.context.new_cdp_session(page)

        def on_frame(ev):
            frames.append((ev['metadata']['timestamp'], ev['data']))
            cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
        cdp.on('Page.screencastFrame', on_frame)
        cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': int(W * SCALE), 'maxHeight': int(H * SCALE), 'everyNthFrame': 1})

        def move(sel):
            el = page.locator(sel).first
            box = el.bounding_box()
            x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            page.evaluate(f"document.getElementById('rec-cursor').style.transform='translate({x}px,{y}px)'")
            page.wait_for_timeout(650)
            return x, y

        def click(sel, after=700):
            x, y = move(sel)
            page.evaluate(f"(()=>{{const r=document.getElementById('rec-ring');r.style.left='{x}px';r.style.top='{y}px';r.classList.remove('on');void r.offsetWidth;r.classList.add('on')}})()")
            page.locator(sel).first.click()
            page.wait_for_timeout(after)

        def type_text(sel, text):
            click(sel, 200)
            for ch in text:
                page.keyboard.type(ch)
                page.wait_for_timeout(110)
            page.wait_for_timeout(600)

        page.wait_for_timeout(900)
        # 1. Registrar una llamada
        click('[data-demo-item="fa"]', 800)
        click('[data-demo-result="Cotización"]', 800)
        click('[data-demo-save]', 1600)
        # 2. WhatsApp + IA
        click('[data-demo-tab="whatsapp"]', 900)
        click('[data-demo-suggest="¿Igualan colores?"]', 1900)
        click('[data-demo-suggest="Quiero cotizar 15 cubetas"]', 3300)
        # 3. Contactos
        click('[data-demo-tab="contacts"]', 700)
        type_text('[data-demo-search]', 'jose')
        click('[data-demo-contact="jp"]', 1500)
        # 4. Equipo
        click('[data-demo-tab="team"]', 900)
        click('[data-demo-sale="Karen"]', 900)
        click('[data-demo-goal-down]', 500)
        click('[data-demo-goal-down]', 1800)

        cdp.send('Page.stopScreencast')
        page.wait_for_timeout(300)
        b.close()

    # Cuadros con su duración real → concat de ffmpeg
    lines = []
    for i, (ts, data) in enumerate(frames):
        name = f'f{i:05d}.jpg'
        with open(os.path.join(WORK, name), 'wb') as fh:
            fh.write(base64.b64decode(data))
        dur = (frames[i + 1][0] - ts) if i + 1 < len(frames) else 1.0
        lines.append(f"file '{name}'\nduration {max(dur, 0.001):.4f}")
    lines.append(f"file 'f{len(frames) - 1:05d}.jpg'")
    with open(os.path.join(WORK, 'list.txt'), 'w') as fh:
        fh.write('\n'.join(lines))
    total = frames[-1][0] - frames[0][0]
    print('frames', len(frames), 'seconds', round(total, 1))

    base = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(WORK, 'list.txt'), '-vf', 'fps=30,scale=1440:-2']
    subprocess.run([FFMPEG, *base, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(OUT, 'matices-demo.mp4')], check=True)
    subprocess.run([FFMPEG, *base, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-an', os.path.join(OUT, 'matices-demo.webm')], check=True)
    subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', os.path.join(WORK, 'f00000.jpg'), '-vf', 'scale=1440:-2', '-q:v', '3', os.path.join(OUT, 'matices-demo.jpg')], check=True)


main()
