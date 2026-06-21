import { Clock, Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/use-websocket';
import { ConnectionStatus } from '../components/connection-status';

export function StatusBar() {
  const [time, setTime] = useState(new Date());
  const { wsStatus, latency } = useWebSocket();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-status-bar px-2 md:px-4 text-[10px] md:text-[11px] text-status-bar-foreground">
      <div className="flex items-center gap-2 md:gap-4">
        <ConnectionStatus status={wsStatus} />
        {wsStatus === 'connected' && (
          <span className="hidden sm:flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {latency}ms
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4">
        <span className="hidden sm:inline">PolyRader CS2 v0.1.0</span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {time.toLocaleTimeString()}
        </span>
      </div>
    </footer>
  );
}
