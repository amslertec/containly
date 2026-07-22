import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Checkbox im App-Stil (kein browser-natives `<input type=checkbox>`): leerer Kasten
 * mit Rahmen, gefüllt in Primärfarbe mit Häkchen bei „checked", Minus bei „mixed".
 */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  disabled,
  className,
  ...rest
}: CheckboxProps) {
  const filled = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange();
      }}
      className={cn(
        'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        filled
          ? 'border-primary bg-primary text-primary-ink'
          : 'border-border-strong bg-surface hover:border-primary',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" strokeWidth={3.5} />
      ) : checked ? (
        <Check className="h-3 w-3" strokeWidth={3.5} />
      ) : null}
    </button>
  );
}
