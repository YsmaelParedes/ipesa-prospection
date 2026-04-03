'use client'

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { getAlertCount } from '@/lib/supabase'
import { Menu, X, BarChart3, Users, MessageSquare, Clock, Search, Settings, Tag, ChevronDown, RefreshCw, Moon, Sun, LogOut } from 'lucide-react'

const mainMenu = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/contactos', label: 'Contactos', icon: Users },
  { href: '/mensajeria', label: 'Mensajería', icon: MessageSquare },
  { href: '/seguimiento', label: 'Seguimiento', icon: RefreshCw },
  { href: '/recordatorios', label: 'Recordatorios', icon: Clock },
  { href: '/scraper', label: 'Scraper', icon: Search },
]

const configMenu = [
  { href: '/segmentos', label: 'Segmentos', icon: Tag },
]

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [alertCount, setAlertCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { theme, toggleTheme } = useTheme()
  const router = useRouter()

  useEffect(() => {
    getAlertCount().then(setAlertCount).catch(() => {})
    // Refresca cada 5 minutos
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setConfigOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <nav className="bg-primary-700 dark:bg-gray-950 text-white shadow-lg sticky top-0 z-50 dark-mode-transition border-b border-transparent dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="flex justify-between items-center h-16">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-lg sm:text-xl hover:opacity-90 transition flex-shrink-0">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-sm text-primary-700 dark:text-primary-600">IP</span>
            </div>
            <span className="hidden sm:inline">IPESA</span>
          </Link>

          {/* Desktop menu */}
          <div className="hidden lg:flex items-center gap-1">
            {mainMenu.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/90 hover:text-white hover:bg-white/15 text-sm font-medium transition duration-200"
              >
                <Icon size={16} />
                {label}
                {href === '/recordatorios' && alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </Link>
            ))}

            {/* Configuración dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setConfigOpen(!configOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/90 hover:text-white hover:bg-white/15 text-sm font-medium transition duration-200 ${configOpen ? 'bg-white/15' : ''}`}
              >
                <Settings size={16} />
                Configuración
                <ChevronDown size={14} className={`transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`} />
              </button>

              {configOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
                  <div className="px-3 py-2 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    Gestión
                  </div>
                  {configMenu.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setConfigOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-blue-50 dark:hover:bg-gray-700 hover:text-blue-700 dark:hover:text-white transition duration-150"
                    >
                      <Icon size={17} className="text-gray-400 dark:text-gray-500" />
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Controles derechos */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition duration-200"
              aria-label="Cambiar tema"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition duration-200"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>

            {/* Mobile toggle */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="lg:hidden p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="lg:hidden pb-4 space-y-1 max-h-96 overflow-y-auto">
            {mainMenu.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition duration-200 text-sm"
                onClick={() => setIsOpen(false)}
              >
                <Icon size={18} />
                {label}
                {href === '/recordatorios' && alertCount > 0 && (
                  <span className="ml-auto min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5">
                    {alertCount > 99 ? '99+' : alertCount}
                  </span>
                )}
              </Link>
            ))}
            <div className="border-t border-white/20 mt-2 pt-2">
              <p className="px-4 py-1 text-xs font-bold text-white/50 uppercase tracking-wider">Configuración</p>
              {configMenu.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white/90 hover:text-white hover:bg-white/15 transition duration-200 text-sm"
                  onClick={() => setIsOpen(false)}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
