"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { pushNotifications, NotificationPreference } from "@/lib/api";
import { registerServiceWorker, urlBase64ToUint8Array } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { useCandidateT, type CandidateMessageKey } from "@/lib/i18n/candidate-messages";

class PushSetupError extends Error {
  constructor(public readonly key: CandidateMessageKey) {
    super(key);
  }
}

const PUSH_PREFS: Array<keyof NotificationPreference> = [
  "savedSearchAlerts",
  "interviewReminders",
  "applicationUpdates",
  "subscriptionNotices",
];

export function PushOptInCard() {
  const t = useCandidateT();
  const locale = useLocale();
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [pushAvailable, setPushAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<CandidateMessageKey | null>(null);
  const [error, setError] = useState<CandidateMessageKey | null>(null);

  useEffect(() => {
    setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
    pushNotifications
      .getPreferences()
      .then(setPreferences)
      .catch(() => {
        // Preferences are optional here; the full preference center handles errors.
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
        throw new PushSetupError("push.unsupported");
      }

      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        throw new PushSetupError("push.denied");
      }

      const { publicKey } = await pushNotifications.getVapidPublicKey();
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await pushNotifications.subscribe(
        subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } },
      );
      setMessage("push.success");
    } catch (err) {
      setError(err instanceof PushSetupError ? err.key : "push.failed");
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
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-text"
        >
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-fg">{t("push.title")}</h3>
          <p className="mt-1 text-sm text-fg-secondary">{t("push.body")}</p>
        </div>
      </div>

      {pushAvailable === false ? (
        <div className="mt-4 rounded-xl border border-warning-line bg-warning-soft p-3 text-sm text-fg-secondary">
          {t("push.unavailable")}
        </div>
      ) : permission !== "granted" ? (
        <Button className="mt-4" onClick={subscribe} disabled={loading || pushAvailable === null}>
          {loading ? t("push.enabling") : pushAvailable === null ? t("push.checking") : t("push.enable")}
        </Button>
      ) : (
        <p className="mt-4 text-sm font-medium text-success">{t("push.enabled")}</p>
      )}

      {preferences && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {PUSH_PREFS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-sm text-fg-secondary">
              <span>{t(`push.pref.${key}` as CandidateMessageKey)}</span>
              <input
                type="checkbox"
                checked={Boolean(preferences[key])}
                onChange={(event) => updatePreference(key, event.target.checked)}
                className="h-4 w-4 rounded border-line-strong accent-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-4">
        <Link
          href={localizePath("/candidate/preferences", locale)}
          className="text-sm font-medium text-primary-text hover:underline"
        >
          {t("push.manageAll")}
        </Link>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-success">
          {t(message)}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t(error)}
        </p>
      )}
    </div>
  );
}
