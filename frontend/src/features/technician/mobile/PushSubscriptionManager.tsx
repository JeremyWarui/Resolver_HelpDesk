/**
 * PushSubscriptionManager — icon button in the mobile header.
 *
 * On first render: fetches VAPID key, requests permission, subscribes device.
 * Icon shows current state (bell / bell-off / spinner).
 */

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';

type State = 'idle' | 'loading' | 'subscribed' | 'denied' | 'unsupported';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function getVapidKey(): Promise<string> {
  const { data } = await apiClient.get('/push/vapid-key/');
  return data.vapid_public_key;
}

async function subscribeDevice(vapidKey: string): Promise<PushSubscription> {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
  });
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  await apiClient.post('/push/subscribe/', {
    endpoint: json.endpoint,
    keys: json.keys,
  });
}

export function PushSubscriptionManager() {
  const [state, setState] = useState<State>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    // Auto-subscribe on mount
    handleSubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubscribe() {
    if (state === 'loading') return;
    setState('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        toast.error('Notifications blocked. Enable in browser settings.');
        return;
      }
      const vapidKey = await getVapidKey();
      const sub = await subscribeDevice(vapidKey);
      await saveSubscription(sub);
      setState('subscribed');
      toast.success('Push notifications enabled');
    } catch (err) {
      console.error('Push subscription failed:', err);
      setState('idle');
    }
  }

  if (state === 'unsupported') return null;

  return (
    <button
      onClick={state === 'subscribed' ? undefined : handleSubscribe}
      disabled={state === 'loading'}
      title={state === 'subscribed' ? 'Notifications active' : state === 'denied' ? 'Notifications blocked' : 'Enable notifications'}
      className="p-2 rounded-lg text-muted-foreground active:bg-gray-100 disabled:opacity-40"
    >
      {state === 'loading'    && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
      {state === 'subscribed' && <Bell className="h-[18px] w-[18px] text-primary" />}
      {state === 'denied'     && <BellOff className="h-[18px] w-[18px] text-destructive" />}
      {state === 'idle'       && <Bell className="h-[18px] w-[18px]" />}
    </button>
  );
}
