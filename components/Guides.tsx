import type { GuideStep } from './GuideModal'

/* Pasos de las guías de inicio. Los dibujos son mini pantallas hechas con CSS (clases g-* en globals.css). */

const Card = ({ tag, tone, children }: { tag?: string; tone?: string; children?: React.ReactNode }) => (
  <div className="g-card">
    {children ?? <><span className="g-dot" /><span className="g-line" /></>}
    {tag && <span className={`g-tag ${tone ?? ''}`}>{tag}</span>}
  </div>
)

export function commercialGuide({ isAdmin, salesTeam }: { isAdmin: boolean; salesTeam: boolean }): GuideStep[] {
  const last: GuideStep = !salesTeam
    ? {
        title: 'Nunca se te olvida volver a llamar',
        text: 'Cada registro deja una próxima fecha. Ese día el cliente regresa solo a tu lista de Hoy.',
        art: <div className="g-mini"><Card tag="Vuelve el jueves" tone="warn" /><Card tag="Hoy" tone="warn" /></div>,
      }
    : isAdmin
      ? {
          title: 'Oportunidades y Equipo',
          text: 'En Oportunidades ves las cotizaciones abiertas y las marcas como Ganada, Perdida o Seguimiento. En Equipo ves cómo va cada vendedor contra su meta y cambias las metas.',
          art: (
            <div className="g-bars">
              <div>Vendedor 1<i><b style={{ width: '80%' }} /></i><span>80 %</span></div>
              <div>Vendedor 2<i><b style={{ width: '55%' }} /></i><span>55 %</span></div>
              <div>Tú<i><b style={{ width: '35%' }} /></i><span>35 %</span></div>
            </div>
          ),
        }
      : {
          title: 'Oportunidades: tus cotizaciones',
          text: 'Ahí están las cotizaciones que tienes abiertas. Cuando te contesten, márcalas como Ganada, Perdida o Seguimiento.',
          art: <div className="g-mini"><Card tag="Ganada" tone="wa" /><Card tag="Seguimiento" tone="warn" /><Card tag="Perdida" tone="red" /></div>,
        }
  return [
    {
      title: 'Hoy es tu lista del día',
      text: 'Arriba ves lo vencido, lo de hoy y prospectos nuevos para completar tu meta. La barra te dice cómo vas.',
      art: (
        <div className="g-mini">
          <div className="g-prog">Llamadas 12/30<span className="g-track"><b /></span></div>
          <Card tag="Vencido" tone="red" /><Card tag="Hoy" tone="warn" /><Card tag="Nuevo" tone="info" />
        </div>
      ),
    },
    {
      title: 'Llama o escribe, y registra en 3 toques',
      text: 'Elige qué hiciste, cómo te fue y la fecha que te sugerimos. Toca «Guardar y siguiente» y pasas al próximo cliente.',
      art: (
        <div className="g-mini g-center">
          <div className="g-chips"><span className="on">Llamada</span><em>›</em><span className="on">Cotización</span><em>›</em><span>Jue 30</span></div>
          <span className="g-save">Guardar y siguiente</span>
        </div>
      ),
    },
    {
      title: 'El primero que registra, se queda con el cliente',
      text: 'Los «Sin asignar» son de quien los trabaje primero. Los que no tienen teléfono están en «Para visita».',
      art: <div className="g-mini"><Card tag="Sin asignar" tone="fijo" /><Card tag="Tuyo" tone="wa" /><Card tag="Para visita" tone="info" /></div>,
    },
    last,
  ]
}

export const CONTACTS_GUIDE: GuideStep[] = [
  {
    title: 'Tu base, de 50 en 50',
    text: 'Así carga rápido. Abajo está «Ver más contactos». El buscador busca en toda la base, no solo en lo que ves.',
    art: <div className="g-mini"><Card /><Card /><span className="g-more">Ver más contactos</span></div>,
  },
  {
    title: 'Filtra por segmento, canal, zona o teléfono',
    text: 'En «Teléfono» eliges: con WhatsApp, fijo, sin verificar o sin teléfono.',
    art: (
      <div className="g-menu">
        <span className="on">Con WhatsApp</span><span>Fijo (sin WhatsApp)</span><span>Sin verificar</span><span>Sin teléfono</span>
      </div>
    ),
  },
  {
    title: 'Verde = tiene WhatsApp. «Fijo» = llámale',
    text: 'Se marca solo cuando hay mensajes de WhatsApp. Si no, márcalo tú en la ficha, en «¿Tiene WhatsApp?».',
    art: (
      <div className="g-mini">
        <Card tag="WhatsApp" tone="wa"><span className="g-mono">222 000 0001</span></Card>
        <Card tag="Fijo" tone="fijo"><span className="g-mono">222 000 0002</span></Card>
      </div>
    ),
  },
  {
    title: 'Sin teléfono = para visita',
    text: 'Los negocios sin número se trabajan en persona: los encuentras en Sistema Comercial → Hoy → Para visita.',
    art: <div className="g-mini"><Card tag="Para visita" tone="info" /><Card tag="Para visita" tone="info" /></div>,
  },
]
