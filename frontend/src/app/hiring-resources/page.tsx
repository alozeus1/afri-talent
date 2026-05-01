import Link from "next/link";
import { HIRING_RESOURCE_GUIDES } from "@/lib/market-reference-data";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function HiringResourcesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10 max-w-3xl">
        <Badge variant="info">Employer resources</Badge>
        <h1 className="mt-3 text-4xl font-bold text-gray-900">Hiring Resources</h1>
        <p className="mt-3 text-lg leading-8 text-gray-600">
          Practical guidance for employers hiring African tech talent across remote, contractor, and relocation workflows.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {HIRING_RESOURCE_GUIDES.map((guide) => (
          <Card key={guide.title} className="h-full">
            <CardHeader>
              <h2 className="text-xl font-semibold text-gray-900">{guide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">{guide.summary}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {guide.points.map((point) => (
                  <li key={point} className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-10 border-emerald-100 bg-emerald-50">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-emerald-950">Ready to use these workflows?</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">
              Browse verified talent, build a talent pool, and use candidate comparison to keep hiring decisions evidence-based.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/employer/talent">
              <Button>Browse Talent</Button>
            </Link>
            <Link href="/register?role=employer">
              <Button variant="outline">Create Employer Account</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
