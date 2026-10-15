'use client'

import Link from 'next/link'
import { AuthAlert, AuthHeader, AuthIcon } from '@/components/AuthUI'
import { APP_NAME } from '@/lib/brand'
import { requestInviteLinks } from '@/lib/legal'

/**
 * Registro CERRADO: las tiendas entran solo por invitación (el panel del
 * dueño da de alta la tienda y manda el enlace a su dueño). Aquí se pide la
 * invitación por WhatsApp o correo (NEXT_PUBLIC_CONTACT_WHATSAPP / _EMAIL).
 */
export default function RegisterPage() {
  const links = requestInviteLinks()
  return (
    <div className="auth-done">
      <div className="auth-done-icon"><AuthIcon.mail /></div>
      <AuthHeader title="Alta solo por invitación" subtitle={<>Damos de alta cada tienda contigo: acordamos el plan, creamos tu tienda y te mandamos un enlace para que entres.</>} />

      {links.whatsapp || links.email ? (
        <div className="auth-form" style={{ marginTop: 18 }}>
          {links.whatsapp && <a className="auth-submit as-link" href={links.whatsapp} target="_blank" rel="noopener noreferrer">Pedir invitación por WhatsApp</a>}
          {links.email && <a className={links.whatsapp ? 'auth-submit as-link secondary' : 'auth-submit as-link'} href={links.email}>Pedir invitación por correo</a>}
        </div>
      ) : (
        <AuthAlert kind="info">Pide tu invitación a tu asesor de {APP_NAME}.</AuthAlert>
      )}

      <AuthAlert kind="info">
        ¿Ya recibiste tu enlace de invitación? Ábrelo: ahí creas tu contraseña. Si ya tienes cuenta, inicia sesión.
      </AuthAlert>
      <p className="auth-alt"><Link href="/login" className="auth-link strong">Ir a iniciar sesión</Link></p>
    </div>
  )
}
