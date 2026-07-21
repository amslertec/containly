import { cn } from '../../lib/utils';

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border text-left">{children}</tr>
    </thead>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('eyebrow whitespace-nowrap px-3 py-2.5 font-semibold first:pl-4 last:pr-4', className)}>
      {children}
    </th>
  );
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableRowElement>;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn('border-b border-border last:border-0 transition-colors hover:bg-surface-hover', className)}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
  onClick,
}: {
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}) {
  return (
    <td onClick={onClick} className={cn('whitespace-nowrap px-3 py-2.5 align-middle first:pl-4 last:pr-4', className)}>
      {children}
    </td>
  );
}
