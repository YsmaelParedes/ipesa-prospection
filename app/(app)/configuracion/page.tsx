'use client'

import { useEffect, useState, useCallback } from 'react'

/* ── Iconos ── */
const Ico = {
  trash:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  plus:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M12 5v14M5 12h14"/></svg>,
  check:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: 'var(--ipesa-yellow)' }}><path d="m5 13 4 4L19 7"/></svg>,
  tag:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M12 2H2v10l10 10 10-10L12 2z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>,
  channel: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
}

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

type ConfigItem = { id: string; type: string; label: string; created_at: string }

const CHIP_PALETTES = [
  { bg: '#FBE6DA', color: '#8A2F0A' }, { bg: '#DBEADF', color: '#1F5536' },
  { bg: '#DCE3EE', color: '#1F3A5F' }, { bg: '#FBEED2', color: '#8A6308' },
  { bg: '#F2DAEB', color: '#7B2A5D' }, { bg: '#DAEEDF', color: '#1B6634' },
  { bg: '#E0D8F0', color: '#4A2D8A' },
]
function chipColor(label: string) {
  let h = 5381
  for (let i = 0; i < label.length; i++) h = ((h << 5) + h) ^ label.charCodeAt(i)
  return CHIP_PALETTES[Math.abs(h) % CHIP_PALETTES.length]
}

/* ── Sección genérica de config ── */
function ConfigSection({ title, icon, type, description }: {
  title: string; icon: React.ReactNode; type: 'segment' | 'canal'; description: string
}) {
  const [items, setItems]       = useState<ConfigItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [toast, setToast]       = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/data/config?type=${type}`)
      const d = await r.json()
      setItems(d.items || [])
    } catch {} finally { setLoading(false) }
  }, [type])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    const trimmed = newLabel.trim()
    if (!trimmed) return
    if (items.some(i => norm(i.label) === norm(trimmed))) {
      setError(`Ya existe "${trimmed}" (sin distinguir mayúsculas ni acentos)`)
      return
    }
    setSaving(true); setError('')
    try {
      const r = await fetch('/api/data/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, label: trimmed }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setNewLabel('')
      showToast(`"${trimmed}" agregado ✓`)
      await load()
    } catch { setError('Error al guardar') } finally { setSaving(false) }
  }

  const handleDelete = async (id: string, label: string) => {
    await fetch(`/api/data/config/${id}`, { method: 'DELETE' })
    showToast(`"${label}" eliminado`)
    setConfirmDel(null)
    await load()
  }

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Encabezado de sección */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--ipesa-orange-soft)',
          color: 'var(--ipesa-orange)', display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{description}</div>
        </div>
        <span style={{
          marginLeft: 'auto', minWidth: 28, height: 22, borderRadius: 20,
          background: 'var(--paper)', border: '1px solid var(--line)',
          fontSize: 12, fontWeight: 700, color: 'var(--muted)',
          display: 'grid', placeItems: 'center', padding: '0 8px',
        }}>{items.length}</span>
      </div>

      {/* Lista de items */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 22, height: 22, border: '2.5px solid var(--line)', borderTopColor: 'var(--ipesa-orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {items.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0', background: 'var(--paper)', borderRadius: 10 }}>
              Sin {title.toLowerCase()} configurados aún
            </div>
          )}
          {items.map(item => {
            const { bg, color } = chipColor(item.label)
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', background: 'var(--card)',
                border: '1px solid var(--line)', borderRadius: 10,
                transition: 'background 0.1s',
              }}>
                <span className="chip" style={{ background: bg, color, fontSize: 12.5 }}>
                  <span className="chip-dot" style={{ background: color }} />
                  {item.label}
                </span>

                {confirmDel === item.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>¿Eliminar?</span>
                    <button
                      onClick={() => handleDelete(item.id, item.label)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--ipesa-rose)', background: 'var(--ipesa-rose-soft)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                      Sí
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      style={{ padding: '3px 10px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDel(item.id)}
                    title="Eliminar"
                    style={{ marginLeft: 'auto', padding: 6, borderRadius: 6, color: 'var(--muted-2)', background: 'none', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'color 0.1s, background 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ipesa-rose)'; (e.currentTarget as HTMLElement).style.background = 'var(--ipesa-rose-soft)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--muted-2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    <Ico.trash />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Formulario agregar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={newLabel}
          onChange={e => { setNewLabel(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder={`Nuevo ${title.slice(0, -1).toLowerCase()}…`}
          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none', transition: 'border-color 0.15s' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--ipesa-orange)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--line)')}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={!newLabel.trim() || saving}
          style={{ flexShrink: 0 }}>
          <Ico.plus /> {saving ? 'Guardando…' : 'Agregar'}
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--ipesa-rose)', marginTop: 6 }}>{error}</div>}

      {toast && (
        <div className="toast-fixed"><Ico.check /> {toast}</div>
      )}
    </div>
  )
}

/* ── Página principal ── */
export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'segment' | 'canal'>('segment')

  return (
    <>
      <div className="section-head">
        <h2>Configuración</h2>
      </div>

      {/* Sub-menú de tabs */}
      <div style={{
        display: 'flex', gap: 2, background: 'var(--card)', border: '1px solid var(--line)',
        borderRadius: 11, padding: 4, marginBottom: 28, width: 'fit-content',
      }}>
        <button
          onClick={() => setTab('segment')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === 'segment' ? 'var(--ink)' : 'transparent',
            color: tab === 'segment' ? '#fff' : 'var(--ink-2)',
            transition: 'all 0.15s',
          }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M12 2H2v10l10 10 10-10L12 2z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>
          Segmentos
        </button>
        <button
          onClick={() => setTab('canal')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '8px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === 'canal' ? 'var(--ink)' : 'transparent',
            color: tab === 'canal' ? '#fff' : 'var(--ink-2)',
            transition: 'all 0.15s',
          }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          Canales de adquisición
        </button>
      </div>

      {/* Contenido de la tab activa */}
      {tab === 'segment' ? (
        <ConfigSection
          key="segment"
          title="Segmentos"
          icon={<Ico.tag />}
          type="segment"
          description="Tipos de cliente disponibles en formularios de contacto y leads"
        />
      ) : (
        <ConfigSection
          key="canal"
          title="Canales de adquisición"
          icon={<Ico.channel />}
          type="canal"
          description="Orígenes de contacto disponibles al registrar contactos y leads"
        />
      )}
    </>
  )
}
