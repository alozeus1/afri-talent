const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY?.trim() || "";
const FLUTTERWAVE_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY?.trim() || "";
const FLUTTERWAVE_SECRET_HASH = process.env.FLUTTERWAVE_SECRET_HASH?.trim() || "";
const FLUTTERWAVE_PAYMENT_OPTIONS = process.env.FLUTTERWAVE_PAYMENT_OPTIONS?.trim() || "card,banktransfer,ussd";
export function isFlutterwaveConfigured() {
    return FLUTTERWAVE_SECRET_KEY.length > 0 && FLUTTERWAVE_PUBLIC_KEY.length > 0;
}
export function getFlutterwaveSecretHash() {
    return FLUTTERWAVE_SECRET_HASH;
}
export function getFlutterwavePublicKey() {
    return FLUTTERWAVE_PUBLIC_KEY;
}
function minorToMajor(amountMinor, currency) {
    const zeroDecimalCurrencies = new Set(["JPY", "KRW", "XOF", "XAF"]);
    const divisor = zeroDecimalCurrencies.has(currency.toUpperCase()) ? 1 : 100;
    return (amountMinor / divisor).toFixed(divisor === 1 ? 0 : 2);
}
async function flutterwaveRequest(path, init) {
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
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new Error(payload?.message || `Flutterwave request failed with ${response.status}`);
    }
    return payload.data;
}
export async function createFlutterwaveCheckout(input) {
    return flutterwaveRequest("/payments", {
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
export async function verifyFlutterwaveTransaction(transactionId) {
    return flutterwaveRequest(`/transactions/${transactionId}/verify`, {
        method: "GET",
    });
}
//# sourceMappingURL=flutterwave.js.map