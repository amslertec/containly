import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * App-eigenes Dropdown (kein natives <select> → keine doppelte Browser-Chrome).
 * Konsistent gestyled, Portal-basiert, tastaturbedienbar.
 */
export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-ink',
            'outline-none transition-[border-color,box-shadow] hover:border-border-strong',
            'focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('flex-1 truncate text-left', !current && 'text-faint')}>
            {current?.label ?? placeholder ?? value}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-lg border border-border bg-surface p-1.5"
          style={{ boxShadow: 'var(--w-shadow-lg)' }}
        >
          {options.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              onSelect={() => onChange(o.value)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none',
                'text-ink data-[highlighted]:bg-surface-hover',
              )}
            >
              <span className="flex-1 truncate">{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
