"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, ShieldCheck, X } from 'lucide-react';
import { getValidationOverview, getValidationState, saveValidationSettings } from '../../app/validation/actions';
import { MAX_REMINDER_TIMES, VALIDATION_CHANGED_EVENT, VALIDATION_SETTINGS_EVENT, type ValidationOverview } from '../../types/validation';

const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toMinutes = (value: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const REFRESH_MS = 5 * 60_000;

export default function ValidationSettings() {
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<ValidationOverview | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [dayStart, setDayStart] = useState('07:00');
  const [times, setTimes] = useState<string[]>(['21:00']);
  const [deviceCount, setDeviceCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getValidationOverview());
    } catch (e) {
      console.error('[validation] could not load overview', e);
    }
  }, []);

  // Badge: on mount, every few minutes, and whenever goals change anywhere in the app
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOverview();
    const timer = setInterval(loadOverview, REFRESH_MS);
    window.addEventListener(VALIDATION_CHANGED_EVENT, loadOverview);
    return () => {
      clearInterval(timer);
      window.removeEventListener(VALIDATION_CHANGED_EVENT, loadOverview);
    };
  }, [loadOverview]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getValidationState()
      .then((s) => {
        if (cancelled) return;
        setEnabled(s.enabled);
        setDayStart(toTime(s.dayStartMin));
        setTimes(s.reminderTimes.map(toTime));
        setDeviceCount(s.pushDeviceCount);
      })
      .catch((e) => {
        console.error('[validation] could not load settings', e);
        if (!cancelled) setMessage(`Could not load settings: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const save = async () => {
    const dayStartMin = toMinutes(dayStart);
    const reminderTimes = times.map(toMinutes);
    if (dayStartMin === null || reminderTimes.some((t) => t === null)) {
      setMessage('Enter a valid time for every field.');
      return;
    }
    setBusy(true);
    try {
      const res = await saveValidationSettings({
        enabled,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dayStartMin,
        reminderTimes: reminderTimes as number[],
      });
      if (res.ok === false) {
        setMessage(res.error);
      } else {
        setMessage(
          enabled && deviceCount === 0
            ? 'Saved. Enable notifications on this device (bell icon) to receive reminders.'
            : 'Settings saved.'
        );
        window.dispatchEvent(new Event(VALIDATION_CHANGED_EVENT));
        window.dispatchEvent(new Event(VALIDATION_SETTINGS_EVENT));
      }
    } catch (e) {
      setMessage((e as Error).message || 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  };

  const badge = overview?.enabled && overview.dueCount > 0 ? (overview.dueCount > 9 ? '9+' : String(overview.dueCount)) : null;

  return (
    <>
      <button
        onClick={() => { setMessage(''); setOpen(true); }}
        aria-label={badge ? `Validation settings, ${overview?.dueCount} goals need validation` : 'Validation settings'}
        className="relative w-8 h-8 rounded-full border border-neutral-700 hover:border-white text-neutral-400 hover:text-white transition-all flex items-center justify-center"
      >
        <ShieldCheck className="w-4 h-4" />
        {badge && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-white text-black text-[9px] font-bold font-mono flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>

      {/* Portal: the header's backdrop-blur would otherwise become the containing block of this fixed overlay */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Validation settings"
            className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-5 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white font-headline">Validation</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-white">Goal validation</p>
                  <p className="text-[11px] text-neutral-500">
                    Write a short reflection on each goal regularly. Validating a sub-goal validates its parents too.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label="Goal validation"
                  onClick={() => setEnabled((v) => !v)}
                  className={`w-9 h-5 rounded-full border transition-colors relative shrink-0 ${enabled ? 'bg-white border-white' : 'bg-neutral-900 border-neutral-700'}`}
                >
                  <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${enabled ? 'left-[18px] bg-black' : 'left-0.5 bg-neutral-500'}`} />
                </button>
              </div>
            </section>

            <section className={`space-y-2 ${enabled ? '' : 'opacity-40'}`}>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">Day starts at</p>
              <input
                type="time"
                value={dayStart}
                onChange={(e) => setDayStart(e.target.value)}
                aria-label="Day start time"
                className="bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none focus:border-white"
              />
              <p className="text-[11px] text-neutral-500">A validation lasts until this time (times the goal&apos;s period in days).</p>
            </section>

            <section className={`space-y-2 ${enabled ? '' : 'opacity-40'}`}>
              <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">Reminder times</p>
              {times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => setTimes((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    aria-label={`Reminder time ${i + 1}`}
                    className="bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none focus:border-white"
                  />
                  {times.length > 1 && (
                    <button onClick={() => setTimes((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove reminder time" className="text-neutral-500 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {times.length < MAX_REMINDER_TIMES && (
                <button onClick={() => setTimes((prev) => [...prev, '12:00'])} className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white">
                  <Plus className="w-3.5 h-3.5" /> Add time
                </button>
              )}
              <p className="text-[11px] text-neutral-500">
                At these times you get one push notification listing the goals that need validating. It uses the devices enabled from the bell icon, and the bell&apos;s
                &quot;All notifications&quot; switch still applies.
              </p>
              {enabled && deviceCount === 0 && (
                <p className="text-[11px] text-neutral-400">No device is registered for notifications yet. Enable them from the bell icon.</p>
              )}
            </section>

            <button disabled={busy} onClick={save} className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-50">
              Save
            </button>
            {message && <p role="status" className="text-xs text-neutral-300">{message}</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
