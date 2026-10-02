'use client'

import { useEffect, useMemo, useState } from 'react'
import type { WhatsAppTemplateDef } from '@/lib/whatsappTemplates'

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: 'var(--muted-2)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
)

export type WhatsAppTemplateSelection = {
  templateName: string
  language: string
  bodyPreview: string   // texto crudo con {{n}}, para que el servidor arme el texto guardado sin volver a consultar Meta
  savedImageUrl: string
  personalize: boolean  // {{1}} = primer nombre de cada contacto
  bodyParams: string[]  // valores fijos para {{1}}…{{n}} (el {{1}} se ignora si personalize)
  category?: string
  ready: boolean
}

const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Servicio', AUTHENTICATION: 'Autenticación' }

// Plantillas compartidas entre todos los selectores abiertos de la sesión
let templatesPromise: Promise<{ templates: WhatsAppTemplateDef[]; error: string }> | null = null
function loadTemplates() {
  templatesPromise ??= fetch('/api/whatsapp/templates')
    .then(r => r.json())
    .then(d => ({ templates: d.templates ?? [], error: d.error ?? '' }))
    .catch(() => { templatesPromise = null; return { templates: [], error: 'No se pudieron consultar las plantillas en Meta' } })
  return templatesPromise
}

/**
 * Selector de plantilla + vista previa tipo burbuja de WhatsApp + imagen de
 * encabezado (se guarda una vez por plantilla en Supabase Storage y se
 * reutiliza automáticamente) + valores de las variables {{n}}.
 */
