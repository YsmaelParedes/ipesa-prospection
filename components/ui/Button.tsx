import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'font-semibold rounded-lg transition-all duration-200 inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer dark-mode-transition'

  const variants = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-500',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
    success: 'bg-success-600 text-white hover:bg-success-700',
    danger: 'bg-danger-600 text-white hover:bg-danger-700',
    outline: 'border-2 border-primary-600 text-primary-600 hover:bg-primary-50 dark:border-primary-400 dark:text-primary-400 dark:hover:bg-gray-800',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
      )}
      {children}
    </button>
  )
}
