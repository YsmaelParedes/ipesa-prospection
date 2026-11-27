'use client'

import { CircleAlert, FileText, Globe, MapPinOff, ShieldAlert, Unplug, type LucideIcon } from 'lucide-react'
import { APP_NAME } from '@/lib/brand'
import s from './WhatsAppMetaRules.module.css'

type Rule = { icon: LucideIcon; title: string; text: string; tone?: 'warn' }

/**
 * Lo que Meta exige o puede hacer con una cuenta de WhatsApp conectada a la
 * API (vale para cualquier plataforma, no solo para la nuestra).
 *  · before: antes de abrir la ventana de Meta (Configuración › WhatsApp, sin conectar)
 *  · connected: con el número ya conectado
 * `coexistence`: el número también se usa en la app WhatsApp Business del celular.
 */
export function metaRules(when: 'before' | 'connected', coexistence: boolean): Rule[] {
  const rules: Rule[] = []
  if (coexistence) {
    rules.push({
      icon: ShieldAlert, tone: 'warn',
      title: when === 'before' ? 'Usar el celular y la plataforma a la vez tiene un riesgo' : 'Tu número también está en el celular',
      text: 'Meta puede suspender las cuentas que usan WhatsApp Business en el celular y en una plataforma al mismo tiempo, y la app del celular podría dejar de funcionar. Es un riesgo de Meta para todas las cuentas así.',
    })
  }
  rules.push(
    {
      icon: Globe,
      title: when === 'before' ? 'Escribe el sitio web real de tu negocio' : 'Mantén el sitio web real de tu negocio',
      text: 'En la ventana de Meta pon tu sitio web o la dirección de tu página de Facebook o Instagram. No elijas «Mi negocio no tiene sitio web»: la cuenta puede quedarse pendiente mucho tiempo o ser restringida.',
    },
    {
      icon: FileText,
      title: 'El nombre debe ser igual al de tu registro',
      text: 'Escribe el nombre del negocio tal como aparece en tu constancia de situación fiscal o en el documento con el que lo registraste. Si no coincide, Meta puede limitar tus mensajes.',
    },
  )
  if (when === 'before') {
    rules.push({
      icon: CircleAlert,
      title: 'Si Meta no te deja continuar, lee el mensaje en rojo',
      text: 'En la ventana de Meta, el mensaje en rojo dice por qué no se puede conectar la cuenta. Esos motivos los pone Meta.',
    })
  }
  rules.push(
    {
      icon: Unplug,
      title: 'Meta puede desconectarla después',
      text: `Aunque la conexión quede lista, Meta puede desconectar la cuenta por sus revisiones. ${APP_NAME} no puede evitarlo ni revertirlo; si pasa, vuelve a conectarla desde Configuración › WhatsApp.`,
    },
    {
      icon: MapPinOff,
      title: 'Países donde no llegan los mensajes',
      text: 'Meta no entrega estos mensajes a números de Cuba, Irán, Siria, Corea del Norte ni de Crimea, Donetsk y Luhansk. A esos clientes solo puedes escribirles desde la app del celular.',
    },
  )
  return rules
}

export function WhatsAppMetaRules({ when, coexistence }: { when: 'before' | 'connected'; coexistence: boolean }) {
  return (
    <div className={s.wrap}>
      <ul className={s.rules}>
        {metaRules(when, coexistence).map(r => (
          <li key={r.title} className={r.tone === 'warn' ? s.warn : undefined}>
            <span className={s.ico}><r.icon aria-hidden="true" /></span>
            <span><strong>{r.title}</strong>{r.text}</span>
          </li>
        ))}
      </ul>
      <p className={s.who}>Son reglas de Meta, la empresa de WhatsApp: {APP_NAME} no puede cambiarlas ni pedir excepciones. Si algo no te queda claro, escríbenos y lo revisamos contigo.</p>
    </div>
  )
}
