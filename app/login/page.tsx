"use client";

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction } from '../actions';

export default function LoginPage() {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await loginAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        // Success! Redirect to the main app
        router.push('/');
      }
    });
  };

  return (
    <div className="bg-[#0e0e0e] text-[#e5e2e1] font-sans antialiased min-h-screen selection:bg-white selection:text-black">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0e0e0e]/90 backdrop-blur-xl border-b border-[#2a2a2a]/60">
        <div className="h-16 w-full px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-white"></span>
              <span className="font-headline text-xl font-bold tracking-tight text-white">GOF</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#444748]/40">
              <span className="text-xs text-[#c4c7c8] uppercase tracking-wider font-mono">SECURE ZONE</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full pt-16 min-h-[calc(100vh-4rem)] flex flex-col relative overflow-hidden">
        {/* Ambient subtle background depth light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] bg-white/5 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="relative w-full max-w-[440px] mx-auto z-10 flex-1 flex flex-col justify-center px-6">
          <div className="bg-[#1c1b1b] rounded-xl p-8 sm:p-10 shadow-2xl relative border border-[#2a2a2a]">
            
            {/* Signature GOF 5-Bar Light Indicator */}
            <div aria-label="System status 4 of 5 bars active" className="flex items-center gap-1.5 mb-8 w-full">
              <div className="h-1 flex-1 rounded-full bg-white"></div>
              <div className="h-1 flex-1 rounded-full bg-white"></div>
              <div className="h-1 flex-1 rounded-full bg-white"></div>
              <div className="h-1 flex-1 rounded-full bg-white"></div>
              <div className="h-1 flex-1 rounded-full bg-[#353534]"></div>
            </div>

            <div className="flex flex-col gap-2 mb-8">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-white"></span>
                <span className="text-xl font-bold tracking-tight text-white font-headline">GOF Auth</span>
              </div>
              <p className="text-sm text-[#c4c7c8]">Sign in to your execution instrument</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#c4c7c8] uppercase tracking-wider font-semibold font-mono" htmlFor="username">Username</label>
                <input 
                  id="username" 
                  name="username"
                  type="text" 
                  required
                  placeholder="Enter your username"
                  className="w-full bg-[#0e0e0e] text-white placeholder:text-[#8e9192]/60 text-sm px-4 py-3 rounded-lg focus:bg-[#201f1f] border border-[#2a2a2a] focus:border-white outline-none transition-colors" 
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#c4c7c8] uppercase tracking-wider font-semibold font-mono" htmlFor="password">Password</label>
                <input 
                  id="password" 
                  name="password"
                  type="password" 
                  required
                  placeholder="Enter your password"
                  className="w-full bg-[#0e0e0e] text-white placeholder:text-[#8e9192]/60 text-sm px-4 py-3 rounded-lg focus:bg-[#201f1f] border border-[#2a2a2a] focus:border-white outline-none transition-colors" 
                />
              </div>

              <button 
                type="submit" 
                disabled={isPending}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-white text-black text-sm font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                <span>{isPending ? 'Verifying...' : 'Sign In'}</span>
              </button>
              
              <p className="text-center text-[10px] text-neutral-500 mt-2 font-mono">
                (If account does not exist, it will be auto-created)
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
