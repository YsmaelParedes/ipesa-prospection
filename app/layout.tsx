import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'IPESA Prospección',
  description: 'Sistema inteligente de gestión de prospectos',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50 transition-colors duration-200">
        <ThemeProvider>
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
