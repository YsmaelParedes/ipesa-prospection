'use client'

import { useEffect, useState } from 'react'
import { getTemplates, addTemplate } from '@/lib/supabase'
import Navbar from '@/components/Navbar'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import toast from 'react-hot-toast'
import { Plus, FileText } from 'lucide-react'

export default function Plantillas() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', content: '' })

  useEffect(() => { fetchTemplates() }, [])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      setTemplates(await getTemplates())
    } catch { toast.error('Error al cargar plantillas') }
    finally { setLoading(false) }
  }

  const extractVariables = (text: string) =>
    [...new Set((text.match(/{{(\w+)}}/g) || []).map(m => m.replace(/{{|}}/g, '')))]

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.content) { toast.error('Nombre y contenido requeridos'); return }
    try {
      await addTemplate({ ...form, variables: extractVariables(form.content) })
      toast.success('Plantilla creada')
      setForm({ name: '', content: '' })
      setShowForm(false)
      fetchTemplates()
    } catch (error: any) { toast.error(error.message) }
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-1">Plantillas de Mensajes</h1>
              <p className="text-gray-500">Crea mensajes reutilizables con variables dinámicas</p>
            </div>
            <Button variant="primary" onClick={() => setShowForm(!showForm)}>
              <Plus size={18} /> Nueva Plantilla
            </Button>
          </div>

          {showForm && (
            <Card variant="elevated" className="p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Nueva Plantilla</h2>
              <form onSubmit={handleSave} className="space-y-4">
                <Input label="Nombre" placeholder="Ej: Saludo inicial" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Contenido</label>
                  <textarea
                    placeholder="Hola {{nombre}}, te contactamos de parte de IPESA..."
                    value={form.content}
                    onChange={e => setForm({ ...form, content: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 h-32 resize-none"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Usa {'{{variable}}'} para insertar datos dinámicamente</p>
                </div>
                {form.content && extractVariables(form.content).length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-600">Variables detectadas:</span>
                    {extractVariables(form.content).map(v => (
                      <Badge key={v} variant="info">{v}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary">Guardar</Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </form>
            </Card>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.length === 0 ? (
                <Card className="col-span-2 p-12 text-center">
                  <FileText size={48} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400">No hay plantillas. Crea la primera.</p>
                </Card>
              ) : templates.map(t => (
                <Card key={t.id} variant="elevated" className="p-5 border-l-4 border-success-500">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{t.name}</h3>
                  <p className="text-gray-600 text-sm mb-3 leading-relaxed">{t.content}</p>
                  {t.variables?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {t.variables.map((v: string) => (
                        <Badge key={v} variant="info">{v}</Badge>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