export function WhatsAppTemplatePicker({
  exampleName, onChange,
}: {
  exampleName: string
  onChange: (sel: WhatsAppTemplateSelection) => void
}) {
  const [templates, setTemplates] = useState<WhatsAppTemplateDef[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templatesError, setTemplatesError] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const template = templates.find(t => `${t.name}|${t.language}` === templateKey)

  const [savedImageUrl, setSavedImageUrl] = useState('')
  const [checkingImage, setCheckingImage] = useState(false)
  const [replacingImage, setReplacingImage] = useState(false)
  const [localPreviewUrl, setLocalPreviewUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [personalize, setPersonalize] = useState(true)
  const [params, setParams] = useState<string[]>([])

  const varCount = template?.variableCount ?? (template ? new Set(Array.from(template.bodyPreview.matchAll(/\{\{\s*(\d+)\s*\}\}/g), m => m[1])).size : 0)
  // Sin {{1}} en el cuerpo no tiene sentido personalizar: Meta rechazaría el
  // envío entero con "Number of parameters does not match" (#132000).
  const effectivePersonalize = personalize && varCount > 0
  const values = useMemo(() => Array.from({ length: varCount }, (_, i) => (i === 0 && effectivePersonalize ? exampleName : params[i] ?? '')), [varCount, effectivePersonalize, exampleName, params])
  const missingValue = values.some((v, i) => !(i === 0 && effectivePersonalize) && !v.trim())

  const previewBody = template?.bodyPreview.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => values[Number(n) - 1]?.trim() || m) ?? ''
  const imageToShow = localPreviewUrl || savedImageUrl
  const hasImageReady = !template?.hasImageHeader || !!savedImageUrl
  const ready = !!template && !template.unsupported && hasImageReady && !uploadingImage && !checkingImage && !missingValue

  // Plantillas aprobadas en vivo desde Meta; si falla se muestra el motivo.
  useEffect(() => {
    loadTemplates().then(({ templates: list, error }) => {
      setTemplates(list)
      setTemplatesError(error)
      const firstUsable = list.find(t => !t.unsupported) ?? list[0]
      setTemplateKey(prev => (prev && list.some(t => `${t.name}|${t.language}` === prev)) ? prev : firstUsable ? `${firstUsable.name}|${firstUsable.language}` : '')
    }).finally(() => setLoadingTemplates(false))
  }, [])

  // Al elegir/cambiar de plantilla, revisa si ya hay una imagen guardada para ella
  useEffect(() => {
    setParams([])
    if (!template?.hasImageHeader) { setSavedImageUrl(''); return }
    setCheckingImage(true); setSavedImageUrl(''); setLocalPreviewUrl(''); setReplacingImage(false)
    fetch(`/api/whatsapp/template-image?template=${encodeURIComponent(template.name)}`)
      .then(r => r.json())
      .then(d => setSavedImageUrl(d.url || ''))
      .catch(() => {})
      .finally(() => setCheckingImage(false))
  }, [template?.name, template?.hasImageHeader])

  // Libera la URL temporal de la vista previa local
  useEffect(() => () => { if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl) }, [localPreviewUrl])

  useEffect(() => {
    onChange({
      templateName: template?.name ?? '',
      language: template?.language ?? 'es_MX',
      bodyPreview: template?.bodyPreview ?? '',
      savedImageUrl,
      personalize: effectivePersonalize,
      bodyParams: values.map((v, i) => (i === 0 && effectivePersonalize ? '' : v.trim())),
      category: template?.category,
      ready,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey, savedImageUrl, effectivePersonalize, ready, values.join('\u0000')])

  const handleFile = async (file: File | undefined) => {
    if (!file || !template) return
    if (!/^image\/(jpeg|png)$/.test(file.type)) { setUploadError('Usa una imagen JPG o PNG (son los formatos que acepta WhatsApp).'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('La imagen excede 5 MB.'); return }
    setLocalPreviewUrl(URL.createObjectURL(file))
    setUploadError(''); setUploadingImage(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('template', template.name)
      const r = await fetch('/api/whatsapp/template-image', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) { setUploadError(d.error || 'Error al subir la imagen'); return }
      setSavedImageUrl(d.url)
      setReplacingImage(false)
    } catch {
      setUploadError('Error de red al subir la imagen')
    } finally {
      setUploadingImage(false)
    }
  }

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }

  return (
    <div>
      <div className="field">
        <label>Plantilla</label>
        {loadingTemplates ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Consultando plantillas aprobadas en Meta…</div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>No hay plantillas aprobadas disponibles.</div>
        ) : (
          <select value={templateKey} onChange={e => setTemplateKey(e.target.value)}>
            {templates.map(t => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.label}{t.category ? ` · ${CATEGORY_LABEL[t.category] ?? t.category}` : ''}{t.unsupported ? ' (no compatible)' : ''}
              </option>
            ))}
          </select>
        )}
        {templatesError && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>⚠️ {templatesError}</div>}
      </div>

      {template?.unsupported && (
        <div className="wa-warn">Esta plantilla no se puede enviar desde la app: {template.unsupported.toLowerCase()}. Elige otra o envíala desde el administrador de WhatsApp de Meta.</div>
      )}

      {template && (
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {/* Vista previa tipo burbuja de WhatsApp */}
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <span style={labelStyle}>Vista previa</span>
            <div className="wa-preview">
              <div className="wa-preview-bubble">
                {template.hasImageHeader && (
                  <div className="wa-preview-img">
                    {imageToShow ? <img src={imageToShow} alt="Encabezado" /> : <ImageIcon />}
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{previewBody}</div>
                  {template.footer && <div style={{ fontSize: 11.5, color: '#8696a0', marginTop: 6 }}>{template.footer}</div>}
                </div>
                {template.buttonLabel && <div className="wa-preview-btn">↩ {template.buttonLabel}</div>}
              </div>
            </div>
          </div>

          {/* Configuración */}
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {template.hasImageHeader && (
              <div>
                <span style={labelStyle}>Imagen de encabezado *</span>
                {checkingImage ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Revisando…</div>
                ) : savedImageUrl && !replacingImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--success)', fontWeight: 600 }}>✓ Ya guardada, se reutiliza automáticamente</span>
                    <button type="button" onClick={() => setReplacingImage(true)} className="wa-link-btn">Cambiar</button>
                  </div>
                ) : (
                  <>
                    <input type="file" accept="image/jpeg,image/png" onChange={e => handleFile(e.target.files?.[0])} style={{ fontSize: 12.5, maxWidth: '100%' }} />
                    {uploadingImage && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Subiendo…</div>}
                    {savedImageUrl && !uploadingImage && (
                      <button type="button" onClick={() => setReplacingImage(false)} className="wa-link-btn muted" style={{ marginTop: 6 }}>
                        Cancelar, usar la que ya estaba
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {varCount > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ ...labelStyle, marginBottom: 0 }}>Variables del mensaje</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={personalize} onChange={e => setPersonalize(e.target.checked)} />
                  {'{{1}}'} = nombre de cada contacto
                </label>
                {Array.from({ length: varCount }, (_, i) => (i === 0 && effectivePersonalize) ? null : (
                  <div className="field" key={i} style={{ marginBottom: 0 }}>
                    <label>Valor de {`{{${i + 1}}}`}</label>
                    <input value={params[i] ?? ''} maxLength={200} onChange={e => setParams(p => { const n = [...p]; n[i] = e.target.value; return n })} placeholder={i === 0 ? 'Ej. cliente' : 'Texto igual para todos'} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Esta plantilla no tiene variables — el texto es el mismo para todos.</div>
            )}
          </div>
        </div>
      )}

      {uploadError && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 12 }}>{uploadError}</div>}
    </div>
  )
}
