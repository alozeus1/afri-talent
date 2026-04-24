"use client";

import { useEffect, useState } from "react";

type EffectiveConnectionType = "slow-2g" | "2g" | "3g" | "4g";

interface BrowserNetworkInformation {
  effectiveType?: EffectiveConnectionType;
  saveData?: boolean;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

declare global {
  interface Navigator {
    connection?: BrowserNetworkInformation;
    mozConnection?: BrowserNetworkInformation;
    webkitConnection?: BrowserNetworkInformation;
  }
}

export interface NetworkProfile {
  online: boolean;
  saveData: boolean;
  effectiveType: EffectiveConnectionType | null;
  isLowBandwidth: boolean;
}

function getConnection(): BrowserNetworkInformation | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.connection || navigator.mozConnection || navigator.webkitConnection;
}

export function readNetworkProfile(): NetworkProfile {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return {
      online: true,
      saveData: false,
      effectiveType: null,
      isLowBandwidth: false,
    };
  }

  const connection = getConnection();
  const effectiveType = connection?.effectiveType ?? null;
  const saveData = Boolean(connection?.saveData);
  const online = navigator.onLine;
  const isLowBandwidth = saveData || effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";

  return {
    online,
    saveData,
    effectiveType,
    isLowBandwidth,
  };
}

export function useNetworkProfile() {
  const [profile, setProfile] = useState<NetworkProfile>(() => readNetworkProfile());

  useEffect(() => {
    const update = () => setProfile(readNetworkProfile());
    const connection = getConnection();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    connection?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      connection?.removeEventListener?.("change", update);
    };
  }, []);

  return profile;
}
