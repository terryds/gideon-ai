type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  id: string;
  disabled?: boolean;
};

export function Toggle({ checked, onChange, label, description, id, disabled }: Props) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-disabled:opacity-50 dark:bg-slate-700"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4"
        />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-xs text-slate-600 dark:text-slate-400">{description}</span>}
      </span>
    </label>
  );
}
