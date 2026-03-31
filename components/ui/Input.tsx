import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export default function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-50
            focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
            placeholder-gray-400 dark:placeholder-gray-500
            transition-all duration-200 dark-mode-transition
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-danger-500 focus:border-danger-500' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  )
}
