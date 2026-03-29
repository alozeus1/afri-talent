"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface RetryButtonProps {
  label?: string;
  className?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
}

export function RetryButton({
  label = "Try again",
  className = "",
  variant = "outline",
}: RetryButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={isPending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
      }}
    >
      {isPending ? "Refreshing..." : label}
    </Button>
  );
}
