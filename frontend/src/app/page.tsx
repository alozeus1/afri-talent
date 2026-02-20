import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/hero/pattern.svg')] opacity-10" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-sm font-medium">Now aggregating jobs from 15+ global platforms</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Unlock Global Opportunities for African Talent
              </h1>
              <p className="text-xl md:text-2xl text-emerald-100 mb-8">
                AI-powered job matching connecting skilled professionals across the continent with inclusive, world-class employers offering visa sponsorship and remote work.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href="/jobs">
                  <Button size="lg" className="bg-white text-emerald-700 hover:bg-gray-100 w-full sm:w-auto font-semibold">
                    Find Your Dream Job
                  </Button>
                </Link>
                <Link href="/register?role=employer">
                  <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 w-full sm:w-auto">
                    Post a Job
                  </Button>
                </Link>
              </div>
              {/* Quick filter chips */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-emerald-200">Popular:</span>
                <Link href="/jobs?filter=remote" className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition">
                  Remote
                </Link>
                <Link href="/jobs?filter=visa" className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition">
                  Visa Sponsorship
                </Link>
                <Link href="/jobs?filter=relocation" className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-full text-sm font-medium transition">
                  Relocation
                </Link>
              </div>
            </div>
            <div className="hidden lg:block relative">
              <div className="relative w-full h-[500px]">
                <Image
                  src="/images/hero/homepage-design.png"
                  alt="AfriTalent Platform Preview"
                  fill
                  className="object-contain rounded-lg shadow-2xl"
                  priority
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">10K+</div>
              <div className="text-gray-600">Active Candidates</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">500+</div>
              <div className="text-gray-600">Partner Companies</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">2K+</div>
              <div className="text-gray-600">Jobs Posted</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">54</div>
              <div className="text-gray-600">African Countries</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Professionals Choose AfriTalent
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Empowering your career journey across borders with specialized tools and insights
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Remote-First Jobs
              </h3>
              <p className="text-gray-600 text-sm">
                Work from anywhere with top global companies hiring from Africa.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Visa Sponsorship Clarity
              </h3>
              <p className="text-gray-600 text-sm">
                Clear info on visa support and legal requirements for every role.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Relocation Support
              </h3>
              <p className="text-gray-600 text-sm">
                Guidance and assistance for moving abroad for your dream job.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                AI-Powered Matching
              </h3>
              <p className="text-gray-600 text-sm">
                Smart job matching and tailored resumes powered by Claude AI.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Job Sources Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Jobs From Global Platforms</h2>
            <p className="text-gray-600">We aggregate opportunities from leading job boards worldwide</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            <div className="text-center">
              <div className="font-semibold text-gray-700">RemoteOK</div>
              <div className="text-xs text-gray-500">Remote Global</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700">We Work Remotely</div>
              <div className="text-xs text-gray-500">Remote Global</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700">Jobberman</div>
              <div className="text-xs text-gray-500">Africa</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700">BrighterMonday</div>
              <div className="text-xs text-gray-500">East Africa</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700">Adzuna</div>
              <div className="text-xs text-gray-500">US, UK, EU, CA</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-gray-700">+ More</div>
              <div className="text-xs text-gray-500">Coming Soon</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join our community of talented African professionals working with companies around the world.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto">
                Create Your Profile
              </Button>
            </Link>
            <Link href="/resources">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 w-full sm:w-auto">
                Explore Resources
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
