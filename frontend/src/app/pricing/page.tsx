import type { Metadata } from "next";
import { cookies } from "next/headers";
import { FreeForEveryone } from "@/components/pricing/free-for-everyone";
import { PricingExperience } from "@/components/pricing/pricing-experience";
import { FREE_MODE } from "@/lib/free-mode";
import { getPricingServer } from "@/lib/server-public-api";

const DEFAULT_REGION = "ROW";

export const metadata: Metadata = FREE_MODE
  ? {
      title: "Free for everyone | AfriTalent",
      description:
        "AfriTalent is free for candidates and employers. No credit card, no trial, no catch.",
    }
  : {}; // Flag off: keep the root layout metadata, as before.

export default async function PricingPage() {
  if (FREE_MODE) {
    return <FreeForEveryone />;
  }

  const cookieStore = await cookies();
  const authCookie = cookieStore.get("auth_token")?.value;

  const { data } = await getPricingServer(
    authCookie ? { authCookie } : { region: DEFAULT_REGION },
  );

  return (
    <PricingExperience
      initialPricingData={data}
      initialRegion={data?.region ?? DEFAULT_REGION}
    />
  );
}
