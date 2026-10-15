"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { emailVerification } from "@/lib/api";
import { localizePath, useLocale } from "@/lib/i18n/client";
import { usePublicT } from "@/lib/i18n/public-messages";

function VerifyEmailInner() {
  const tp = usePublicT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [returnToUrl, setReturnToUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const verify = async () => {
      try {
        const data = await emailVerification.verify(token);
        setStatus("success");
        setMessage(data.message || tp("site.verify.successDefault"));
        if (typeof window !== "undefined") {
          const returnTo = sessionStorage.getItem("verifyReturnTo");
          if (returnTo) {
            sessionStorage.removeItem("verifyReturnTo");
            setReturnToUrl(returnTo);
            setTimeout(() => { window.location.href = returnTo; }, 1800);
          }
        }
      } catch (verificationError) {
        setStatus("error");
        setMessage(
          verificationError instanceof Error
            ? verificationError.message
            : tp("site.verify.errorDefault"),
        );
      }
    };

    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify once per token; tp only formats copy
  }, [token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          {status === "loading" && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-fg mb-2">{tp("site.verify.loading")}</h2>
              <p className="text-fg-secondary">{tp("site.verify.wait")}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-success-soft rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-primary-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-fg mb-2">{tp("site.verify.successTitle")}</h2>
              <p className="text-fg-secondary mb-6">{message}</p>
              {returnToUrl ? (
                <p className="text-sm text-fg-muted">{tp("site.verify.returning")}</p>
              ) : (
                <Link href={localizePath("/candidate", locale)}>
                  <Button className="w-full">{tp("site.verify.dashboard")}</Button>
                </Link>
              )}
            </>
          )}

          {(status === "error" || !token) && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-danger-soft rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-fg mb-2">{tp("site.verify.failedTitle")}</h2>
              <p className="text-fg-secondary mb-6">{token ? message : tp("site.verify.noToken")}</p>
              <Link href={localizePath("/login", locale)}>
                <Button variant="outline" className="w-full">{tp("site.auth.backToLogin")}</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    }>
      <VerifyEmailInner />
    </Suspense>
  );
}
