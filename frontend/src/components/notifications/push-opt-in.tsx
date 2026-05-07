"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pushNotifications, NotificationPreference } from "@/lib/api";
import { registerServiceWorker, urlBase64ToUint8Array } from "@/lib/push-client";
import { Button } from "@/components/ui/button";

export function PushOptInCard() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [pushAvailable, setPushAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
    pushNotifications
      .getPreferences()
      .then(setPreferences)
      .catch(() => {
        // ignore for now
      });
    pushNotifications
      .getVapidPublicKey()
      .then(() => setPushAvailable(true))
      .catch(() => setPushAvailable(false));
  }, []);

  const subscribe = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (!("Notification" in window)) {
        throw new Error("This browser does not support web notifications.");
      }

      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        throw new Error("Notification permission was not granted.");
      }

      const { publicKey } = await pushNotifications.getVapidPublicKey();
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await pushNotifications.subscribe(subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setMessage("Push notifications enabled successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable push notifications.");
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (key: keyof NotificationPreference, value: boolean) => {
    if (!preferences) return;
    const optimistic = { ...preferences, [key]: value };
    setPreferences(optimistic);
    try {
      const updated = await pushNotifications.updatePreferences({ [key]: value });
      setPreferences(updated);
    } catch {
      setPreferences(preferences);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Push Notifications</h3>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
        Get saved-search alerts, interview reminders, application updates, and other urgent candidate nudges in real time.
      </p>

      {pushAvailable === false ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Browser push notifications are being configured. Email and in-app alert preferences still work.
        </div>
      ) : permission !== "granted" ? (
        <Button className="mt-4" onClick={subscribe} disabled={loading}>
          {loading ? "Enabling..." : pushAvailable === null ? "Checking push setup..." : "Enable Push Notifications"}
        </Button>
      ) : (
        <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-400">Notifications enabled</p>
      )}

      {preferences && (
        <div className="mt-4 space-y-2">
          {(
            [
              ["savedSearchAlerts", "Saved search alerts"],
              ["interviewReminders", "Interview reminders"],
              ["applicationUpdates", "Application updates"],
              ["subscriptionNotices", "Subscription notices"],
            ] as Array<[keyof NotificationPreference, string]>
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-200">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(preferences[key])}
                onChange={(event) => updatePreference(key, event.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Link href="/candidate/preferences" className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
          Manage all alert preferences
        </Link>
      </div>

      {message && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
