'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getDisplayName } from '@/lib/profile'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'playing' | 'over'
type Pipe  = { x: number; gapY: number; scored: boolean }
type LBRow = { id: string; player_name: string; score: number; created_at: string }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y,     x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x,     y + h, r)
  ctx.arcTo(x,     y + h, x,     y,     r)
  ctx.arcTo(x,     y,     x + w, y,     r)
  ctx.closePath()
}

const MEDALS = ['🥇', '🥈', '🥉']

function LeaderRow({ rank, name, score, isMe }: { rank: number; name: string; score: number; isMe?: boolean }) {
  const top3 = rank <= 3
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10,
      background: isMe ? 'rgba(238,90,36,0.10)' : top3 ? 'var(--ipesa-orange-soft)' : 'var(--card)',
      border: `1.5px solid ${isMe ? 'var(--ipesa-orange)' : top3 ? 'rgba(238,90,36,0.3)' : 'var(--line)'}`,
    }}>
      <div style={{ width: 22, textAlign: 'center', fontSize: top3 ? 16 : 12, fontWeight: 700, color: top3 ? 'var(--ipesa-orange)' : 'var(--muted)', flexShrink: 0 }}>
        {top3 ? MEDALS[rank - 1] : `${rank}`}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, fontWeight: isMe ? 700 : 600, color: 'var(--ink)' }}>
        {name} {isMe && <span style={{ fontSize: 10, color: 'var(--ipesa-orange)' }}>← tú</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: top3 ? 'var(--ipesa-orange)' : 'var(--ink)', flexShrink: 0 }}>{score}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
