import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualListProps {
  /** Total number of items */
  count: number;
  /** Estimated row height in px (default 48) */
  estimateSize?: number;
  /** Max container height in px (default 600) */
  maxHeight?: number;
  /** Render header row (sticky, optional) */
  header?: ReactNode;
  /** Render item at given index */
  children: (index: number) => ReactNode;
  className?: string;
}

/**
 * Virtualized list for large datasets.
 * Only renders items visible in the viewport + overscan.
 * Uses div-based layout (not table) for reliable virtualization.
 */
export function VirtualList({
  count,
  estimateSize = 48,
  maxHeight = 600,
  header,
  children,
  className,
}: VirtualListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  return (
    <div className={className}>
      {header}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {children(virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
