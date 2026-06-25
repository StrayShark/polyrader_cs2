import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1 text-xs text-muted-foreground', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />}
            {item.to && !isLast ? (
              <Link to={item.to} className="hover:text-foreground transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-foreground' : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
