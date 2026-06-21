import { Wifi, WifiOff, Clock, Activity, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWebSocket, type ConnectionState } from '../hooks/use-websocket';

const stateConfig: Record<ConnectionState, { icon: typeof Wifi; color: string; label: string }> = {
  connecting: { icon: Loader2, color: 'text-yellow', label: 'Connecting...' },
  connected: { icon: Wifi, color: 'text-green', label: 'Connected' },
  disconnected: { icon: WifiOff, color: 'text-red', label: 'Disconnected' },
  reconnecting: { icon: Loader2, color: 'text-yellow', label: 'Reconnecting...' },
};

export function StatusBar() {
  const [time, setTime] = useState(new Date());
  const { connectionState, latency } = useWebSocket();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const state = stateConfig[connectionState];
  const StateIcon = state.icon;

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-status-bar px-2 md:px-4 text-[10px] md:text-[11px] text-status-bar-foreground">
      <div className="flex items-center gap-2 md:gap-4">
        <span className={`flex items-center gap-1 ${state.color}`}>
          <StateIcon className={`h-3 w-3 ${connectionState === 'connecting' || connectionState === 'reconnecting' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{state.label}</span>
        </span>
        {connectionState === 'connected' && (
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
