import { SubscriptionPlan } from "@prisma/client";

const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY?.trim() || "";
const FLUTTERWAVE_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() || "";
const FLUTTERWAVE_PAYMENT_OPTIONS = process.env.FLUTTERWAVE_PAYMENT_OPTIONS?.trim() || "card,banktransfer,ussd";

export interface FlutterwaveCheckoutInput {
  txRef: string;
  amountMinor: number;
  currency: string;
  customer: {
    email: string;
    name: string | null;
  };
  redirectUrl: string;
  plan: SubscriptionPlan;
  interval: "MONTHLY" | "YEARLY";
  paymentPlanId: string;
  meta?: Record<string, unknown>;
}

interface FlutterwaveApiResponse<T> {
  status: string;
  message: string;
  data: T;
}

export interface FlutterwaveCheckoutResponse {
  link: string;
}

export interface FlutterwaveVerifiedTransaction {
  id: number;
  tx_ref: string;
  flw_ref?: string;
  amount: number;
  currency: string;
  status: string;
  payment_type?: string;
  customer?: {
    id?: number;
    email?: string;
    name?: string;
  };
  card?: {
    country?: string;
    type?: string;
    last_4digits?: string;
  };
  meta?: Record<string, unknown> | null;
}

export function isFlutterwaveConfigured(): boolean {
  return FLUTTERWAVE_SECRET_KEY.length > 0 && FLUTTERWAVE_PUBLIC_KEY.length > 0;
}

// Read at call time (not module load) so startup validation and tests observe
// the current environment. The webhook handler rejects all requests when this
// is unset — see routes/webhooks.ts and config/env.ts.
export function getFlutterwaveSecretHash(): string {
  return process.env.FLUTTERWAVE_SECRET_HASH?.trim() || "";
}

export function getFlutterwavePublicKey(): string {
  return FLUTTERWAVE_PUBLIC_KEY;
}

function minorToMajor(amountMinor: number, currency: string): string {
  const zeroDecimalCurrencies = new Set(["JPY", "KRW", "XOF", "XAF"]);
  const divisor = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
  return (amountMinor / divisor).toFixed(divisor === 1 ? 0 : 2);
}

async function flutterwaveRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!FLUTTERWAVE_SECRET_KEY) {
    throw new Error("FLUTTERWAVE_SECRET_KEY is not set");
  }

  const response = await fetch(`https://api.flutterwave.com/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as FlutterwaveApiResponse<T> | { message?: string };
  if (!response.ok) {
    throw new Error(payload?.message || `Flutterwave request failed with ${response.status}`);
  }

  return (payload as FlutterwaveApiResponse<T>).data;
}

export async function createFlutterwaveCheckout(input: FlutterwaveCheckoutInput): Promise<FlutterwaveCheckoutResponse> {
  return flutterwaveRequest<FlutterwaveCheckoutResponse>("/payments", {
    method: "POST",
    body: JSON.stringify({
      tx_ref: input.txRef,
      amount: minorToMajor(input.amountMinor, input.currency),
      currency: input.currency.toUpperCase(),
      redirect_url: input.redirectUrl,
      payment_options: FLUTTERWAVE_PAYMENT_OPTIONS,
      payment_plan: input.paymentPlanId,
      customer: {
        email: input.customer.email,
        name: input.customer.name ?? input.customer.email,
      },
      customizations: {
        title: "AfriTalent",
        description: `${input.plan.replaceAll("_", " ")} ${input.interval.toLowerCase()} subscription`,
      },
      meta: input.meta ?? {},
    }),
  });
}

export async function verifyFlutterwaveTransaction(transactionId: number): Promise<FlutterwaveVerifiedTransaction> {
  return flutterwaveRequest<FlutterwaveVerifiedTransaction>(`/transactions/${transactionId}/verify`, {
    method: "GET",
  });
}
