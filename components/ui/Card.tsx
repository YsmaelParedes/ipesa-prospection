import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated'
}

export default function Card({ variant = 'default', className = '', children, ...props }: CardProps) {
  const variants = {
    default: 'bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 dark-mode-transition',
    bordered: 'bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 dark-mode-transition',
    elevated: 'bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 dark-mode-transition',
  }

  return (
    <div className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </div>
  )
}
