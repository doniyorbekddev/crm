import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Input } from './Input';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Qidirish...', className, label = 'Qidirish' }: SearchInputProps) {
  return (
    <div className={cn('w-full', className)}>
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        leftIcon={<Search className="size-4" aria-hidden />}
        rightSlot={
          value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Qidiruvni tozalash"
              className="grid size-8 place-items-center rounded-md text-fg-subtle hover:text-fg"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : undefined
        }
        className="[&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}
