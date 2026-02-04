import Link from "next/link";
import { Job } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface JobCardProps {
  job: Job;
}

export function JobCard({ job }: JobCardProps) {
  const formatSalary = () => {
    if (!job.salaryMin && !job.salaryMax) return null;
    const currency = job.currency || "USD";
    const min = job.salaryMin ? `${currency} ${job.salaryMin.toLocaleString()}` : "";
    const max = job.salaryMax ? `${currency} ${job.salaryMax.toLocaleString()}` : "";
    if (min && max) return `${min} - ${max}`;
    return min || max;
  };

  const salary = formatSalary();

  return (
    <Link href={`/jobs/${job.slug}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-gray-900 mb-1 line-clamp-1">
                {job.title}
              </h3>
              <p className="text-emerald-600 font-medium">{job.employer.companyName}</p>
            </div>
            <Badge variant="success">{job.type}</Badge>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {job.location}
            </span>
            <span className="inline-flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {job.seniority}
            </span>
          </div>

          {salary && (
            <p className="text-gray-900 font-semibold mb-4">{salary}/year</p>
          )}

          {job.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {job.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
              {job.tags.length > 3 && (
                <Badge variant="default">+{job.tags.length - 3}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
