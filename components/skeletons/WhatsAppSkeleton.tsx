/**
 * WhatsApp mientras carga: bandeja, chat, ficha del CRM, campañas y
 * resultados, con los mismos contenedores que sus componentes reales
 * (WhatsAppInbox, WhatsAppCampaigns, WhatsAppCampaignHistory…).
 */
import { Search } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons'
import { Loading, Sk, SkCircle, SkText, skRows, skWidth } from '@/components/Skeleton'

/** Lista de conversaciones (columna izquierda de la bandeja). */
export function ConversationListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Loading label="Cargando conversaciones…">
      {skRows(rows, i => (
        <div className="wa-conv skeleton" key={i}>
          <span className="wa-avatar-wrap"><SkCircle size={42} /></span>
          <span className="wa-conv-main">
            <span className="wa-conv-top">
              <span className="wa-conv-name" style={{ flex: 1 }}><SkText w={skWidth(i, 0.75)} /></span>
              <span className="wa-conv-time"><SkText w={34} /></span>
            </span>
            <span className="wa-conv-bottom">
              <span className="wa-conv-preview"><SkText w={skWidth(i + 3)} /></span>
            </span>
          </span>
        </div>
      ))}
    </Loading>
  )
}

/** Burbujas de un chat: unas del cliente y otras de la tienda, de distintos largos. */
const BUBBLES: { out: boolean; lines: number; w: number }[] = [
  { out: false, lines: 1, w: 180 }, { out: false, lines: 2, w: 260 }, { out: true, lines: 1, w: 150 },
  { out: true, lines: 3, w: 300 }, { out: false, lines: 1, w: 120 }, { out: true, lines: 2, w: 230 },
]
function Bubbles({ count = BUBBLES.length }: { count?: number }) {
  return (
    <>
      {BUBBLES.slice(0, count).map((b, i) => (
        <div key={i} className={`wa-msg ${b.out ? 'out' : 'in'}`}>
          <div className="wa-bubble" style={{ width: b.w }}>
            <div className="wa-text">
              {skRows(b.lines, l => <SkText key={l} w={l === b.lines - 1 && b.lines > 1 ? '62%' : '100%'} />)}
            </div>
            <div className="wa-meta"><SkText w={30} /></div>
          </div>
        </div>
      ))}
    </>
  )
}

/** Mensajes de un chat abierto. */
export function ThreadSkeleton() {
  return (
    <Loading label="Cargando mensajes…" className="wa-day-group">
      <div className="wa-day"><span><SkText w={64} /></span></div>
      <Bubbles />
    </Loading>
  )
}

/** Últimos mensajes en la ficha de un contacto. */
export function MiniThreadSkeleton() {
  return (
    <Loading label="Cargando mensajes…" className="wa-mini-msgs">
      <Bubbles count={3} />
    </Loading>
  )
}

/** La bandeja completa (al entrar a WhatsApp): lista a la izquierda y el chat vacío. */
export function InboxSkeleton() {
  return (
    <div className="wa-inbox">
      <section className="wa-card wa-list-card" aria-label="Conversaciones">
        <div className="wa-list-head">
          <div className="wa-list-title">
            <span>Conversaciones</span>
            <Sk w={72} h={28} r={6} />
          </div>
          <label className="wa-search">
            <Search size={15} />
            <input placeholder="Buscar nombre o número…" aria-label="Buscar conversación" disabled />
          </label>
          <div className="wa-filters" aria-hidden="true">
            {['Todas', 'No leídas', 'Sin contacto'].map((label, i) => (
              <span key={label} className={`wa-filter ${i === 0 ? 'active' : ''}`}>{label}</span>
            ))}
          </div>
        </div>
        <div className="wa-list"><ConversationListSkeleton /></div>
      </section>
      <section className="wa-card wa-thread-card" aria-label="Chat">
        <div className="wa-empty">
          <div className="wa-empty-icon"><WhatsAppIcon size={34} /></div>
          <div className="wa-empty-title">Bandeja de WhatsApp</div>
          <div>Elige una conversación para leer y responder. Todo queda ligado al contacto y su seguimiento.</div>
        </div>
      </section>
    </div>
  )
}

/** La sección de WhatsApp completa (la bandeja). */
export function WhatsAppPageSkeleton() {
  return <div className="wa-page"><InboxSkeleton /></div>
}

/** Campañas de Mkt: las dos pestañas y la lista para elegir destinatarios. */
export function CampaignsPageSkeleton() {
  return (
    <div className="wa-page">
      <div className="wa-tabs" aria-hidden="true"><Sk w={112} h={34} r={6} /><Sk w={112} h={34} r={6} /></div>
      <RecipientPickSkeleton />
    </div>
  )
}

/** Ficha del CRM a la derecha del chat. */
export function CrmPanelSkeleton() {
  return (
    <Loading label="Cargando la ficha…">
      <section className="wa-panel-section wa-profile">
        <SkCircle size={60} />
        <div className="wa-profile-name"><SkText w={150} /></div>
        <div className="wa-profile-phone"><SkText w={110} /></div>
        <div className="wa-profile-chips"><Sk w={70} h={20} r={6} /><Sk w={86} h={20} r={6} /></div>
        <div className="wa-profile-actions"><Sk w="auto" h={34} r={8} style={{ flex: 1 }} /><Sk w="auto" h={34} r={8} style={{ flex: 1 }} /></div>
      </section>
      {skRows(2, i => (
        <section className="wa-panel-section" key={i}>
          <div className="wa-panel-title"><SkText w={120} /></div>
          <SkText w={skWidth(i)} />
          <SkText w={skWidth(i + 4)} />
        </section>
      ))}
    </Loading>
  )
}

