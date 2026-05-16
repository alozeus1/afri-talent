import { cookies } from "next/headers";
import { PricingExperience } from "@/components/pricing/pricing-experience";
import { getPricingServer } from "@/lib/server-public-api";

const DEFAULT_REGION = "ROW";

export default async function PricingPage() {
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
