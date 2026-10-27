"""
Graba el video del hero de la portada (public/video/matices-demo.{mp4,webm,jpg}).

El video es la animación de scripts/hero-video/stage.html (escenas propias, distintas
de las demos del sitio). No usa la app, la base de datos ni sesión.

Uso:
  pip install playwright && playwright install chromium
  python scripts/hero-video/record.py <ffmpeg con libx264 y libvpx-vp9> [carpeta temporal]
(ffmpeg completo: por ejemplo `npm i ffmpeg-static` en una carpeta fuera del proyecto)
"""
import base64, functools, http.server, os, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'video')
FFMPEG = sys.argv[1]
WORK = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix='hero-video-')
W, H, SCALE = 960, 640, 1.5

os.makedirs(WORK, exist_ok=True)
for f in os.listdir(WORK):
    os.remove(os.path.join(WORK, f))

# Servidor local solo para esta carpeta
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=HERE)
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_address[1]}/stage.html'

frames = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=SCALE)
    page.goto(url, wait_until='networkidle')
    page.evaluate('document.fonts.ready')
    page.wait_for_timeout(500)
    cdp = page.context.new_cdp_session(page)

    def on_frame(ev):
        frames.append((ev['metadata']['timestamp'], ev['data']))
        cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
    cdp.on('Page.screencastFrame', on_frame)
    cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92, 'maxWidth': int(W * SCALE), 'maxHeight': int(H * SCALE)})
    page.wait_for_timeout(300)
    page.evaluate('window.play()')
    page.wait_for_function('window.__done === true', timeout=60000)
    cdp.send('Page.stopScreencast')
    browser.close()
server.shutdown()

# Cuadros con su duración real → ffmpeg
lines = []
for i, (ts, data) in enumerate(frames):
    name = f'f{i:05d}.jpg'
    with open(os.path.join(WORK, name), 'wb') as fh:
        fh.write(base64.b64decode(data))
    dur = (frames[i + 1][0] - ts) if i + 1 < len(frames) else 0.5
    lines.append(f"file '{name}'\nduration {max(dur, 0.001):.4f}")
lines.append(f"file 'f{len(frames) - 1:05d}.jpg'")
with open(os.path.join(WORK, 'list.txt'), 'w') as fh:
    fh.write('\n'.join(lines))
print('cuadros', len(frames), 'segundos', round(frames[-1][0] - frames[0][0], 1))

src = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(WORK, 'list.txt'), '-vf', 'fps=30,scale=1440:-2']
subprocess.run([FFMPEG, *src, '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(OUT, 'matices-demo.mp4')], check=True)
subprocess.run([FFMPEG, *src, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '35', '-row-mt', '1', '-an', os.path.join(OUT, 'matices-demo.webm')], check=True)
# Póster: la escena del celular ya con el aviso (se ve si el video no arranca)
poster = os.path.join(WORK, f'f{min(len(frames) - 1, int(len(frames) * 0.12)):05d}.jpg')
subprocess.run([FFMPEG, '-y', '-hide_banner', '-loglevel', 'error', '-i', poster, '-vf', 'scale=1440:-2', '-q:v', '3', os.path.join(OUT, 'matices-demo.jpg')], check=True)
