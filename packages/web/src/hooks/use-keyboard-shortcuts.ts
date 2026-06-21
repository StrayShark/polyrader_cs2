import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const PAGE_KEYS: Record<string, string> = {
  '1': '/',
  '2': '/daily',
  '3': '/whales',
  '4': '/esports',
  '5': '/signals',
  '6': '/ai/config',
  '7': '/ai/stats',
};

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + number = navigate to page
      if (isMod && PAGE_KEYS[e.key]) {
        e.preventDefault();
        navigate(PAGE_KEYS[e.key]);
        return;
      }

      // Cmd/Ctrl + R = refresh (let browser handle, but also trigger data refresh)
      // We let the default browser refresh happen

      // Cmd/Ctrl + , = settings
      if (isMod && e.key === ',') {
        e.preventDefault();
        navigate('/ai/config');
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);
}
