This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## WhatsApp Cloud API con coexistencia

La conexion se inicia desde **Configuracion > WhatsApp > Conectar numero** en https://ipesa-prospection.vercel.app/configuracion. Configura estas variables en **Vercel > Project Settings > Environment Variables** para Production y vuelve a desplegar antes de abrir el flujo:

```dotenv
NEXT_PUBLIC_APP_URL=https://ipesa-prospection.vercel.app
META_APP_ID=
META_APP_SECRET=
META_EMBEDDED_SIGNUP_CONFIG_ID=
META_GRAPH_VERSION=v26.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=

# Completar con los valores que muestra el flujo al finalizar:
WHATSAPP_WABA_ID=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
```

En Meta configura como callback `https://ipesa-prospection.vercel.app/api/webhooks/whatsapp` y usa exactamente el mismo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Agrega `ipesa-prospection.vercel.app` a los dominios permitidos de la app de Meta y configura Facebook Login for Business para la plataforma web. El `META_APP_SECRET` y el token de WhatsApp nunca deben usar el prefijo `NEXT_PUBLIC_`.

Los valores obtenidos al terminar Embedded Signup se copian a las variables de Production en Vercel. Vuelve a desplegar para que el envio de mensajes use `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN`. La `.env.local` del equipo solo se usa en desarrollo y puede conservar `http://localhost:3000`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