export default function ArcadePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)
  const rafRef    = useRef<number>(0)

  // Canvas dims (refs for game loop, state for DOM)
  const CW = useRef(300); const CH = useRef(430)
  const [cvs, setCvs] = useState({ w: 300, h: 430 })

  // Game state – all refs, never cause re-renders
  const phaseRef    = useRef<Phase>('idle')
  const birdYRef    = useRef(0)
  const birdVRef    = useRef(0)
  const pipesRef    = useRef<Pipe[]>([])
  const scoreRef    = useRef(0)
  const frameRef    = useRef(0)
  const lastPipeRef = useRef(0)

  // UI state
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [score,      setScore]      = useState(0)
  const [best,       setBest]       = useState(0)
  const [lb,         setLb]         = useState<LBRow[]>([])
  const [playerName, setPlayerName] = useState('Jugador')
  const [submitName, setSubmitName] = useState('Jugador')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [loadingLB,  setLoadingLB]  = useState(true)
  const [lbErr,      setLbErr]      = useState(false)

  // ── Player name desde tabla public.profiles ────────────────────────────────
  useEffect(() => {
    getDisplayName().then(n => { setPlayerName(n); setSubmitName(n) })
    try {
      const b = parseInt(localStorage.getItem('ipesa_arcade_best') ?? '0', 10) || 0
      setBest(b)
    } catch {}
  }, [])

  // ── Responsive canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (!wrapRef.current) return
      const raw = wrapRef.current.clientWidth
      const w = Math.min(Math.max(raw, 240), 360)
      const h = Math.floor(w * 1.48)
      CW.current = w; CH.current = h
      setCvs({ w, h })
    }
    update()
    const ro = new ResizeObserver(update)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // ── Computed constants (inline functions, always use latest CW/CH) ────────
  const GH  = () => Math.floor(CH.current * 0.09)    // ground height
  const GY  = () => CH.current - GH()                 // ground Y
  const BX  = () => Math.floor(CW.current * 0.23)     // bird fixed X
  const BR  = () => Math.floor(CW.current * 0.067)    // bird visual radius
  const BHR = () => BR() * 0.68                       // hitbox radius
  const PW  = () => Math.floor(CW.current * 0.195)    // pipe width
  const PG  = () => Math.floor(CH.current * 0.295)    // pipe gap
  const PS  = () => CW.current * 0.0068               // pipe speed px/frame
  const GRV = () => CH.current * 0.00082              // gravity px/frame²
  const FLV = () => -(CH.current * 0.0195)            // flap velocity
  const MXV = () => CH.current * 0.026               // max fall velocity

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = CW.current, H = CH.current
    const gY = GY(), gH = GH()
    const bx = BX(), br = BR()
    const pW = PW(), pG = PG()
    const by = birdYRef.current
    const vy = birdVRef.current
    const fr = frameRef.current

    // ── Sky ──
    const sky = ctx.createLinearGradient(0, 0, 0, gY * 0.85)
    sky.addColorStop(0, '#A8C8E8')
    sky.addColorStop(1, '#E8F4F0')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, gY)

    // ── Clouds ──
    ctx.fillStyle = 'rgba(255,255,255,0.84)'
    ;[{ ox: 0.08, oy: 0.07, r: 0.072 }, { ox: 0.44, oy: 0.05, r: 0.056 }, { ox: 0.72, oy: 0.10, r: 0.048 }]
      .forEach(({ ox, oy, r }) => {
        const cx = ((ox * W + fr * 0.28) % (W + 140)) - 70
        const cy = oy * H, rr = r * W
        ctx.beginPath()
        ctx.arc(cx,          cy,           rr,        0, Math.PI * 2)
        ctx.arc(cx + rr,     cy - rr*0.3,  rr * 0.75, 0, Math.PI * 2)
        ctx.arc(cx + rr*1.6, cy,           rr * 0.62, 0, Math.PI * 2)
        ctx.fill()
      })

    // ── Pipes ──
    pipesRef.current.forEach(pipe => {
      const topH  = pipe.gapY - pG / 2   // height of top pipe
      const botY  = pipe.gapY + pG / 2   // top edge of bottom pipe
      const capH  = Math.floor(H * 0.036)
      const capPd = Math.floor(W * 0.024)

      const pGrad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pW, 0)
      pGrad.addColorStop(0,    '#1A6640')
      pGrad.addColorStop(0.38, '#2DB870')
      pGrad.addColorStop(1,    '#1A6640')

      const capG = ctx.createLinearGradient(pipe.x - capPd, 0, pipe.x + pW + capPd, 0)
      capG.addColorStop(0,   '#155235')
      capG.addColorStop(0.5, '#38E882')
      capG.addColorStop(1,   '#155235')

      // ── Top pipe ──
      if (topH - capH > 0) {
        ctx.fillStyle = pGrad
        ctx.fillRect(pipe.x, 0, pW, topH - capH)
      }
      // Cap
      ctx.fillStyle = capG
      rrect(ctx, pipe.x - capPd, topH - capH, pW + capPd*2, capH, 5); ctx.fill()
      // Paint drip 🎨
      ctx.fillStyle = '#F2B544'
      ctx.beginPath()
      ctx.arc(pipe.x + pW*0.36, topH + capH*0.08, capH*0.3, 0, Math.PI*2); ctx.fill()
      ctx.fillRect(pipe.x + pW*0.36 - capH*0.15, topH, capH*0.3, capH*0.85)

      // ── Bottom pipe ──
      if (gY - botY - capH > 0) {
        ctx.fillStyle = pGrad
        ctx.fillRect(pipe.x, botY + capH, pW, gY - botY - capH)
      }
      // Cap
      ctx.fillStyle = capG
      rrect(ctx, pipe.x - capPd, botY, pW + capPd*2, capH, 5); ctx.fill()
      // Paint drip
      ctx.fillStyle = '#F2B544'
      ctx.beginPath()
      ctx.arc(pipe.x + pW*0.64, botY + capH*0.92, capH*0.3, 0, Math.PI*2); ctx.fill()
    })

    // ── Ground ──
    // Dirt
    ctx.fillStyle = '#6B4526'
    ctx.fillRect(0, gY, W, gH)
    // Paint stripe
    ctx.fillStyle = '#EE5A24'
    ctx.fillRect(0, gY, W, Math.floor(gH * 0.2))
    // Animated paint blobs
    ctx.fillStyle = 'rgba(242,181,68,0.85)'
    for (let i = 0; i < 5; i++) {
      const sx = ((i * 97 + fr * 0.5) % (W + 50)) - 25
      ctx.beginPath()
      ctx.ellipse(sx, gY + Math.floor(gH * 0.14), 9, 5, 0, 0, Math.PI*2)
      ctx.fill()
    }

    // ── Bird (IPESA paint can) ──
    const maxV = MXV()
    const angle = Math.max(-0.40, Math.min(0.58, (vy / maxV) * 0.58))
    const bw = br * 1.82, bh = br * 2.25, brad = br * 0.32

    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(angle)

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.beginPath()
    ctx.ellipse(4, bh/2 + 6, bw * 0.48, 6, 0, 0, Math.PI*2)
    ctx.fill()

    // Can body gradient
    const cg = ctx.createLinearGradient(-bw/2, 0, bw/2, 0)
    cg.addColorStop(0,   '#D04010')
    cg.addColorStop(0.3, '#FF7040')
    cg.addColorStop(1,   '#C03A0E')
    ctx.fillStyle = cg
    rrect(ctx, -bw/2, -bh/2, bw, bh, brad); ctx.fill()

    // Rim highlight
    ctx.fillStyle = 'rgba(255,255,255,0.20)'
    rrect(ctx, -bw/2+3, -bh/2+3, bw*0.38, bh*0.36, brad*0.6); ctx.fill()

    // White label band
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.fillRect(-bw/2 + 4, -br*0.52, bw - 8, br*1.06)

    // Brand text
    ctx.fillStyle = '#C03A0E'
    ctx.font = `800 ${Math.max(7, Math.floor(br * 0.52))}px -apple-system,Arial,sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('IPESA', 0, 0)

    // Handle arc
    ctx.strokeStyle = '#A83209'
    ctx.lineWidth = br * 0.22
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(0, -bh/2 + 2, br * 0.43, Math.PI, 0)
    ctx.stroke()

    // Yellow paint drip at bottom
    ctx.fillStyle = '#F2B544'
    const dx = br * 0.14
    ctx.beginPath(); ctx.arc(dx, bh/2 - 2, br*0.3, 0, Math.PI*2); ctx.fill()
    ctx.fillRect(dx - br*0.12, bh/2 - 3, br*0.24, br*0.62)
    ctx.beginPath(); ctx.arc(dx, bh/2 + br*0.62 - 3, br*0.22, 0, Math.PI*2); ctx.fill()

    ctx.restore()

    // ── Score during game ──
    if (phaseRef.current === 'playing') {
      const sc = String(scoreRef.current)
      const fs = Math.floor(H * 0.072)
      ctx.font = `900 ${fs}px -apple-system,Arial,sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = 'rgba(0,0,0,0.30)'
      ctx.fillText(sc, W/2 + 2, H*0.048 + 2)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(sc, W/2, H*0.048)
    }
  }, []) // all state in refs — zero deps

  // ── Update (physics + collisions) ────────────────────────────────────────
  const endGameRef = useRef<() => void>(() => {})

  const update = useCallback(() => {
    const W = CW.current, H = CH.current
    const gY = GY()
    const bhr = BHR()
    const pW = PW(), pG = PG()
    const bx = BX()

    // Physics
    birdVRef.current = Math.min(birdVRef.current + GRV(), MXV())
    birdYRef.current += birdVRef.current
    frameRef.current++

    // Spawn pipe
    const now = Date.now()
    if (now - lastPipeRef.current >= 1680) {
      const minY = H * 0.26
      const maxY = gY - H * 0.26
      const gapY = minY + Math.random() * (maxY - minY)
      pipesRef.current.push({ x: W + 12, gapY, scored: false })
      lastPipeRef.current = now
    }

    // Move + cull pipes
    const spd = PS()
    for (let i = pipesRef.current.length - 1; i >= 0; i--) {
      pipesRef.current[i].x -= spd
      if (pipesRef.current[i].x < -(pW + 30)) pipesRef.current.splice(i, 1)
    }

    // Score
    for (const p of pipesRef.current) {
      if (!p.scored && p.x + pW < bx) {
        p.scored = true
        scoreRef.current++
        setScore(s => s + 1)
      }
    }

    // Collisions
    const by = birdYRef.current
    if (by + bhr >= gY || by - bhr <= 0) { endGameRef.current(); return }
    for (const p of pipesRef.current) {
      if (bx + bhr > p.x && bx - bhr < p.x + pW) {
        if (by - bhr < p.gapY - pG/2 || by + bhr > p.gapY + pG/2) {
          endGameRef.current(); return
        }
      }
    }
  }, []) // all state in refs

  // ── Game loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    const loop = () => {
      if (phaseRef.current !== 'playing') return
      update()
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }, [update, draw])

  // ── End game ──────────────────────────────────────────────────────────────
  const endGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    phaseRef.current = 'over'
    setPhase('over')
    const final = scoreRef.current
    setScore(final)
    setSubmitted(false)
    setBest(prev => {
      const next = Math.max(prev, final)
      try { localStorage.setItem('ipesa_arcade_best', String(next)) } catch {}
      return next
    })
    draw() // draw final frame
  }, [draw])

  // Keep endGameRef current
  useEffect(() => { endGameRef.current = endGame }, [endGame])

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    birdYRef.current   = CH.current * 0.42
    birdVRef.current   = 0
    pipesRef.current   = []
    scoreRef.current   = 0
    frameRef.current   = 0
    lastPipeRef.current = Date.now() + 1400 // delay first pipe
    phaseRef.current   = 'playing'
    setPhase('playing')
    setScore(0)
    setSubmitted(false)
    startLoop()
  }, [startLoop])

  // ── Flap ──────────────────────────────────────────────────────────────────
  const flap = useCallback(() => {
    if (phaseRef.current === 'over') { startGame(); return }
    if (phaseRef.current === 'idle') { startGame(); return }
    birdVRef.current = FLV()
  }, [startGame])

  // ── Controls ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault(); flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap])

  // Redraw on canvas resize
  useEffect(() => {
    if (phaseRef.current !== 'playing') draw()
  }, [cvs, draw])

  // ── Leaderboard ───────────────────────────────────────────────────────────
  const loadLB = useCallback(async () => {
    setLoadingLB(true); setLbErr(false)
    try {
      const r = await fetch('/api/data/scores?game=snake')
      const d = await r.json()
      setLb(d.scores ?? [])
    } catch { setLbErr(true) } finally { setLoadingLB(false) }
  }, [])

  useEffect(() => { loadLB() }, [loadLB])

  const submitScore = async () => {
    if (!submitName.trim() || scoreRef.current === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/data/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_name: submitName.trim(), score: scoreRef.current, game: 'snake' }),
      })
      if (res.ok) { setSubmitted(true); await loadLB() }
    } finally { setSubmitting(false) }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  // ── Overlays ──────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: 'rgba(12,20,30,0.86)', backdropFilter: 'blur(5px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 6, padding: 20,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="section-head" style={{ marginBottom: 20 }}>
        <h2>🕹️ Arcade</h2>
      </div>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Game column ── */}
        <div style={{ flex: '1 1 240px', minWidth: 0 }} ref={wrapRef}>

          {/* Score bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Puntos', val: score, color: 'var(--ink)' },
              { label: 'Récord', val: best,  color: 'var(--ipesa-yellow)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Canvas */}
          <div
            style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 48px rgba(0,0,0,0.38)', cursor: 'pointer', userSelect: 'none' }}
            onClick={flap}
            onTouchStart={e => { e.preventDefault(); flap() }}
          >
            <canvas
              ref={canvasRef}
              width={cvs.w}
              height={cvs.h}
              style={{ display: 'block', width: cvs.w, height: cvs.h, maxWidth: '100%' }}
            />

            {/* ── Idle overlay ── */}
            {phase === 'idle' && (
              <div style={overlay}>
                <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 2 }}>🪣</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#EE5A24', letterSpacing: '-0.5px', textAlign: 'center' }}>
                  IPESA Flappy
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.65, marginBottom: 6 }}>
                  Vuela el bote de pintura entre los rodillos<br/>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Toca la pantalla · Clic · Espacio / ↑</span>
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.40)', marginBottom: 14 }}>
                  Hola, <span style={{ color: '#F2B544', fontWeight: 700 }}>{playerName}</span> 👋
                </div>
                <button
                  onPointerDown={e => { e.stopPropagation(); startGame() }}
                  style={{
                    padding: '13px 38px', fontSize: 16, fontWeight: 900, borderRadius: 14,
                    background: '#EE5A24', color: '#fff', border: 'none', cursor: 'pointer',
                    boxShadow: '0 6px 24px rgba(238,90,36,0.55)', letterSpacing: '0.02em',
                  }}>
                  ▶ Jugar
                </button>
              </div>
            )}

            {/* ── Game Over overlay ── */}
            {phase === 'over' && (
              <div style={overlay}>
                <div style={{ fontSize: 46, lineHeight: 1 }}>💥</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>¡Game Over!</div>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 44, fontWeight: 900, color: '#F2B544', lineHeight: 1.1 }}>{score}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>puntos</div>
                  {score > 0 && score >= best && score > 0 && (
                    <div style={{ fontSize: 13, color: '#4CAF50', fontWeight: 700, marginTop: 4 }}>🎉 ¡Nuevo récord personal!</div>
                  )}
                </div>

                {score > 0 && !submitted && (
                  <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 260, padding: '0 8px', boxSizing: 'border-box' }}>
                    <input
                      value={submitName}
                      onChange={e => setSubmitName(e.target.value)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') submitScore() }}
                      onClick={e => e.stopPropagation()}
                      placeholder="Tu nombre…"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: 'none', fontSize: 13, outline: 'none', background: 'rgba(255,255,255,0.94)' }}
                    />
                    <button
                      onPointerDown={e => { e.stopPropagation(); submitScore() }}
                      disabled={submitting || !submitName.trim()}
                      style={{ padding: '8px 14px', borderRadius: 9, background: '#F2B544', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', color: '#1A1410', opacity: submitting ? 0.6 : 1 }}>
                      {submitting ? '…' : '💾'}
                    </button>
                  </div>
                )}
                {submitted && <div style={{ fontSize: 13, color: '#4CAF50', fontWeight: 700 }}>✓ Score guardado</div>}

                <button
                  onPointerDown={e => { e.stopPropagation(); startGame() }}
                  style={{
                    marginTop: 6, padding: '11px 34px', fontSize: 15, fontWeight: 900,
                    borderRadius: 12, background: '#EE5A24', color: '#fff',
                    border: 'none', cursor: 'pointer', boxShadow: '0 4px 18px rgba(238,90,36,0.45)',
                  }}>
                  ↺ Reintentar
                </button>

                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 6 }}>
                  o toca la pantalla para reintentar
                </div>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted-2)', marginTop: 10 }}>
            {phase === 'idle' || phase === 'over'
              ? 'Toca · Clic · Espacio para jugar'
              : `Toca para volar · ${score} pt${score !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* ── Leaderboard column ── */}
        <div style={{ flex: '0 0 220px', minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            🏆 Ranking IPESA
          </div>

          {loadingLB ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: 'auto' }} />
            </div>
          ) : lbErr ? (
            <div style={{ padding: '14px 12px', borderRadius: 10, fontSize: 12, background: 'var(--ipesa-orange-soft)', color: 'var(--ipesa-orange)', lineHeight: 1.5 }}>
              ⚠️ Ranking no disponible.<br/>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Crea la tabla <code>game_scores</code> en Supabase.</span>
            </div>
          ) : lb.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '24px 12px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)', lineHeight: 1.6 }}>
              Sin scores aún.<br/><span style={{ fontSize: 12 }}>¡Sé el primero! 🚀</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lb.map((e, i) => (
                <LeaderRow key={e.id} rank={i+1} name={e.player_name} score={e.score} isMe={e.player_name === playerName} />
              ))}
            </div>
          )}

          <button onClick={loadLB}
            style={{ marginTop: 12, width: '100%', padding: '7px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 9, cursor: 'pointer' }}>
            ↻ Actualizar ranking
          </button>

          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.75 }}>
            <div style={{ fontWeight: 700, color: 'var(--ink)', marginBottom: 6, fontSize: 12.5 }}>Cómo jugar</div>
            <div>🪣 Eres el bote de pintura IPESA</div>
            <div>🎨 Pasa entre los rodillos de pintura</div>
            <div>💥 No toques las paredes ni el suelo</div>
            <div>🏆 Guarda tu score y compite</div>
            <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--paper)', borderRadius: 7, fontSize: 11, color: 'var(--muted-2)' }}>
              📱 Toca la pantalla para volar<br/>
              💻 Espacio / ↑ en desktop
            </div>
          </div>

          {lbErr && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>Ver SQL para activar ranking</summary>
              <pre style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 10.5, color: 'var(--ink-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{`CREATE TABLE game_scores (
  id uuid PRIMARY KEY
    DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  score integer NOT NULL,
  game text DEFAULT 'snake',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE game_scores
  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_open"
  ON game_scores FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);`}</pre>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
