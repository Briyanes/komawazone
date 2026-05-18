import { ChevronDown } from 'lucide-react';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  className?: string;
}

export function SelectInput({ children, className = '', style, ...props }: SelectInputProps) {
  return (
    <div className={`relative inline-flex ${className}`}>
      <select
        {...props}
        className="w-full appearance-none rounded-lg pl-3 pr-8 py-2 text-sm outline-none cursor-pointer"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          color: 'var(--text-primary)',
          ...style,
        }}
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 shrink-0"
        style={{ color: 'var(--text-tertiary)' }}
      />
    </div>
  );
}
