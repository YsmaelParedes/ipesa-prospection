import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL } from '@/lib/legal'
import { PLANS } from '@/lib/stores'
import { RETENTION_IDLE_MONTHS, RETENTION_LAST_NOTICE_DAYS, RETENTION_NOTICE_DAYS } from '@/lib/retention'
import { ContactEmail, LegalDoc, type LegalSection } from '../LegalDoc'

export const metadata: Metadata = {
  title: `Términos de uso · ${LEGAL.product}`,
  description: `Condiciones para usar ${LEGAL.product}: cuentas, planes y pagos con tarjeta, información de la tienda y comunicaciones con tus clientes.`,
}

const sections: LegalSection[] = [
  {
    id: 'aceptacion',
    title: 'Aceptación',
    body: (
      <>
        <p>
          Estos términos regulan el uso de {LEGAL.product}, plataforma operada por {LEGAL.owner}. Al crear una cuenta o
          aceptar una invitación declaras que leíste y aceptas estos términos y el{' '}
          <Link href="/privacidad">aviso de privacidad</Link>.
        </p>
        <p>Si das de alta una tienda en nombre de un negocio, declaras que tienes facultades para obligarlo en estos términos.</p>
      </>
    ),
  },
  {
    id: 'servicio',
    title: 'El servicio',
    body: (
      <p>
        {LEGAL.product} es una herramienta en línea para que las tiendas de pinturas administren contactos,
        oportunidades de venta, recordatorios y fórmulas de color. Podemos
        mejorar, agregar o retirar funciones; si un cambio afecta de forma importante el servicio, te avisaremos con
        anticipación razonable.
      </p>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas y accesos',
    body: (
      <ul>
        <li>Debes proporcionar información verdadera y mantenerla actualizada.</li>
        <li>Cada persona usa su propio usuario; no compartas tu contraseña. Eres responsable de lo que se haga con tu cuenta.</li>
        <li>Los administradores de la tienda deciden quién forma parte del equipo y con qué rol, y puede desactivar accesos en cualquier momento.</li>
        <li>Avísanos de inmediato si sospechas de un uso no autorizado de tu cuenta.</li>
      </ul>
    ),
  },
  {
    id: 'planes',
    title: 'Planes y pagos',
    body: (
      <>
        <p>
          Cualquier tienda puede crear su cuenta. Toda tienda empieza en el plan <strong>Litro</strong>, gratuito, con
          límites de uso ({PLANS.litro.maxContacts} contactos y solo el usuario
          del administrador). Los planes <strong>Galón</strong> y <strong>Cubeta</strong> son de
          paga y su precio vigente se muestra en el sitio y antes de pagar.
        </p>
        <p>
          Los planes de paga son una suscripción mensual que se cobra automáticamente con tarjeta, por adelantado, a
          través de Stripe, nuestro procesador de pagos; no vemos ni guardamos los datos de tu tarjeta. Al cambiar de
          plan, Stripe ajusta el cobro de forma proporcional. Si un cobro no pasa, Stripe lo reintenta durante unos días;
          si finalmente no se cobra, la suscripción se cancela y la tienda pasa al plan Litro.
        </p>
        <p>
          Al bajar de plan no se borra información: lo que pase de los límites del nuevo plan se conserva y se puede
          consultar, pero no se pueden registrar más contactos o cotizaciones hasta quedar dentro del límite o subir de
          plan. Si el nuevo plan incluye menos usuarios, los accesos más recientes se desactivan y un administrador puede elegir
          a quién reactivar. La bandeja de WhatsApp solo está disponible en el plan Cubeta.
        </p>
        <p>
          Los precios incluyen los impuestos que se indiquen al pagar. Si necesitas factura fiscal (CFDI), pídela
          escribiéndonos a <ContactEmail kind="facturacion" />. Podemos suspender una tienda por incumplir estos términos.
        </p>
      </>
    ),
  },
  {
    id: 'informacion',
    title: 'La información de tu tienda',
    body: (
      <>
        <p>
          Los datos que registra tu tienda (clientes, oportunidades, mensajes, fórmulas y archivos) son de tu tienda.
          Nos otorgas únicamente el permiso necesario para almacenarlos y procesarlos con el fin de prestarte el
          servicio. No los usamos para otros fines ni los compartimos con otras tiendas.
        </p>
        <p>
          Respecto de los datos personales de tus clientes, tu tienda es la responsable ante ellos: debe contar con su
          propio aviso de privacidad y obtener los consentimientos necesarios. Nosotros actuamos como encargados de
          esos datos.
        </p>
      </>
    ),
  },
  {
    id: 'whatsapp',
    title: 'Comunicaciones con tus clientes',
    body: (
      <ul>
        <li>Solo contacta a personas que te hayan dado su consentimiento para recibir mensajes de tu tienda.</li>
        <li>Si tu tienda tiene conectado WhatsApp: la conexión usa WhatsApp Business Platform de Meta y está sujeta a sus términos y políticas, incluidas la Política de WhatsApp Business y la Política de Comercio.</li>
        <li>Solo debes escribir a personas que te hayan dado su consentimiento para recibir mensajes de tu tienda, y eres responsable del contenido de tus mensajes y plantillas.</li>
        <li>Meta puede cobrar directamente a tu cuenta por las conversaciones o mensajes según sus tarifas vigentes.</li>
        <li>Las campañas aplican los límites y reglas que publica Meta (límite de personas por día, bajas y esperas que Meta indica), pero Meta puede limitar o suspender un número por decisiones propias; esas decisiones no dependen de nosotros.</li>
      </ul>
    ),
  },
  {
    id: 'uso',
    title: 'Uso aceptable',
    body: (
      <>
        <p>No está permitido:</p>
        <ul>
          <li>Enviar mensajes no solicitados, engañosos o ilegales, o usar la plataforma para acosar a cualquier persona.</li>
          <li>Intentar acceder a información de otras tiendas o a partes del sistema para las que no tienes permiso.</li>
          <li>Descompilar, copiar o revender la plataforma, o automatizar su uso de forma que afecte su funcionamiento.</li>
          <li>Subir archivos con software malicioso o contenido que infrinja derechos de terceros.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad y soporte',
    body: (
      <p>
        Trabajamos para que el servicio esté disponible de forma continua, pero puede haber interrupciones por
        mantenimiento, fallas de proveedores (alojamiento, base de datos, Meta) o causas de fuerza mayor. Cuando
        podamos anticipar un mantenimiento, lo avisaremos dentro de la aplicación.
      </p>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    body: (
      <p>
        El software, el diseño y los contenidos de {LEGAL.product} están protegidos por la ley. El uso del servicio no
        te transfiere ningún derecho sobre ellos. Las marcas y nombres de productos de pintura que aparecen en el
        servicio o que registre cada tienda pertenecen a sus respectivos titulares.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Limitación de responsabilidad',
    body: (
      <p>
        En la medida que lo permita la ley, no somos responsables por daños indirectos, pérdida de ventas o de
        oportunidades derivados del uso o de la imposibilidad de usar el servicio. Nuestra responsabilidad total
        frente a una tienda no excederá el monto que esa tienda haya pagado por el servicio en los tres meses
        anteriores al hecho que la origine.
      </p>
    ),
  },
  {
    id: 'cancelacion',
    title: 'Cancelación y tiendas sin uso',
    body: (
      <>
      <p>
        Puedes cancelar tu suscripción en cualquier momento desde Configuración → Plan («Administrar suscripción»).
        Conservas el plan pagado hasta el final del periodo ya cobrado y después tu tienda pasa al plan Litro; no
        hacemos reembolsos de periodos parciales salvo que la ley lo exija. Tu información se conserva: puedes
        descargarla completa en Excel desde Configuración → Tienda, o pedirnos una copia a <ContactEmail kind="soporte" />. La eliminamos cuando uno de sus administradores nos lo pide por escrito. También podemos terminar el servicio
        si se incumplen estos términos, avisándote previamente cuando sea posible.
      </p>
      <p>
        <strong>Tiendas sin uso.</strong> Si una tienda del plan Litro, sin suscripción ni cortesía, pasa {RETENTION_IDLE_MONTHS} meses
        sin que nadie de su equipo la use, avisamos a sus administradores por correo {RETENTION_NOTICE_DAYS} y {RETENTION_LAST_NOTICE_DAYS} días antes de eliminarla.
        Para conservarla basta con entrar antes de la fecha del aviso. Si nadie entra, la eliminamos con toda su
        información y las cuentas de su equipo que no pertenezcan a otra tienda; no se puede recuperar. Las tiendas con
        un plan de paga no se eliminan por falta de uso.
      </p>
      </>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios y ley aplicable',
    body: (
      <>
        <p>
          Podemos modificar estos términos; publicaremos la versión vigente en esta página y te avisaremos con
          anticipación razonable si el cambio es relevante. Si sigues usando el servicio después de la fecha de
          entrada en vigor, aceptas los términos actualizados.
        </p>
        <p>
          Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes
          se someten a los tribunales competentes de {LEGAL.jurisdiction}, renunciando a cualquier otro fuero.
        </p>
      </>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalDoc
      kicker="Términos de uso"
      title="Reglas claras para trabajar juntos"
      summary={[
        'Empiezas gratis en el plan Litro; Galón y Cubeta se pagan cada mes con tarjeta a través de Stripe.',
        'La información de tu tienda es tuya y ninguna otra tienda puede verla.',
        'Contacta solo a clientes que aceptaron recibir tus mensajes.',
        'Puedes cancelar cuando quieras: pasas al plan Litro sin perder tu información.',
        `Una tienda gratis que nadie usa en ${RETENTION_IDLE_MONTHS} meses se elimina, siempre con aviso previo por correo.`,
      ]}
      sections={sections}
    />
  )
}
