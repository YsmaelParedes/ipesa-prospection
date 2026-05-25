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

  // Canvas dims (refs so game loop always sees latest value)
  const CW = useRef(300); const CH = useRef(375)
  const [cvs, setCvs] = useState({ w: 300, h: 375 })

  // ─── Game state — ALL refs, zero re-renders during play ───────────────────
  const phaseRef    = useRef<Phase>('idle')
  const birdYRef    = useRef(0)
  const birdVRef    = useRef(0)
  const pipesRef    = useRef<Pipe[]>([])
  const scoreRef    = useRef(0)
  const frameRef    = useRef(0)   // accumulates delta-time units (not raw frames)
  const lastPipeRef = useRef(0)
  const squashRef   = useRef(0)   // squash-&-stretch juice: 1 = full squash, 0 = normal

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [score,      setScore]      = useState(0)
  const [best,       setBest]       = useState(0)
  const [lb,         setLb]         = useState<LBRow[]>([])
  const [playerName, setPlayerName] = useState('Jugador')
  const [submitName, setSubmitName] = useState('Jugador')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [savedMsg,   setSavedMsg]   = useState('')
  const [loadingLB,  setLoadingLB]  = useState(true)
  const [lbErr,      setLbErr]      = useState(false)

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
      const w   = Math.min(Math.max(raw, 240), 400)
      // 1.30 aspect — comfortable on mobile without overflowing
      const idealH = Math.floor(w * 1.30)
      const maxH   = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.64) : idealH
      const h      = Math.max(Math.min(idealH, maxH), 290)
      CW.current = w; CH.current = h
      setCvs({ w, h })
    }
    update()
    const ro = new ResizeObserver(update)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Physics constants — all expressed per "60fps frame equivalent"
  // Delta-time normalization makes these accurate at ANY refresh rate.
  // ─────────────────────────────────────────────────────────────────────────
  const GH  = () => Math.floor(CH.current * 0.09)          // ground height
  const GY  = () => CH.current - GH()                       // ground top Y
  const BX  = () => Math.floor(CW.current * 0.22)           // bird fixed X
  const BR  = () => Math.floor(CW.current * 0.065)          // bird draw radius
  const BHR = () => BR() * 0.48                             // hitbox radius (forgiving)
  const PW  = () => Math.floor(CW.current * 0.165)          // pipe width
  const PG  = () => Math.floor(CH.current * 0.37)           // gap height (generous)
  const PS  = () => CW.current * 0.0052                     // pipe speed per 60fps frame
  //
  // GRAVITY: lighter = more floaty. Classic Flappy uses ~0.0009-0.0012 of height.
  const GRV = () => CH.current * 0.00062                   // gravity per 60fps frame
  //
  // FLAP: impulse applied instantly. Should give ~23–27% of canvas height rise.
  // Rise height = FLV² / (2 * GRV). With CH=450: 8.19²/(2*0.279) = 67/0.558 = 120px = 26.7% ✓
  const FLV = () => -(CH.current * 0.0182)                 // flap velocity (upward impulse)
  //
  // MAX FALL: cap so the bird doesn't plummet like a rock
  const MXV = () => CH.current * 0.020                     // max fall velocity

  // ── Draw ──────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W  = CW.current, H = CH.current
    const gY = GY(), gH = GH()
    const bx = BX(), br = BR()
    const pW = PW(), pG = PG()
    const by = birdYRef.current
    const vy = birdVRef.current
    const fr = frameRef.current          // accumulated (smooth at any fps)
    const sq = squashRef.current         // squash-&-stretch factor

    // ── Sky gradient ──
    const sky = ctx.createLinearGradient(0, 0, 0, gY)
    sky.addColorStop(0,   '#7BB8D8')
    sky.addColorStop(0.5, '#A8C8E8')
    sky.addColorStop(1,   '#D4EAF5')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, gY)

    // ── Clouds (parallax: background slow, foreground fast) ──
    const drawCloud = (ox: number, oy: number, r: number, speed: number, alpha: number) => {
      const cx = ((ox * W + fr * speed) % (W + 160)) - 80
      const cy = oy * H
      const rr = r * W
      ctx.fillStyle = `rgba(255,255,255,${alpha})`
      ctx.beginPath()
      ctx.arc(cx,           cy,           rr,         0, Math.PI * 2)
      ctx.arc(cx + rr*0.8,  cy - rr*0.35, rr * 0.75,  0, Math.PI * 2)
      ctx.arc(cx + rr*1.55, cy,           rr * 0.60,  0, Math.PI * 2)
      ctx.fill()
    }
    drawCloud(0.05, 0.09, 0.066, 0.18, 0.60)  // back, slow, faint
    drawCloud(0.42, 0.06, 0.052, 0.26, 0.75)  // mid
    drawCloud(0.75, 0.12, 0.044, 0.36, 0.88)  // front, fast, bright

    // ── Pipes ──
    pipesRef.current.forEach(pipe => {
      const topH  = pipe.gapY - pG / 2
      const botY  = pipe.gapY + pG / 2
      const capH  = Math.max(8, Math.floor(H * 0.034))
      const capPd = Math.floor(W * 0.022)

      const pGrad = ctx.createLinearGradient(pipe.x, 0, pipe.x + pW, 0)
      pGrad.addColorStop(0,   '#145530')
      pGrad.addColorStop(0.3, '#1E7A44')
      pGrad.addColorStop(0.6, '#28A85C')
      pGrad.addColorStop(1,   '#145530')

      const capG = ctx.createLinearGradient(pipe.x - capPd, 0, pipe.x + pW + capPd, 0)
      capG.addColorStop(0,   '#0F3D22')
      capG.addColorStop(0.45, '#35D470')
      capG.addColorStop(1,   '#0F3D22')

      // Top pipe body
      if (topH - capH > 0) {
        ctx.fillStyle = pGrad
        ctx.fillRect(pipe.x, 0, pW, topH - capH)
        // subtle highlight stripe
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fillRect(pipe.x + 3, 0, pW * 0.25, topH - capH)
      }
      // Top cap
      ctx.fillStyle = capG
      rrect(ctx, pipe.x - capPd, topH - capH, pW + capPd * 2, capH + 1, 5)
      ctx.fill()

      // Top paint drip
      ctx.fillStyle = '#F2B544'
      ctx.beginPath()
      ctx.ellipse(pipe.x + pW * 0.38, topH + 2, capH * 0.28, capH * 0.18, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(pipe.x + pW * 0.38 - capH * 0.14, topH, capH * 0.28, capH * 1.1)
      ctx.beginPath()
      ctx.ellipse(pipe.x + pW * 0.38, topH + capH * 1.1, capH * 0.20, capH * 0.20, 0, 0, Math.PI * 2)
      ctx.fill()

      // Bottom pipe body
      if (gY - botY - capH > 0) {
        ctx.fillStyle = pGrad
        ctx.fillRect(pipe.x, botY + capH, pW, gY - botY - capH)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.fillRect(pipe.x + 3, botY + capH, pW * 0.25, gY - botY - capH)
      }
      // Bottom cap
      ctx.fillStyle = capG
      rrect(ctx, pipe.x - capPd, botY - 1, pW + capPd * 2, capH + 1, 5)
      ctx.fill()

      // Bottom paint drip
      ctx.fillStyle = '#EE5A24'
      ctx.beginPath()
      ctx.ellipse(pipe.x + pW * 0.62, botY + capH - 2, capH * 0.28, capH * 0.18, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillRect(pipe.x + pW * 0.62 - capH * 0.14, botY + capH, capH * 0.28, capH * 0.9)
      ctx.beginPath()
      ctx.ellipse(pipe.x + pW * 0.62, botY + capH * 1.9, capH * 0.19, capH * 0.19, 0, 0, Math.PI * 2)
      ctx.fill()
    })

    // ── Ground ──
    // Dirt base
    ctx.fillStyle = '#5C3A1E'
    ctx.fillRect(0, gY, W, gH)
    // IPESA orange stripe
    const stripeH = Math.max(3, Math.floor(gH * 0.22))
    ctx.fillStyle = '#EE5A24'
    ctx.fillRect(0, gY, W, stripeH)
    // Animated paint blobs on ground
    for (let i = 0; i < 6; i++) {
      const blobX = ((i * 83 + fr * 0.52) % (W + 60)) - 30
      ctx.fillStyle = i % 2 === 0 ? 'rgba(242,181,68,0.90)' : 'rgba(238,90,36,0.60)'
      ctx.beginPath()
      ctx.ellipse(blobX, gY + stripeH * 0.6, 10, 5, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Ground top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, gY, W, 2)

    // ── Bird (IPESA paint can) with squash & stretch ──
    const maxV  = MXV()
    // Angle: nose dips down when falling, up when rising (capped for aesthetics)
    const angle = Math.max(-0.42, Math.min(0.62, (vy / maxV) * 0.62))
    const bw = br * 1.80, bh = br * 2.20, brad = br * 0.30

    // Squash & stretch: on flap (sq=1) the can squashes wide & short; returns to normal
    const scaleX = 1 + sq * 0.28
    const scaleY = 1 - sq * 0.16

    ctx.save()
    ctx.translate(bx, by)
    ctx.rotate(angle)
    ctx.scale(scaleX, scaleY)

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.beginPath()
    ctx.ellipse(3, bh / 2 + 7, bw * 0.46, 6, 0, 0, Math.PI * 2)
    ctx.fill()

    // Can body gradient (left-to-right light)
    const cg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0)
    cg.addColorStop(0,    '#B83508')
    cg.addColorStop(0.28, '#FF6030')
    cg.addColorStop(0.65, '#EE4A18')
    cg.addColorStop(1,    '#B83508')
    ctx.fillStyle = cg
    rrect(ctx, -bw / 2, -bh / 2, bw, bh, brad)
    ctx.fill()

    // Body rim highlight (left edge glow)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    rrect(ctx, -bw / 2 + 2, -bh / 2 + 2, bw * 0.32, bh * 0.38, brad * 0.5)
    ctx.fill()

    // White label area
    const labelY = -br * 0.50, labelH = br * 1.04
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillRect(-bw / 2 + 4, labelY, bw - 8, labelH)

    // IPESA brand text
    const fontSize = Math.max(7, Math.floor(br * 0.50))
    ctx.fillStyle = '#B83508'
    ctx.font = `800 ${fontSize}px -apple-system, "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('IPESA', 0, labelY + labelH / 2)

    // Can handle
    ctx.strokeStyle = '#8C2808'
    ctx.lineWidth   = Math.max(1.5, br * 0.20)
    ctx.lineCap     = 'round'
    ctx.beginPath()
    ctx.arc(0, -bh / 2 + 2, br * 0.42, Math.PI, 0)
    ctx.stroke()

    // Yellow paint drip at bottom
    const dx = br * 0.12
    ctx.fillStyle = '#F2B544'
    ctx.beginPath()
    ctx.ellipse(dx, bh / 2 - 3, br * 0.28, br * 0.18, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(dx - br * 0.11, bh / 2 - 3, br * 0.22, br * 0.70)
    ctx.beginPath()
    ctx.ellipse(dx, bh / 2 + br * 0.70 - 3, br * 0.19, br * 0.19, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    // ── Score overlay during play ──
    if (phaseRef.current === 'playing') {
      const sc = String(scoreRef.current)
      const fs = Math.floor(H * 0.075)
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.font = `900 ${fs}px -apple-system, "Helvetica Neue", Arial, sans-serif`
      ctx.fillText(sc, W / 2 + 2, H * 0.046 + 2)
      // White
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(sc, W / 2, H * 0.046)
    }
  }, []) // reads only from refs — safe with empty deps

  // ─────────────────────────────────────────────────────────────────────────
  // Update — receives delta-time (dt) normalized to 60fps equivalents.
  //
  // dt = 1.0  → exactly 1/60 second elapsed (60Hz display, on schedule)
  // dt = 0.5  → half a frame elapsed (game is running at 120Hz display)
  // dt = 2.0  → two frames elapsed (lag spike)
  //
  // By multiplying all physics by dt, the game is frame-rate independent.
  // ─────────────────────────────────────────────────────────────────────────
  const endGameRef = useRef<(() => void) | null>(null)

  const update = useCallback((dt: number) => {
    const W  = CW.current, H = CH.current
    const gY = GY()
    const bhr = BHR()
    const pW  = PW(), pG = PG()
    const bx  = BX()

    // ── Physics ──
    birdVRef.current  = Math.min(birdVRef.current + GRV() * dt, MXV())
    birdYRef.current += birdVRef.current * dt

    // ── Squash decay (visual only) ──
    squashRef.current = Math.max(0, squashRef.current - 0.09 * dt)

    // ── Frame accumulator (used for animations) ──
    frameRef.current += dt

    // ── Pipe difficulty: speed scales up gently with score ──
    // +3.5% per point, capped at 2.2× — so 0 pts = normal, 18 pts ≈ 2x speed
    const speedMult = Math.min(1 + scoreRef.current * 0.035, 2.2)
    const spd = PS() * dt * speedMult

    // ── Pipe spawning — interval shrinks with difficulty ──
    // Start: 2200ms between pipes, min 1300ms at high score
    const spawnMs = Math.max(1300, 2200 - scoreRef.current * 45)
    const now = Date.now()
    if (now - lastPipeRef.current >= spawnMs) {
      const margin = pG / 2 + H * 0.15   // keep gap away from ceiling and ground
      const minGapY = margin
      const maxGapY = gY - margin
      pipesRef.current.push({
        x: W + 16,
        gapY: minGapY + Math.random() * (maxGapY - minGapY),
        scored: false,
      })
      lastPipeRef.current = now
    }

    // ── Move pipes, cull off-screen ──
    for (let i = pipesRef.current.length - 1; i >= 0; i--) {
      pipesRef.current[i].x -= spd
      if (pipesRef.current[i].x < -(pW + 40)) pipesRef.current.splice(i, 1)
    }

    // ── Score ──
    for (const p of pipesRef.current) {
      if (!p.scored && p.x + pW < bx) {
        p.scored = true
        scoreRef.current++
        setScore(s => s + 1)
      }
    }

    // ── Collision ──
    const by = birdYRef.current
    if (by + bhr >= gY || by - bhr <= 0) { endGameRef.current?.(); return }
    for (const p of pipesRef.current) {
      if (bx + bhr > p.x && bx - bhr < p.x + pW) {
        if (by - bhr < p.gapY - pG / 2 || by + bhr > p.gapY + pG / 2) {
          endGameRef.current?.(); return
        }
      }
    }
  }, []) // all state in refs

  // ─────────────────────────────────────────────────────────────────────────
  // Game loop — delta-time from RAF timestamp (DOMHighResTimeStamp).
  // This is the KEY fix: dt normalizes physics to 60fps equivalents,
  // so the game plays identically at 60Hz, 90Hz, 120Hz, or 144Hz.
  // ─────────────────────────────────────────────────────────────────────────
  const startLoop = useCallback(() => {
    let lastTimestamp = 0
    const loop = (timestamp: number) => {
      if (phaseRef.current !== 'playing') return

      // On first frame, dt = 1 (don't apply a massive jump)
      const rawMs = lastTimestamp === 0 ? 1000 / 60 : timestamp - lastTimestamp
      lastTimestamp = timestamp

      // Normalize to 60fps units. Clamp max to 4 frames (handles tab switch / lag spikes).
      const dt = Math.min(rawMs / (1000 / 60), 4)

      update(dt)
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
    setSubmitted(false); setSavedMsg('')
    setBest(prev => {
      const next = Math.max(prev, final)
      try { localStorage.setItem('ipesa_arcade_best', String(next)) } catch {}
      return next
    })
    draw()
  }, [draw])

  useEffect(() => { endGameRef.current = endGame }, [endGame])

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)

    // Start bird slightly above center, with a gentle upward impulse.
    // Without this, the bird would immediately start falling — no reaction time.
    birdYRef.current    = CH.current * 0.38
    birdVRef.current    = FLV() * 0.52          // ← soft upward boost on start
    squashRef.current   = 0.4                    // tiny squash on launch feels good
    pipesRef.current    = []
    scoreRef.current    = 0
    frameRef.current    = 0
    lastPipeRef.current = Date.now() + 1700     // 1.7s grace before first pipe

    phaseRef.current = 'playing'
    setPhase('playing')
    setScore(0)
    setSubmitted(false); setSavedMsg('')
    startLoop()
  }, [startLoop])

  // ── Flap — called only during play ────────────────────────────────────────
  const flap = useCallback(() => {
    if (phaseRef.current !== 'playing') return
    birdVRef.current  = FLV()   // instant upward impulse
    squashRef.current = 1       // trigger squash animation
  }, [])

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        if (phaseRef.current === 'playing') {
          birdVRef.current  = FLV()
          squashRef.current = 1
        } else {
          startGame()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startGame])

  // Redraw on canvas resize (idle/over states)
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
        body: JSON.stringify({ player_name: submitName.trim(), score: scoreRef.current, game: 'flappy' }),
      })
      if (res.ok) {
        const json = await res.json()
        const saved = json.score
        // El backend devuelve el score guardado (existente o actualizado)
        if (saved && saved.score > scoreRef.current) {
          // El récord existente es mayor — no se actualizó
          setSavedMsg(`Tu récord es ${saved.score} pts — ¡intenta superarlo!`)
        } else {
          setSavedMsg('✓ ¡Score guardado en el ranking!')
        }
        setSubmitted(true)
        await loadLB()
      }
    } finally { setSubmitting(false) }
  }

  useEffect(() => () => { cancelAnimationFrame(rafRef.current) }, [])

  // ── Overlay base style ────────────────────────────────────────────────────
  const overlayBase: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: 'rgba(10,18,28,0.90)', backdropFilter: 'blur(6px)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 24, cursor: 'pointer',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="section-head" style={{ marginBottom: 20 }}>
        <h2>🕹️ Arcade</h2>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Game column ── */}
        <div style={{ flex: '1 1 260px', minWidth: 0, maxWidth: 420 }} ref={wrapRef}>

          {/* Score bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Puntos', val: score, color: 'var(--ink)' },
              { label: 'Récord', val: best,  color: 'var(--ipesa-yellow)' },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                textAlign: 'center', padding: '10px 8px',
                background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)',
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* ── Canvas wrapper ──
              Architecture:
              · Canvas   → onPointerDown fires flap() during play
              · Overlays → absolute siblings stacked above canvas; own pointer events
              · Score    → outside wrapper, normal DOM flow (no keyboard-push bugs)
          ── */}
          <div style={{
            position: 'relative', borderRadius: 18, overflow: 'hidden',
            boxShadow: '0 10px 50px rgba(0,0,0,0.42)', userSelect: 'none',
          }}>
            {/* Canvas */}
            <canvas
              ref={canvasRef}
              width={cvs.w}
              height={cvs.h}
              style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none', cursor: 'pointer' }}
              onPointerDown={e => { e.preventDefault(); flap() }}
            />

            {/* ── Idle overlay ── */}
            {phase === 'idle' && (
              <div style={overlayBase} onPointerDown={e => { e.preventDefault(); startGame() }}>
                <div style={{ fontSize: 54, lineHeight: 1, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}>🪣</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#EE5A24', textAlign: 'center', letterSpacing: '-0.5px', textShadow: '0 2px 8px rgba(238,90,36,0.6)' }}>
                  IPESA Flappy
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.52)', textAlign: 'center', lineHeight: 1.7 }}>
                  Vuela el bote de pintura entre los rodillos
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', marginBottom: 10 }}>
                  Hola, <span style={{ color: '#F2B544', fontWeight: 700 }}>{playerName}</span> 👋
                </div>
                <button
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); startGame() }}
                  style={{
                    padding: '14px 44px', fontSize: 17, fontWeight: 900, borderRadius: 14,
                    background: 'linear-gradient(135deg, #FF6030, #EE4A18)',
                    color: '#fff', border: 'none', cursor: 'pointer',
                    boxShadow: '0 6px 28px rgba(238,90,36,0.65)',
                    letterSpacing: '0.02em',
                  }}>
                  ▶ Jugar
                </button>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>
                  Toca pantalla · Espacio / ↑ para volar
                </div>
              </div>
            )}

            {/* ── Game Over overlay ── */}
            {phase === 'over' && (
              <div style={overlayBase} onPointerDown={e => { e.preventDefault(); startGame() }}>
                <div style={{ fontSize: 42, lineHeight: 1 }}>💥</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                  ¡Game Over!
                </div>
                <div style={{ textAlign: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 52, fontWeight: 900, color: '#F2B544', lineHeight: 1, textShadow: '0 3px 12px rgba(242,181,68,0.6)' }}>
                    {score}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', marginTop: 3 }}>puntos</div>
                  {score > 0 && score >= best && (
                    <div style={{ fontSize: 13, color: '#52D073', fontWeight: 700, marginTop: 8, textShadow: '0 1px 6px rgba(82,208,115,0.5)' }}>
                      🎉 ¡Nuevo récord personal!
                    </div>
                  )}
                </div>
                <button
                  onPointerDown={e => { e.stopPropagation(); e.preventDefault(); startGame() }}
                  style={{
                    marginTop: 6, padding: '13px 38px', fontSize: 16, fontWeight: 900,
                    borderRadius: 13, color: '#fff', border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #FF6030, #EE4A18)',
                    boxShadow: '0 5px 22px rgba(238,90,36,0.55)',
                  }}>
                  ↺ Reintentar
                </button>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 4 }}>
                  o toca la pantalla
                </div>
              </div>
            )}
          </div>

          {/* ── Score submission (outside canvas, no keyboard-push issues) ── */}
          {phase === 'over' && score > 0 && !submitted && (
            <div style={{
              marginTop: 14, padding: '14px 16px',
              background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)',
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Guardar score — {score} pt{score !== 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={submitName}
                  onChange={e => setSubmitName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitScore() }}
                  placeholder="Tu nombre…"
                  autoComplete="off"
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 9,
                    border: '1px solid var(--line)', fontSize: 13.5,
                    outline: 'none', background: 'var(--paper)', boxSizing: 'border-box',
                  }}
                  onFocus={e  => (e.currentTarget.style.borderColor = 'var(--ipesa-orange)')}
                  onBlur={e   => (e.currentTarget.style.borderColor = 'var(--line)')}
                />
                <button
                  onClick={submitScore}
                  disabled={submitting || !submitName.trim()}
                  style={{
                    padding: '9px 16px', borderRadius: 9, border: 'none',
                    background: 'var(--ipesa-orange)', color: '#fff',
                    fontWeight: 800, fontSize: 13, cursor: 'pointer',
                    opacity: (submitting || !submitName.trim()) ? 0.55 : 1,
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                  {submitting ? '…' : '💾 Guardar'}
                </button>
              </div>
            </div>
          )}

          {phase === 'over' && submitted && (
            <div style={{
              marginTop: 12, padding: '12px 16px', textAlign: 'center',
              background: savedMsg.startsWith('✓') ? '#DBEADF' : 'var(--ipesa-orange-soft)',
              borderRadius: 12,
              border: `1px solid ${savedMsg.startsWith('✓') ? 'rgba(61,139,92,0.35)' : 'rgba(238,90,36,0.35)'}`,
              color: savedMsg.startsWith('✓') ? '#1F5536' : 'var(--ipesa-orange)',
              fontWeight: 700, fontSize: 13,
            }}>
              {savedMsg}
            </div>
          )}

          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted-2)', marginTop: 10 }}>
            {phase === 'playing'
              ? `Toca para volar · ${score} pt${score !== 1 ? 's' : ''}`
              : 'Toca la pantalla · Espacio / ↑ para jugar'}
          </div>
        </div>

        {/* ── Leaderboard column ── */}
        <div style={{ flex: '0 0 210px', minWidth: 190 }}>
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

          <button onClick={loadLB} style={{ marginTop: 12, width: '100%', padding: '7px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 9, cursor: 'pointer' }}>
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
              <summary style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>
                Ver SQL para activar ranking
              </summary>
              <pre style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--line)', fontSize: 10.5, color: 'var(--ink-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{`CREATE TABLE game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  score integer NOT NULL,
  game text DEFAULT 'snake',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores_open" ON game_scores
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);`}</pre>
            </details>
          )}
        </div>
      </div>
    </>
  )
}
