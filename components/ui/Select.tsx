import React from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}

export default function Select({ label, error, options, className = '', ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600
          bg-white dark:bg-gray-800
          text-gray-900 dark:text-gray-50
          focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
          transition-all duration-200 dark-mode-transition
          ${error ? 'border-danger-500' : ''}
          ${className}
        `}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-danger-600 dark:text-red-400 mt-1">{error}</p>}
    </div>
  )
}
