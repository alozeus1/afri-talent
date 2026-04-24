import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/jobs", "/companies", "/pricing", "/trust", "/learning", "/salaries", "/interviews"],
        disallow: [
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/admin/",
          "/candidate/",
          "/employer/",
          "/messages",
          "/notifications",
          "/billing",
          "/auth/",
        ],
      },
    ],
  };
}
