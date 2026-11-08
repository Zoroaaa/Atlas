import React from 'react';
import { clsx } from 'clsx';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled, 'aria-label': ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={clsx(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'
    )}
  >
    <span
      className={clsx(
        'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-[22px]' : 'translate-x-0.5'
      )}
    />
  </button>
);
