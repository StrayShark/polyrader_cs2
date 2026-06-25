import type { LucideIcon } from 'lucide-react';
import { cn } from '../utils/cn';

interface EmptyStateGuideProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  steps?: string[];
  className?: string;
}

export function EmptyStateGuide({ icon: Icon, title, description, steps, className }: EmptyStateGuideProps) {
  return (
    <div className={cn('rounded-md border border-dashed border-border bg-muted/20 px-6 py-8 text-center', className)}>
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/70" />
      <h3 className="mt-3 text-sm font-medium">{title}</h3>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {steps && steps.length > 0 && (
        <ol className="mx-auto mt-4 max-w-md space-y-2 text-left text-xs text-muted-foreground">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
