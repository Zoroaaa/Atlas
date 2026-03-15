import React, { forwardRef } from 'react';
import { clsx } from 'clsx';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, error, hint, fullWidth = false, className, id, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div className={clsx('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={clsx(
            'w-full rounded-lg border bg-white px-4 py-2.5 text-surface-900 transition-all duration-200',
            'placeholder:text-surface-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'dark:bg-surface-800 dark:text-surface-100 dark:border-surface-600',
            'disabled:cursor-not-allowed disabled:bg-surface-100 disabled:dark:bg-surface-900',
            'resize-none',
            error
              ? 'border-error-500 focus:ring-error-500'
              : 'border-surface-300 dark:border-surface-600',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-error-600 dark:text-error-400">{error}</p>
        )}
        {hint && !error && (
          <p className="text-sm text-surface-500 dark:text-surface-400">{hint}</p>
        )}
      </div>
    );
  }
);

TextArea.displayName = 'TextArea';
