"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import {
  getNotificationState,
  sendTestNotification,
  subscribePush,
  unsubscribePush,
  updateNotificationSettings,
  type NotificationState,
} from '../app/notifications/actions';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const toTime = (min: number | null) =>
  min === null ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const toMinutes = (value: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export default function NotificationSettings() {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);
  const [state, setState] = useState<NotificationState | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [typePrefs, setTypePrefs] = useState<Record<string, boolean>>({});
  const [quietOn, setQuietOn] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [diag, setDiag] = useState<string[]>([]);
  const [syncCount, setSyncCount] = useState(0);

  const applyState = useCallback((s: NotificationState) => {
    setState(s);
    setEnabled(s.enabled);
    setTypePrefs(Object.fromEntries(s.types.map((t) => [t.type, t.enabled])));
    setQuietOn(s.quietStart !== null && s.quietEnd !== null);
    if (s.quietStart !== null) setQuietStart(toTime(s.quietStart));
    if (s.quietEnd !== null) setQuietEnd(toTime(s.quietEnd));
  }, []);

  const loadState = useCallback(async () => applyState(await getNotificationState()), [applyState]);

  // Registers the service worker and reports what this browser supports / has subscribed.
  // Every step is recorded in `diag` so problems are visible in the panel instead of swallowed.
  useEffect(() => {
    const detect = async () => {
      const lines: string[] = [];
      lines.push(`secure context: ${window.isSecureContext}`);
      lines.push(`serviceWorker: ${'serviceWorker' in navigator}, PushManager: ${'PushManager' in window}, Notification: ${'Notification' in window}`);
      lines.push(`VAPID public key in client bundle: ${VAPID_PUBLIC_KEY ? `yes (${VAPID_PUBLIC_KEY.length} chars)` : 'NO - restart the dev server / redeploy'}`);
      const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!ok) return { supported: false, permission: 'default' as NotificationPermission, subscribed: false, synced: false, lines };

      lines.push(`permission: ${Notification.permission}`);
      let subscribed = false;
      let synced = false;
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        lines.push(`service worker active, scope ${reg.scope}`);
        const sub = await reg.pushManager.getSubscription();
        subscribed = Boolean(sub);
        lines.push(sub ? `browser subscription: yes (${new URL(sub.endpoint).host})` : 'browser subscription: none');

        // Keep the server copy fresh (also repairs a subscription the server lost)
        if (sub && Notification.permission === 'granted') {
          const json = sub.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            try {
              const res = await subscribePush({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }, navigator.userAgent);
              synced = res.ok;
              lines.push(res.ok ? 'server sync: ok' : `server sync FAILED: ${res.error}`);
            } catch (e) {
              console.error('[notifications] server sync failed', e);
              lines.push(`server sync FAILED: ${(e as Error).message}`);
            }
          } else {
            lines.push('browser subscription is missing keys');
          }
        }
      } catch (e) {
        console.error('[notifications] setup failed', e);
        lines.push(`setup FAILED: ${(e as Error).name}: ${(e as Error).message}`);
      }
      return { supported: true, permission: Notification.permission, subscribed, synced, lines };
    };

    let cancelled = false;
    void detect().then((r) => {
      if (cancelled) return;
      setSupported(r.supported);
      setPermission(r.permission);
      setDeviceSubscribed(r.subscribed);
      setDiag(r.lines);
      if (r.synced) setSyncCount((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getNotificationState()
      .then((s) => {
        if (!cancelled) applyState(s);
      })
      .catch((e) => {
        console.error('[notifications] could not load state', e);
        if (!cancelled) setMessage(`Could not load settings: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [open, syncCount, applyState]);

  const enableDevice = async () => {
    setBusy(true);
    setMessage('');
    try {
      if (!VAPID_PUBLIC_KEY) throw new Error('Push is not configured: the public key is missing from the client bundle. Restart the dev server or redeploy.');
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') throw new Error('Permission was not granted. Allow notifications in your browser settings.');

      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const json = sub.toJSON();
      const res = await subscribePush(
        { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } },
        navigator.userAgent
      );
      if (!res.ok) throw new Error(res.error);
      setDeviceSubscribed(true);
      await loadState();
      setMessage('This device will now receive notifications.');
    } catch (e) {
      console.error('[notifications] enable failed', e);
      const err = e as Error;
      setMessage(
        err.name === 'AbortError'
          ? 'The browser could not reach its push service (AbortError). Brave needs "Use Google services for push messaging" turned on; some networks/VPNs also block it.'
          : `${err.name !== 'Error' ? `${err.name}: ` : ''}${err.message || 'Could not enable notifications.'}`
      );
    } finally {
      setBusy(false);
    }
  };

  const disableDevice = async () => {
    setBusy(true);
    setMessage('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setDeviceSubscribed(false);
      await loadState();
      setMessage('Notifications disabled on this device.');
    } catch {
      setMessage('Could not disable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    const start = quietOn ? toMinutes(quietStart) : null;
    const end = quietOn ? toMinutes(quietEnd) : null;
    const res = await updateNotificationSettings({
      enabled,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      quietStart: start,
      quietEnd: end,
      typePrefs,
    });
    setMessage(res.ok ? 'Settings saved.' : res.error);
    setBusy(false);
  };

  const sendTest = async () => {
    setBusy(true);
    const res = await sendTestNotification();
    setMessage(res.message);
    setBusy(false);
  };

  const toggle = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full border transition-colors relative shrink-0 ${checked ? 'bg-white border-white' : 'bg-neutral-900 border-neutral-700'}`}
    >
      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${checked ? 'left-[18px] bg-black' : 'left-0.5 bg-neutral-500'}`} />
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Notification settings"
        className="relative w-8 h-8 rounded-full border border-neutral-700 hover:border-white text-neutral-400 hover:text-white transition-all flex items-center justify-center"
      >
        <Bell className="w-4 h-4" />
        {deviceSubscribed && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white" />}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-5 space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white font-headline">Notifications</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!supported ? (
              <p className="text-xs text-neutral-400">This browser does not support push notifications.</p>
            ) : (
              <>
                <section className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">This device</p>
                  {permission === 'denied' ? (
                    <p className="text-xs text-neutral-400">Notifications are blocked. Allow them in your browser site settings, then reload.</p>
                  ) : deviceSubscribed ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-neutral-300">Enabled on this device</span>
                      <button disabled={busy} onClick={disableDevice} className="text-xs px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:border-white hover:text-white disabled:opacity-50">
                        Turn off
                      </button>
                    </div>
                  ) : (
                    <button disabled={busy} onClick={enableDevice} className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-50">
                      Enable notifications on this device
                    </button>
                  )}
                  {state && <p className="text-[11px] text-neutral-500">{state.deviceCount} device(s) registered</p>}
                </section>

                {state && (
                  <>
                    <section className="space-y-3">
                      <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-mono">Preferences</p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-white">All notifications</span>
                        {toggle(enabled, setEnabled, 'All notifications')}
                      </div>
                      {state.types.map((t) => (
                        <div key={t.type} className={`flex items-start justify-between gap-3 ${enabled ? '' : 'opacity-40'}`}>
                          <div>
                            <p className="text-xs text-white">{t.label}</p>
                            <p className="text-[11px] text-neutral-500">{t.description}</p>
                          </div>
                          {toggle(typePrefs[t.type] ?? true, (v) => setTypePrefs((p) => ({ ...p, [t.type]: v })), t.label)}
                        </div>
                      ))}
                    </section>

                    <section className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-white">Quiet hours</p>
                          <p className="text-[11px] text-neutral-500">Repeats are skipped; deadline warnings wait until they end.</p>
                        </div>
                        {toggle(quietOn, setQuietOn, 'Quiet hours')}
                      </div>
                      {quietOn && (
                        <div className="flex items-center gap-2">
                          <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none focus:border-white" />
                          <span className="text-neutral-500 text-xs">to</span>
                          <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="bg-black border border-neutral-800 rounded-lg px-2 py-1.5 text-white text-xs font-mono outline-none focus:border-white" />
                        </div>
                      )}
                    </section>

                    <div className="flex items-center gap-2">
                      <button disabled={busy} onClick={save} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-white text-black hover:bg-neutral-200 disabled:opacity-50">
                        Save
                      </button>
                      <button disabled={busy || !deviceSubscribed} onClick={sendTest} title={deviceSubscribed ? undefined : 'Enable notifications on this device first'} className="flex-1 text-xs px-3 py-2 rounded-lg border border-neutral-700 text-neutral-300 hover:border-white hover:text-white disabled:opacity-50">
                        Send test
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {message && <p role="status" className="text-xs text-neutral-300">{message}</p>}

            <details className="text-[11px] text-neutral-500">
              <summary className="cursor-pointer hover:text-neutral-300">Diagnostics</summary>
              <ul className="mt-2 space-y-1 font-mono break-words">
                {diag.map((line) => (
                  <li key={line}>{line}</li>
                ))}
                {state && <li>server: {state.deviceCount} device(s) saved for your account</li>}
              </ul>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
