import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium font-mono transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        green: 'border-transparent bg-green/10 text-green',
        red: 'border-transparent bg-red/10 text-red',
        yellow: 'border-transparent bg-yellow/10 text-yellow',
        blue: 'border-transparent bg-blue/10 text-blue',
        purple: 'border-transparent bg-purple/10 text-purple',
        cyan: 'border-transparent bg-cyan/10 text-cyan',
        orange: 'border-transparent bg-orange/10 text-orange',
        caption: 'border-transparent bg-transparent text-muted-foreground uppercase tracking-wider text-[10px] font-medium font-sans',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
