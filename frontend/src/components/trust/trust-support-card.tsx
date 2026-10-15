import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface TrustSupportCardProps {
  title?: string;
  description?: string;
  reportHref: string;
  supportEmail?: string;
}

export function TrustSupportCard({
  title = "Need a human review?",
  description = "If a verification result looks wrong, a recruiter is pressuring you off-platform, or you need help understanding a trust state, contact support or file a trust report.",
  reportHref,
  supportEmail = "support@afritalent.com",
}: TrustSupportCardProps) {
  return (
    <Card className="border-slate-200 bg-slate-50">
      <CardHeader>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Link href={reportHref}>
          <Button size="sm">Report suspicious activity</Button>
        </Link>
        <Link
          href="/contact?topic=TRUST_SAFETY"
          prefetch={false}
          className="inline-flex items-center justify-center rounded-lg border-2 border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          Contact support
        </Link>
        <a
          href={`mailto:${supportEmail}?subject=AfriTalent%20Trust%20Support`}
          className="inline-flex items-center px-1 text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
        >
          {supportEmail}
        </a>
      </CardContent>
    </Card>
  );
}
