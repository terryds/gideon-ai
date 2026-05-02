import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-indigo-300 dark:disabled:bg-indigo-900',
  secondary:
    'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  ghost:
    'bg-transparent text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
