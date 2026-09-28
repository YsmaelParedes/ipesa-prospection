'use client'

import { useEffect, useState } from 'react'
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateDef } from '@/lib/whatsappTemplates'

const Ico = {
  image: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22, color: 'var(--muted-2)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>,
}

export type WhatsAppTemplateSelection = {
  templateName: string
  language: string
  bodyPreview: string   // texto crudo con {{1}}, para que el servidor arme el texto guardado sin volver a consultar Meta
  savedImageUrl: string
  personalize: boolean
  ready: boolean
}

/**
 * Selector de plantilla + vista previa tipo burbuja de WhatsApp + imagen de
 * encabezado (se guarda una vez por plantilla en Supabase Storage y se
 * reutiliza automáticamente). Usado tanto en el envío por contactos
 * seleccionados (Contactos) como en el panel de Campañas (WhatsApp).
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
  const [templateName, setTemplateName] = useState('')
  const template = templates.find(t => t.name === templateName)

  const [savedImageUrl, setSavedImageUrl] = useState('')
  const [checkingImage, setCheckingImage] = useState(false)
  const [replacingImage, setReplacingImage] = useState(false)
  const [localPreviewUrl, setLocalPreviewUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [personalize, setPersonalize] = useState(true)
  const [uploadError, setUploadError] = useState('')

  // Solo tiene sentido mandar el parámetro de personalización si la
  // plantilla realmente trae {{1}} en el cuerpo — si no, Meta rechaza el
  // envío entero con "Number of parameters does not match" (#132000).
  const hasBodyVariable = /\{\{\d+\}\}/.test(template?.bodyPreview ?? '')
  const effectivePersonalize = personalize && hasBodyVariable

  const previewBody = template?.bodyPreview.replace('{{1}}', effectivePersonalize ? exampleName : '{{1}}') ?? ''
  const imageToShow = localPreviewUrl || savedImageUrl
  const hasImageReady = !template?.hasImageHeader || !!savedImageUrl
  const ready = !!template && hasImageReady && !uploadingImage && !checkingImage

  // Plantillas aprobadas: se consultan en vivo a Meta; si falla (o falta
  // configurar WHATSAPP_BUSINESS_ACCOUNT_ID) cae al catálogo local fijo.
  useEffect(() => {
    fetch('/api/whatsapp/templates')
      .then(r => r.json())
      .then(d => {
        if (d.error) setTemplatesError(d.error)
        const list: WhatsAppTemplateDef[] = d.templates?.length ? d.templates : WHATSAPP_TEMPLATES
        setTemplates(list)
        setTemplateName(prev => (prev && list.some(t => t.name === prev)) ? prev : (list[0]?.name ?? ''))
      })
      .catch(() => {
        setTemplatesError('No se pudo consultar Meta, usando catálogo local')
        setTemplates(WHATSAPP_TEMPLATES)
        setTemplateName(prev => prev || (WHATSAPP_TEMPLATES[0]?.name ?? ''))
      })
      .finally(() => setLoadingTemplates(false))
  }, [])

  // Al elegir/cambiar de plantilla, revisa si ya hay una imagen guardada para ella
  useEffect(() => {
    if (!template?.hasImageHeader) { setSavedImageUrl(''); return }
    setCheckingImage(true); setSavedImageUrl(''); setLocalPreviewUrl(''); setReplacingImage(false)
    fetch(`/api/whatsapp/template-image?template=${encodeURIComponent(template.name)}`)
      .then(r => r.json())
      .then(d => setSavedImageUrl(d.url || ''))
      .catch(() => {})
      .finally(() => setCheckingImage(false))
  }, [template?.name])

  useEffect(() => {
    onChange({
      templateName, language: template?.language ?? 'es_MX', bodyPreview: template?.bodyPreview ?? '',
      savedImageUrl, personalize: effectivePersonalize, ready,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateName, savedImageUrl, effectivePersonalize, ready])

  const handleFile = async (file: File | undefined) => {
    if (!file || !template) return
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

  return (
    <div>
      <div className="field">
        <label>Plantilla</label>
        {loadingTemplates ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Consultando plantillas aprobadas en Meta…</div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--ipesa-rose)' }}>No hay plantillas aprobadas disponibles.</div>
        ) : (
          <select
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--card)', fontSize: 13.5, outline: 'none' }}
          >
            {templates.map(t => <option key={`${t.name}_${t.language}`} value={t.name}>{t.label}</option>)}
          </select>
        )}
        {templatesError && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>⚠️ {templatesError}</div>
        )}
      </div>

      {template && (
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          {/* Vista previa tipo burbuja de WhatsApp */}
          <div style={{ flex: '1 1 240px', minWidth: 240 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
              Vista previa
            </label>
            <div style={{ background: '#E5DDD5', borderRadius: 12, padding: 12 }}>
              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                {template.hasImageHeader && (
                  <div style={{ width: '100%', aspectRatio: '1.4', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {imageToShow ? (
                      <img src={imageToShow} alt="Encabezado" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : <Ico.image />}
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, color: '#111', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{previewBody}</div>
                  {template.footer && <div style={{ fontSize: 11.5, color: '#8696a0', marginTop: 6 }}>{template.footer}</div>}
                </div>
                {template.buttonLabel && (
                  <div style={{ borderTop: '1px solid var(--line)', padding: '9px 12px', textAlign: 'center', fontSize: 13, color: '#00a5f4', fontWeight: 600 }}>
                    ↩ {template.buttonLabel}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Configuración */}
          <div style={{ flex: '1 1 240px', minWidth: 240, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {template.hasImageHeader && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
                  Imagen de encabezado *
                </label>
                {checkingImage ? (
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Revisando…</div>
                ) : savedImageUrl && !replacingImage ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5, color: 'var(--ipesa-green)', fontWeight: 600 }}>✓ Ya guardada, se reutiliza automáticamente</span>
                    <button type="button" onClick={() => setReplacingImage(true)}
                      style={{ fontSize: 12, color: 'var(--ipesa-orange)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} style={{ fontSize: 12.5 }} />
                    {uploadingImage && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Subiendo…</div>}
                    {savedImageUrl && !uploadingImage && (
                      <div style={{ marginTop: 6 }}>
                        <button type="button" onClick={() => setReplacingImage(false)}
                          style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          Cancelar, usar la que ya estaba
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {hasBodyVariable ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={personalize} onChange={e => setPersonalize(e.target.checked)} />
                Personalizar con el nombre de cada contacto
              </label>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Esta plantilla no tiene variables — el texto es el mismo para todos.</div>
            )}
          </div>
        </div>
      )}

      {uploadError && <div style={{ color: 'var(--ipesa-rose)', fontSize: 12.5, marginTop: 12 }}>{uploadError}</div>}
    </div>
  )
}
