# Matices

CRM para tiendas de pintura: cada tienda lleva a sus contactos, su seguimiento comercial y, si lo tiene contratado, su WhatsApp y sus campañas.

## Tienda y personas

**Tienda**:
El negocio que usa Matices, con su plan, su equipo y sus datos aparte de las demás.
_Avoid_: cuenta, empresa, cliente (para la tienda)

**Contacto**:
Una persona o negocio con quien la tienda trata, con su teléfono, su segmento y su responsable.
_Avoid_: cliente, lead, prospecto (como nombre de la entidad)

**Segmento**:
El tipo de contacto (pintor, ferretería, hotel…) con el que la tienda agrupa a su base.
_Avoid_: categoría, giro

## WhatsApp

**Salida de WhatsApp**:
Todo lo que la tienda manda por su número de WhatsApp y su registro en el historial: plantillas, envíos de campaña, plantilla de prueba, texto y archivos.
_Avoid_: outbox, mensajería, envíos (en general)

**Plantilla**:
Mensaje aprobado por Meta, el único que se puede mandar fuera de la ventana de 24 h.
_Avoid_: template, mensaje masivo

**Ventana de 24 h**:
El plazo desde el último mensaje del contacto en el que se le puede escribir texto libre o archivos.
_Avoid_: ventana de atención, sesión

**Campaña**:
Una plantilla mandada a muchos contactos a la vez.
_Avoid_: difusión, broadcast, masivo

**Envío de campaña**:
Una campaña mandada a un segmento en un momento dado; el historial muestra cada envío por separado.
_Avoid_: lote (el lote es solo cómo se reparte el trabajo), batch

**Audiencia de campaña**:
Los contactos con celular a los que se les puede mandar una campaña, y para los demás, por qué no (baja, sin WhatsApp o espera de Meta).
_Avoid_: destinatarios elegibles, público, lista de envío

**Baja**:
Un contacto que pidió no recibir campañas; ya no se le manda ninguna plantilla.
_Avoid_: opt-out, bloqueado

**Sin WhatsApp**:
Un número al que Meta no pudo entregar porque no tiene WhatsApp, o que la tienda marcó como fijo; se conserva para llamar, solo no se le envía.
_Avoid_: número inválido, número malo

**Límite de Meta**:
Cuántas personas distintas puede contactar la tienda con plantillas en 24 h fuera de la ventana de 24 h, según su nivel en Meta.
_Avoid_: cupo, cuota, tier
