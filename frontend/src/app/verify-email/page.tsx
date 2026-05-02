"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { emailVerification } from "@/lib/api";

function VerifyEmailInner() {
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
        if (data.message) {
          setStatus("success");
          setMessage(data.message || "Email verified successfully!");
          if (typeof window !== "undefined") {
            const returnTo = sessionStorage.getItem("verifyReturnTo");
            if (returnTo) {
              sessionStorage.removeItem("verifyReturnTo");
              setReturnToUrl(returnTo);
              setTimeout(() => { window.location.href = returnTo; }, 1800);
            }
          }
        }
      } catch (verificationError) {
        setStatus("error");
        setMessage(
          verificationError instanceof Error
            ? verificationError.message
            : "Something went wrong. Please try again.",
        );
      }
    };

    verify();
  }, [token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          {status === "loading" && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Verifying your email...</h2>
              <p className="text-gray-600 dark:text-gray-300">Please wait a moment.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Email Verified!</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">{message}</p>
              {returnToUrl ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Returning you to your job application...</p>
              ) : (
                <Link href="/candidate">
                  <Button className="w-full">Go to Dashboard</Button>
                </Link>
              )}
            </>
          )}

          {(status === "error" || !token) && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Verification Failed</h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6">{token ? message : "No verification token provided."}</p>
              <Link href="/login">
                <Button variant="outline" className="w-full">Back to Login</Button>
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
      </div>
    }>
      <VerifyEmailInner />
    </Suspense>
  );
}
