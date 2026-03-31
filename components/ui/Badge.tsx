import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export default function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200',
    success: 'bg-success-100 dark:bg-green-900/30 text-success-800 dark:text-green-400',
    warning: 'bg-warning-100 dark:bg-yellow-900/30 text-warning-800 dark:text-yellow-400',
    danger: 'bg-danger-100 dark:bg-red-900/30 text-danger-800 dark:text-red-400',
    info: 'bg-primary-100 dark:bg-blue-900/30 text-primary-800 dark:text-blue-400',
  }

  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold dark-mode-transition ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}
