import * as React from 'react';
import { cn } from '@/utils/cn';

interface TooltipContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

function useTooltip() {
  const ctx = React.useContext(TooltipContext);
  if (!ctx) throw new Error('Tooltip components must be used within <Tooltip>');
  return ctx;
}

interface TooltipProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Tooltip({ children, defaultOpen }: TooltipProps) {
  const [open, setOpen] = React.useState(defaultOpen || false);
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  );
}

function TooltipTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TooltipContent({
  className,
  side = 'top',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const ctx = useTooltip();
  if (!ctx.open) return null;

  const sideClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div
      role="tooltip"
      className={cn(
        'absolute z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        sideClasses[side],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
