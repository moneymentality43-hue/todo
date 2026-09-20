// components/AppHeader.tsx
import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { logoutAction } from '../app/actions';

interface AppHeaderProps {
  currentDate: string;
  currentTime: string;
  onOpenCreateModal?: (rail: 'urgent' | 'exploration') => void;
}

export default function AppHeader({ currentDate, currentTime, onOpenCreateModal }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname(); // Get current URL to highlight active tab

  const handleLogout = async () => {
    await logoutAction();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#222222] bg-black/95 backdrop-blur-md px-4 sm:px-6 py-4">
      <div className="max-w-6xl w-full mx-auto flex items-center justify-between gap-2 sm:gap-4">
        
        {/* Logo Section */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-700 items-center justify-center relative">
            <span className="w-2.5 h-2.5 rounded-full bg-white inline-block"></span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-none font-headline">GOF</h1>
            <p className="text-xs text-neutral-400 mt-1 font-mono hidden sm:block">{currentDate}</p>
          </div>
        </div>

        {/* Shrinking Center Navigation Taskbar */}
        <nav className="flex items-center p-1 rounded-full bg-neutral-950 border border-neutral-800 gap-1 flex-1 sm:flex-none justify-center max-w-[200px] sm:max-w-none">
          <Link href="/" className={`px-3 sm:px-4 py-1.5 rounded-full font-medium text-[11px] sm:text-xs transition-all ${
            pathname === '/' ? 'bg-white text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'
          }`}>
            Tasks
          </Link>
          <Link href="/progress" className={`px-3 sm:px-4 py-1.5 rounded-full font-medium text-[11px] sm:text-xs transition-all ${
            pathname === '/progress' ? 'bg-white text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'
          }`}>
            Progress
          </Link>
        </nav>

        {/* Actions Section */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-950 border border-neutral-800 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            <span className="text-white font-semibold">Optimal</span>
            <span className="text-neutral-600">•</span>
            <span className="text-neutral-300 font-mono tabular-nums">{currentTime}</span>
          </div>
          
          {/* Only show the Add button if the callback was provided (e.g., on the Tasks page) */}
          {onOpenCreateModal && (
            <button onClick={() => onOpenCreateModal('urgent')} className="w-8 h-8 rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center font-bold">
              <Plus className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          <button onClick={handleLogout} className="w-8 h-8 rounded-full border border-neutral-700 hover:border-white text-neutral-400 hover:text-white transition-all flex items-center justify-center font-bold text-[10px] sm:text-xs">
            Esc
          </button>
        </div>
      </div>
    </header>
  );
}
