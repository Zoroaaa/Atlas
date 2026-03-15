import React, { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, id, checked, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <label htmlFor={checkboxId} className={clsx('flex items-start gap-3 cursor-pointer group', className)}>
        <div className="relative flex-shrink-0 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            checked={checked}
            className="sr-only peer"
            {...props}
          />
          <div
            className={clsx(
              'w-5 h-5 rounded border-2 transition-all duration-200',
              'border-surface-300 dark:border-surface-600',
              'peer-checked:border-primary-600 peer-checked:bg-primary-600',
              'dark:peer-checked:border-primary-500 dark:peer-checked:bg-primary-500',
              'peer-focus:ring-2 peer-focus:ring-primary-500 peer-focus:ring-offset-2',
              'dark:peer-focus:ring-offset-surface-900',
              'group-hover:border-primary-500'
            )}
          >
            <Check
              className={clsx(
                'w-3 h-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
                'opacity-0 scale-50 transition-all duration-200',
                'peer-checked:opacity-100 peer-checked:scale-100'
              )}
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <span className="text-sm font-medium text-surface-900 dark:text-surface-100">
                {label}
              </span>
            )}
            {description && (
              <span className="text-sm text-surface-500 dark:text-surface-400">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
