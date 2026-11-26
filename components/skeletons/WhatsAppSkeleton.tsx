/**
 * WhatsApp mientras carga: bandeja, chat y ficha del CRM, con los mismos
 * contenedores que sus componentes reales (WhatsAppInbox…). Los de Campañas
 * están en app/(app)/campanas/Skeletons.tsx.
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
