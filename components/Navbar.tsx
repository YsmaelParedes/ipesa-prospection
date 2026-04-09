'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { getAlertCount } from '@/lib/supabase'
import { BarChart3, Users, MessageSquare, Clock, Search, Settings, Tag, ChevronDown, Moon, Sun, LogOut, FileText, RefreshCw, X, Grid3X3 } from 'lucide-react'

const mainTabs = [
  { href: '/',            label: 'Dashboard',  icon: BarChart3 },
  { href: '/contactos',  label: 'Contactos',  icon: Users },
  { href: '/mensajeria', label: 'Mensajería', icon: MessageSquare },
  { href: '/seguimiento',label: 'Seguimiento',icon: RefreshCw },
]

const moreItems = [
  { href: '/scraper',           label: 'Scraper',      icon: Search },
  { href: '/segmentos',         label: 'Segmentos',    icon: Tag },
  { href: '/recordatorios',     label: 'Recordatorios',icon: Clock },
  { href: '/reportes-whatsapp', label: 'Reportes WA',  icon: FileText },
]

const desktopConfig = [
  { href: '/segmentos',         label: 'Segmentos',    icon: Tag },
  { href: '/recordatorios',     label: 'Recordatorios',icon: Clock },
  { href: '/reportes-whatsapp', label: 'Reportes WA',  icon: FileText },
]

export default function Navbar() {
  const [configOpen, setConfigOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    getAlertCount().then(setAlertCount).catch(() => {})
    const interval = setInterval(() => {
      getAlertCount().then(setAlertCount).catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setConfigOpen(false)
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <nav className="bg-primary-700 dark:bg-gray-950 text-white shadow-lg sticky top-0 z-50 border-b border-transparent dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex justify-between items-center h-14 lg:h-16">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-bold text-lg hover:opacity-90 flex-shrink-0">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-sm text-primary-700 dark:text-primary-600">IP</span>
              </div>
              <span className="hidden sm:inline">IPESA</span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden lg:flex items-center gap-1">
              {mainTabs.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}
                  className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition duration-200 ${isActive(href) ? 'bg-white/20 text-white' : 'text-white/90 hover:text-white hover:bg-white/15'}`}>
                  <Icon size={16} />
                  {label}
                  {href === '/recordatorios' && alertCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow">
                      {alertCount > 99 ? '99+' : alertCount}
                    </span>
                  )}
                </Link>
              ))}
              <Link key="/scraper" href="/scraper"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition duration-200 ${isActive('/scraper') ? 'bg-white/20 text-white' : 'text-white/90 hover:text-white hover:bg-white/15'}`}>
                <Search size={16} /> Scraper
              </Link>

              {/* Configuración dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button onClick={() => setConfigOpen(!configOpen)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition duration-200 ${configOpen ? 'bg-white/15 text-white' : 'text-white/90 hover:text-white hover:bg-white/15'}`}>
                  <Settings size={16} />
                  Configuración
                  <ChevronDown size={14} className={`transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`} />
                </button>
                {configOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                    <div className="px-3 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">Gestión</div>
                    {desktopConfig.map(({ href, label, icon: Icon }) => (
                      <Link key={href} href={href} onClick={() => setConfigOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-700 dark:hover:text-white transition duration-150">
                        <Icon size={17} className="text-gray-400 dark:text-gray-500" />
                        {label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1">
              <button onClick={toggleTheme}
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition duration-200"
                aria-label="Cambiar tema">
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button onClick={handleLogout}
                className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition duration-200"
                aria-label="Cerrar sesión">
                <LogOut size={20} />
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────────── */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {mainTabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors relative ${active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              {label}
              {href === '/recordatorios' && alertCount > 0 && (
                <span className="absolute top-1 right-[calc(50%-18px)] min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {alertCount > 99 ? '99+' : alertCount}
                </span>
              )}
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary-600 dark:bg-primary-400 rounded-b-full" />}
            </Link>
          )
        })}

        {/* Más */}
        <div className="flex-1 relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors ${moreOpen ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'}`}>
            <Grid3X3 size={22} strokeWidth={moreOpen ? 2.5 : 1.8} />
            Más
          </button>

          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
                  <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Más secciones</span>
                  <button onClick={() => setMoreOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <X size={14} />
                  </button>
                </div>
                {moreItems.map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${isActive(href) ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                    <Icon size={17} className={isActive(href) ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400 dark:text-gray-500'} />
                    {label}
                    {href === '/recordatorios' && alertCount > 0 && (
                      <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5">
                        {alertCount > 99 ? '99+' : alertCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
