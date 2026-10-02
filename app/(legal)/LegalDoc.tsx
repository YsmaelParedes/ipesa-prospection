import { LEGAL } from '@/lib/legal'
import s from './legal.module.css'

export type LegalSection = { id: string; title: string; body: React.ReactNode }

/** Documento legal con índice lateral y resumen en lenguaje sencillo. */
export function LegalDoc({ kicker, title, summary, sections }: {
  kicker: string; title: string; summary: React.ReactNode[]; sections: LegalSection[]
}) {
  return (
    <main className={s.main}>
      <div className={s.hero}>
        <span className={s.kicker}>{kicker}</span>
        <h1>{title}</h1>
        <p className={s.updated}>Última actualización: {LEGAL.updatedAt}</p>
      </div>
      <div className={s.layout}>
        <aside className={s.toc} aria-label="Contenido">
          <span className={s.tocTitle}>Contenido</span>
          <ol>
            {sections.map((sec, i) => (
              <li key={sec.id}><a href={`#${sec.id}`}><span>{i + 1}</span>{sec.title}</a></li>
            ))}
          </ol>
        </aside>
        <article className={s.doc}>
          <div className={s.summary}>
            <strong>En resumen</strong>
            <ul>{summary.map((item, i) => <li key={i}>{item}</li>)}</ul>
          </div>
          {sections.map((sec, i) => (
            <section key={sec.id} id={sec.id} className={s.section}>
              <h2><span>{i + 1}.</span> {sec.title}</h2>
              {sec.body}
            </section>
          ))}
        </article>
      </div>
    </main>
  )
}

/** Correo de contacto si está configurado; si no, una forma genérica. */
export function ContactEmail() {
  return LEGAL.email
    ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
    : <>los medios de contacto que te compartimos al dar de alta tu tienda</>
}
