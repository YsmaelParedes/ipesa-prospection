import type { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import { ContactEmail, LegalDoc, type LegalSection } from '../LegalDoc'

export const metadata: Metadata = {
  title: `Aviso de privacidad · ${LEGAL.product}`,
  description: `Cómo ${LEGAL.product} trata los datos personales de los usuarios y de la información que registran las tiendas.`,
}

const sections: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién es el responsable',
    body: (
      <>
        <p>
          {LEGAL.owner}{LEGAL.address ? <>, con domicilio en {LEGAL.address},</> : null} es responsable del tratamiento
          de los datos personales de las personas que usan la plataforma {LEGAL.product} (en adelante, “nosotros”), en
          términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y demás
          normatividad aplicable.
        </p>
        <p>Para cualquier asunto relacionado con este aviso puedes escribirnos a <ContactEmail />.</p>
      </>
    ),
  },
  {
    id: 'alcance',
    title: 'A quién aplica este aviso',
    body: (
      <>
        <p>Este aviso aplica a los datos de las personas que crean una cuenta o son invitadas a una tienda (dueños, administradores y vendedores).</p>
        <p>
          La información que cada tienda registra sobre <strong>sus propios clientes</strong> (contactos, oportunidades,
          conversaciones y recordatorios) pertenece a la tienda, que es la responsable de esos datos frente a sus
          clientes y debe contar con su propio aviso de privacidad. Respecto de esa información nosotros actuamos como
          encargados: solo la tratamos para prestar el servicio a la tienda y conforme a sus instrucciones.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos recabamos',
    body: (
      <>
        <ul>
          <li><strong>Identificación y contacto:</strong> nombre, correo electrónico y, en su caso, teléfono.</li>
          <li><strong>Datos de la tienda:</strong> nombre comercial, dirección, ciudad, estado, teléfono y logotipo.</li>
          <li><strong>Datos de acceso:</strong> tu contraseña, que se guarda de forma cifrada y no podemos leer.</li>
          <li><strong>Datos técnicos y de uso:</strong> dirección IP, tipo de navegador, fechas de acceso y registros de actividad necesarios para la seguridad del servicio.</li>
          <li><strong>Datos de facturación:</strong> los que nos compartas al activar tu plan (por ejemplo, razón social y RFC).</li>
        </ul>
        <p>No solicitamos datos personales sensibles.</p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué usamos tus datos',
    body: (
      <>
        <p><strong>Finalidades necesarias</strong> para prestarte el servicio:</p>
        <ul>
          <li>Crear y administrar tu cuenta y la de tu tienda, y verificar tu identidad al iniciar sesión.</li>
          <li>Prestar las funciones de la plataforma: contactos, oportunidades, recordatorios, WhatsApp, campañas, fórmulas y notificaciones.</li>
          <li>Proteger la seguridad del servicio, prevenir fraudes y accesos no autorizados.</li>
          <li>Atender solicitudes de soporte y enviarte avisos sobre tu cuenta (prueba gratis, vencimientos y cambios del servicio).</li>
          <li>Facturar y gestionar el cobro del plan contratado.</li>
          <li>Cumplir obligaciones legales y atender requerimientos de autoridades competentes.</li>
        </ul>
        <p><strong>Finalidades adicionales</strong> que no son necesarias para el servicio: enviarte novedades, encuestas de satisfacción y promociones de {LEGAL.product}.</p>
        <p>Si no quieres que usemos tus datos para las finalidades adicionales, escríbenos a <ContactEmail />. Tu negativa no afecta el servicio.</p>
      </>
    ),
  },
  {
    id: 'terceros',
    title: 'Con quién compartimos tus datos',
    body: (
      <>
        <p>Para operar el servicio nos apoyamos en proveedores que tratan datos por nuestra cuenta, bajo obligaciones de confidencialidad y seguridad:</p>
        <ul>
          <li><strong>Supabase</strong>: base de datos, autenticación y almacenamiento de archivos.</li>
          <li><strong>Vercel</strong>: alojamiento y ejecución de la aplicación.</li>
          <li><strong>Meta Platforms</strong> (WhatsApp Business Platform): solo si tu tienda conecta su número, para enviar y recibir mensajes.</li>
          <li><strong>Servicios de notificaciones del navegador</strong> (por ejemplo, de Google, Apple o Mozilla): solo si activas los avisos en tu dispositivo.</li>
        </ul>
        <p>
          Algunos de estos proveedores pueden almacenar la información fuera de México. No vendemos ni rentamos tus
          datos. Solo los compartiríamos con autoridades cuando una ley o un mandato judicial lo exija.
        </p>
      </>
    ),
  },
  {
    id: 'arco',
    title: 'Tus derechos ARCO',
    body: (
      <>
        <p>
          Tienes derecho a <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong> si son inexactos,
          <strong> cancelarlos</strong> cuando consideres que no se usan conforme a la ley y <strong>oponerte</strong> a
          su uso para fines específicos.
        </p>
        <p>Para ejercerlos envía una solicitud a <ContactEmail /> que incluya:</p>
        <ul>
          <li>Tu nombre y el correo de tu cuenta.</li>
          <li>Un documento que acredite tu identidad o, en su caso, la representación legal.</li>
          <li>La descripción clara de los datos y del derecho que quieres ejercer.</li>
          <li>Cualquier dato que nos ayude a localizar tu información.</li>
        </ul>
        <p>
          Te responderemos en un plazo máximo de 20 días hábiles y, si la solicitud procede, la haremos efectiva dentro
          de los 15 días hábiles siguientes. Muchos datos los puedes corregir tú directamente desde la aplicación.
        </p>
      </>
    ),
  },
  {
    id: 'revocacion',
    title: 'Revocar tu consentimiento o limitar el uso',
    body: (
      <>
        <p>
          Puedes revocar tu consentimiento o pedirnos limitar el uso de tus datos con el mismo procedimiento del punto
          anterior. Considera que, si los datos son necesarios para el servicio, la revocación puede implicar que ya no
          podamos prestártelo.
        </p>
        <p>Si ya no quieres recibir comunicaciones promocionales, te incluiremos en nuestra lista interna de exclusión.</p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies y tecnologías similares',
    body: (
      <>
        <p>
          Usamos únicamente cookies <strong>necesarias</strong> para mantener tu sesión iniciada y recordar la tienda
          activa, y el almacenamiento local de tu navegador para preferencias como los avisos que ya viste.
        </p>
        <p>No usamos cookies de publicidad ni herramientas de rastreo de terceros. Puedes borrarlas desde tu navegador, pero sin ellas no podrás iniciar sesión.</p>
      </>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo protegemos la información',
    body: (
      <>
        <p>Aplicamos medidas de seguridad administrativas, técnicas y físicas, entre ellas:</p>
        <ul>
          <li>Conexiones cifradas (HTTPS) en todo el servicio.</li>
          <li>Separación de la información por tienda: ninguna tienda puede consultar los datos de otra.</li>
          <li>Credenciales de integraciones, como el token de WhatsApp, cifradas con AES-256.</li>
          <li>Accesos por roles y la posibilidad de desactivar usuarios en cualquier momento.</li>
        </ul>
        <p>Ningún sistema es infalible; si detectamos una vulneración que afecte de forma significativa tus derechos, te lo informaremos sin demora.</p>
      </>
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo conservamos los datos',
    body: (
      <p>
        Conservamos tus datos mientras tu cuenta esté activa y, después, solo el tiempo necesario para cumplir
        obligaciones legales o resolver aclaraciones. Al cancelar el servicio, la tienda puede solicitar una copia de
        su información; después la eliminaremos o anonimizaremos de forma segura.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a este aviso',
    body: (
      <>
        <p>
          Podemos actualizar este aviso por cambios legales o del servicio. La versión vigente siempre estará en esta
          página con su fecha de actualización y, si el cambio es relevante, te avisaremos por correo o dentro de la
          aplicación.
        </p>
        <p>
          Si consideras que tu derecho a la protección de datos personales ha sido vulnerado, puedes acudir ante la
          autoridad competente en materia de protección de datos personales.
        </p>
      </>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalDoc
      kicker="Aviso de privacidad integral"
      title="Tu información, cuidada y bajo tu control"
      summary={[
        'Usamos tus datos solo para darte el servicio, protegerlo y cobrar el plan.',
        'Los clientes que registra tu tienda son de tu tienda; nosotros solo los procesamos para ti.',
        'No vendemos datos y no usamos cookies de publicidad.',
        <>Puedes ejercer tus derechos ARCO escribiendo a <ContactEmail key="email" />.</>,
      ]}
      sections={sections}
    />
  )
}
