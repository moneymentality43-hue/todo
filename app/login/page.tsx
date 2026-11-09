"use client";

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInAction, signUpAction } from '../actions';
import { FIELD_LIMITS, PASSWORD_RULES } from '../../lib/validation';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSignUp = mode === 'signup';

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        const res = await (isSignUp ? signUpAction(formData) : signInAction(formData));
        if (res?.error) {
          setError(res.error);
        } else {
          // Success! Redirect to the main app
          router.push('/');
        }
      } catch {
        setError('Something went wrong. Please try again.');
      }
    });
  };

  const inputCls = 'w-full bg-[#0e0e0e] text-white placeholder:text-[#8e9192]/60 text-sm px-4 py-3 rounded-lg focus:bg-[#201f1f] border border-[#2a2a2a] focus:border-white outline-none transition-colors';
  const labelCls = 'text-xs text-[#c4c7c8] uppercase tracking-wider font-semibold font-mono';

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
              <p className="text-sm text-[#c4c7c8]">{isSignUp ? 'Create your execution instrument account' : 'Sign in to your execution instrument'}</p>
            </div>

            <div role="tablist" className="grid grid-cols-2 p-1 mb-6 bg-[#0e0e0e] border border-[#2a2a2a] rounded-xl gap-1">
              {([['signin', 'Sign In'], ['signup', 'Sign Up']] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => switchMode(m)}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all ${mode === m ? 'bg-white text-black' : 'text-[#c4c7c8] hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  minLength={isSignUp ? FIELD_LIMITS.usernameMin : undefined}
                  maxLength={FIELD_LIMITS.usernameMax}
                  pattern={isSignUp ? '[A-Za-z0-9_.\\-]+' : undefined}
                  title={isSignUp ? 'Letters, numbers, underscore, dot and hyphen only' : undefined}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={isSignUp ? `${FIELD_LIMITS.usernameMin}-${FIELD_LIMITS.usernameMax} letters, numbers, _ . -` : 'Enter your username'}
                  className={inputCls}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="password">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={FIELD_LIMITS.passwordMax}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  placeholder={isSignUp ? 'Create a strong password' : 'Enter your password'}
                  className={inputCls}
                />
              </div>

              {isSignUp && (
                <>
                  <ul className="grid grid-cols-1 gap-1 text-[11px] font-mono" aria-label="Password requirements">
                    {PASSWORD_RULES.map(rule => (
                      <li key={rule.id} className={rule.test(password) ? 'text-white' : 'text-neutral-500'}>
                        {rule.test(password) ? '✓' : '○'} {rule.label}
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-col gap-1.5">
                    <label className={labelCls} htmlFor="confirmPassword">Confirm password</label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      maxLength={FIELD_LIMITS.passwordMax}
                      autoComplete="new-password"
                      placeholder="Re-enter your password"
                      className={inputCls}
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-white text-black text-sm font-bold hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                <span>{isPending ? 'Verifying...' : isSignUp ? 'Create Account' : 'Sign In'}</span>
              </button>

              <p className="text-center text-[11px] text-neutral-500 mt-2 font-mono">
                {isSignUp ? 'Already have an account? ' : 'New here? '}
                <button type="button" onClick={() => switchMode(isSignUp ? 'signin' : 'signup')} className="text-white underline underline-offset-2">
                  {isSignUp ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