/** Contactos para elegir (nueva conversación). */
export function PickListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Loading label="Cargando contactos…">
      {skRows(rows, i => (
        <div className="wa-pick" key={i}>
          <SkCircle size={36} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ display: 'block' }}><SkText w={skWidth(i, 0.6)} /></strong>
            <small style={{ display: 'block' }}><SkText w={skWidth(i + 2, 0.45)} /></small>
          </span>
        </div>
      ))}
    </Loading>
  )
}

/** Destinatarios para elegir en Campañas (con casilla). */
export function RecipientPickSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <Loading label="Cargando contactos…">
      {skRows(rows, i => (
        <div className="wa-pick-row" key={i}>
          <Sk w={16} h={16} r={4} />
          <SkCircle size={32} />
          <span className="wa-pick-main" style={{ flex: 1, minWidth: 0 }}>
            <span className="wa-pick-name"><SkText w={skWidth(i, 0.6)} /></span>
            <span className="wa-pick-sub"><SkText w={skWidth(i + 5, 0.4)} /></span>
          </span>
        </div>
      ))}
    </Loading>
  )
}

/** Respuestas rápidas en el chat. */
export function QuickRepliesSkeleton() {
  return (
    <Loading label="Cargando respuestas rápidas…">
      {skRows(3, i => (
        <div className="wa-quick-item" key={i}>
          <strong><SkText w={skWidth(i, 0.5)} /></strong>
          <SkText w={skWidth(i + 3)} />
        </div>
      ))}
    </Loading>
  )
}

/** Estado del número en Meta (arriba de Campañas). */
export function HealthSkeleton() {
  return (
    <Loading label="Consultando el estado del número en Meta…" className="wa-health">
      <div className="wa-health-main" style={{ flex: 1 }}>
        <span className="wa-health-dot" />
        <div style={{ flex: 1 }}>
          <div className="wa-health-title"><SkText w={200} /></div>
          <div className="wa-health-tip"><SkText w="70%" /></div>
        </div>
      </div>
    </Loading>
  )
}

function KpisSkeleton() {
  return (
    <div className="wa-kpis">
      {skRows(5, i => (
        <div className="wa-kpi" key={i}>
          <span><SkText w={skWidth(i, 0.9)} /></span>
          <strong><SkText w={56} /></strong>
          <small><SkText w={skWidth(i + 2, 0.7)} /></small>
        </div>
      ))}
    </div>
  )
}

/** Resultados de campañas: cifras y tarjetas de cada envío. */
export function CampaignListSkeleton() {
  return (
    <Loading label="Cargando resultados…" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <KpisSkeleton />
      <div className="wa-camp-list">
        {skRows(3, i => (
          <div className="wa-card wa-camp-card" key={i} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="wa-camp-top">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="wa-camp-name"><SkText w={skWidth(i, 0.5)} /></div>
                <div className="wa-camp-sub"><SkText w={skWidth(i + 4, 0.35)} /></div>
              </div>
              <Sk w={104} h={22} r={4} />
            </div>
            <Sk h={9} r={999} />
            <div className="wa-camp-nums">{skRows(4, n => <SkText key={n} w={70} inline />)}</div>
          </div>
        ))}
      </div>
    </Loading>
  )
}

/** Detalle de una campaña: encabezado, cifras, barra y destinatarios. */
export function CampaignDetailSkeleton() {
  return (
    <Loading label="Cargando la campaña…" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="wa-results-head">
        <div style={{ flex: 1 }}>
          <div className="wa-results-title"><SkText w={220} /></div>
          <div className="wa-results-sub"><SkText w={280} /></div>
        </div>
      </div>
      <KpisSkeleton />
      <Sk h={9} r={999} />
      <div className="wa-card"><RecipientRows /></div>
    </Loading>
  )
}

function RecipientRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="wa-recips">
      {skRows(rows, i => (
        <div className="wa-recip" key={i}>
          <SkCircle size={34} />
          <div style={{ minWidth: 0 }}>
            <div className="wa-recip-name"><SkText w={skWidth(i, 0.8)} /></div>
            <div className="wa-recip-sub"><SkText w={skWidth(i + 3, 0.6)} /></div>
          </div>
          <div className="wa-recip-state"><Sk w={92} h={20} r={4} /></div>
          <div className="wa-recip-actions"><Sk w={28} h={28} r={6} /></div>
        </div>
      ))}
    </div>
  )
}

/** Resultados por persona: recuadros por estado y la lista. */
export function PeopleSkeleton() {
  return (
    <Loading label="Cargando resultados por persona…" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="wa-person-tiles">
        {skRows(4, i => (
          <div className="wa-person-tile" key={i}>
            <span><SkText w={skWidth(i, 0.9)} style={{ minWidth: 60 }} /></span>
            <strong><SkText w={40} /></strong>
            <small><SkText w={34} /></small>
          </div>
        ))}
      </div>
      <div className="wa-card">
        <div className="wa-list-head">
          <label className="wa-search">
            <Search size={15} />
            <input placeholder="Buscar nombre o teléfono…" aria-label="Buscar persona" disabled />
          </label>
        </div>
        <RecipientRows />
      </div>
    </Loading>
  )
}

