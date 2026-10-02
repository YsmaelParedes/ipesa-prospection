import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL } from '@/lib/legal'
import { PAYMENT_GRACE_DAYS, TRIAL_DAYS } from '@/lib/stores'
import { ContactEmail, LegalDoc, type LegalSection } from '../LegalDoc'

export const metadata: Metadata = {
  title: `Términos de uso · ${LEGAL.product}`,
  description: `Condiciones para usar ${LEGAL.product}: cuentas, prueba gratis, planes, información de la tienda y uso de WhatsApp.`,
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
        oportunidades de venta, recordatorios, conversaciones y campañas de WhatsApp y fórmulas de color. Podemos
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
        <li>El dueño de la tienda decide quién forma parte del equipo y con qué rol, y puede desactivar accesos en cualquier momento.</li>
        <li>Avísanos de inmediato si sospechas de un uso no autorizado de tu cuenta.</li>
      </ul>
    ),
  },
  {
    id: 'planes',
    title: 'Prueba gratis, planes y pagos',
    body: (
      <>
        <p>
          Cada tienda nueva tiene una prueba gratis de {TRIAL_DAYS} días con todas las funciones, sin necesidad de
          registrar un medio de pago. Al terminar, la información se conserva en modo de solo consulta hasta que
          actives un plan.
        </p>
        <p>
          El precio, la periodicidad y la forma de pago del plan se acuerdan al activarlo. Si un pago vence, la tienda
          conserva el acceso completo durante {PAYMENT_GRACE_DAYS} días de gracia; después pasa a solo consulta hasta
          regularizarlo. Podemos suspender una tienda por falta de pago o por incumplir estos términos.
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
    title: 'WhatsApp y comunicaciones con tus clientes',
    body: (
      <ul>
        <li>La conexión de WhatsApp usa WhatsApp Business Platform de Meta y está sujeta a sus términos y políticas, incluidas la Política de WhatsApp Business y la Política de Comercio.</li>
        <li>Solo debes escribir a personas que te hayan dado su consentimiento para recibir mensajes de tu tienda, y eres responsable del contenido de tus mensajes y plantillas.</li>
        <li>Meta puede cobrar directamente a tu cuenta por las conversaciones o mensajes según sus tarifas vigentes.</li>
        <li>Las reglas anti-bloqueo de las campañas reducen el riesgo, pero Meta puede limitar o suspender un número por decisiones propias; esas decisiones no dependen de nosotros.</li>
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
    title: 'Cancelación',
    body: (
      <p>
        Puedes cancelar el servicio en cualquier momento escribiéndonos a <ContactEmail />. Antes de cancelar puedes
        exportar tu información desde la aplicación o pedirnos una copia. También podemos terminar el servicio si se
        incumplen estos términos, avisándote previamente cuando sea posible.
      </p>
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
        `Pruebas ${TRIAL_DAYS} días gratis; después activas tu plan para seguir registrando.`,
        'La información de tu tienda es tuya y ninguna otra tienda puede verla.',
        'Usa WhatsApp solo con clientes que aceptaron recibir tus mensajes.',
        'Puedes cancelar cuando quieras y llevarte tu información.',
      ]}
      sections={sections}
    />
  )
}
