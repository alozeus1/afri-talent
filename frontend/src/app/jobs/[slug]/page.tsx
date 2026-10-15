import { notFound } from "next/navigation";
import { JobJsonLd } from "@/components/jobs/job-jsonld";
import { getJobDetailServer } from "@/lib/server-public-api";
import { JobDetailError, JobDetailView } from "./job-detail-view";

type JobDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { slug } = await params;
  const { job, error, notFound: missing } = await getJobDetailServer(slug);

  if (missing) {
    notFound();
  }

  if (error || !job) {
    return <JobDetailError error={error} />;
  }

  return (
    <>
      <JobJsonLd job={job} />
      <JobDetailView job={job} />
    </>
  );
}
