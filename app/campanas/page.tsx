'use client'

import { useEffect, useState } from 'react'
import { supabase, getContacts, getTemplates } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { Send, Eye } from 'lucide-react'

const SEGMENT_OPTIONS = [
  { value: '', label: 'Todos los contactos' },
  { value: 'retail', label: 'Retail' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'construccion', label: 'Construcción' },
  { value: 'residencial', label: 'Residencial' },
  { value: 'automotriz', label: 'Automotriz' },
]

export default function Campanas() {
  const [contacts, setContacts] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [selectedSegment, setSelectedSegment] = useState('')
  const [preview, setPreview] = useState('')

  useEffect(() => {
    Promise.all([getContacts(), getTemplates()])
      .then(([c, t]) => { setContacts(c); setTemplates(t) })
      .catch(() => toast.error('Error al cargar datos'))
      .finally(() => setLoading(false))
  }, [])

  const handlePreview = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (!template) return
    const sample = contacts[0]
    let msg = template.content
    if (sample) {
      msg = msg
        .replace(/{{nombre}}/g, sample.name)
        .replace(/{{empresa}}/g, sample.company)
        .replace(/{{telefono}}/g, sample.phone)
        .replace(/{{direccion}}/g, sample.address)
    }
    setPreview(msg)
  }

  const recipients = selectedSegment
    ? contacts.filter(c => c.segment === selectedSegment)
    : contacts

  const handleSend = async () => {
    if (!selectedTemplate) { toast.error('Selecciona una plantilla'); return }
    if (recipients.length === 0) { toast.error('No hay contactos'); return }
    try {
      setSending(true)
      const { data: campaign } = await supabase
        .from('campaigns')
        .insert([{
          name: `Campaña ${new Date().toLocaleString('es-MX')}`,
          template_id: selectedTemplate,
          status: 'enviada',
          total_contacts: recipients.length,
          sent_count: recipients.length,
        }])
        .select()

      if (campaign) {
        await Promise.all(recipients.map(c =>
          supabase.from('reminders').insert([{
            contact_id: c.id,
            campaign_id: campaign[0].id,
            reminder_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            reminder_type: 'follow_up',
          }])
        ))
      }
      toast.success(`Campaña registrada para ${recipients.length} contactos`)
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6 sm:py-8 dark-mode-transition">
        <div className="max-w-5xl mx-auto px-3 sm:px-4">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-1">Enviar Campañas</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm sm:text-base">Envía mensajes masivos segmentados a tus prospectos</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card variant="elevated" className="p-5 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                  <Send size={20} className="text-primary-600" /> Configuración
                </h2>
                <div className="space-y-4">
                  <Select
                    label="Plantilla"
                    value={selectedTemplate}
                    onChange={e => { setSelectedTemplate(e.target.value); handlePreview(e.target.value) }}
                    options={[
                      { value: '', label: 'Seleccionar plantilla...' },
                      ...templates.map(t => ({ value: t.id, label: t.name })),
                    ]}
                  />
                  <Select
                    label="Segmento"
                    value={selectedSegment}
                    onChange={e => setSelectedSegment(e.target.value)}
                    options={SEGMENT_OPTIONS}
                  />
                  <div className="flex justify-between items-center p-4 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Contactos a enviar</span>
                    <Badge variant="info" className="text-base px-4 py-1">{recipients.length}</Badge>
                  </div>
                  <Button variant="success" className="w-full" size="lg" loading={sending} onClick={handleSend}>
                    <Send size={18} /> Enviar Campaña
                  </Button>
                </div>
              </Card>

              <Card variant="elevated" className="p-5 sm:p-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                  <Eye size={20} className="text-primary-600" /> Vista Previa
                </h2>
                {preview ? (
                  <div className="bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800 rounded-xl p-4">
                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">{preview}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-600">
                    <Eye size={40} className="mb-3 opacity-30" />
                    <p className="text-sm text-center">Selecciona una plantilla para previsualizar</p>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
