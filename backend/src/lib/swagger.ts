import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "AfriTalent API",
      version: "1.0.0",
      description:
        "Africa's premier platform connecting skilled tech professionals with global opportunities. " +
        "This API powers job listings, applications, AI-assisted tools, messaging, billing, and more. " +
        "Internal-only/admin-only endpoints are intentionally excluded from this public spec.",
      contact: { name: "AfriTalent Engineering", url: "https://afritalent.com" },
      license: { name: "Proprietary" },
    },
    servers: [
      { url: "/", description: "Current server" },
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "auth_token",
          description: "HttpOnly session cookie set after login/register",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token in Authorization header (for API clients)",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            requestId: { type: "string" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            email: { type: "string", format: "email" },
            name: { type: "string" },
            role: { type: "string", enum: ["CANDIDATE", "EMPLOYER", "ADMIN"] },
            emailVerified: { type: "boolean" },
            avatarUrl: { type: "string", nullable: true },
          },
        },
        Job: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            slug: { type: "string" },
            description: { type: "string" },
            location: { type: "string" },
            type: { type: "string" },
            seniority: { type: "string" },
            salaryMin: { type: "integer", nullable: true },
            salaryMax: { type: "integer", nullable: true },
            currency: { type: "string", nullable: true },
            tags: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "REJECTED"] },
            visaSponsorship: { type: "string", enum: ["YES", "NO", "UNKNOWN"] },
            relocationAssistance: { type: "boolean" },
            isExpired: { type: "boolean" },
            publishedAt: { type: "string", format: "date-time", nullable: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    tags: [
      { name: "Health", description: "Health and readiness probes" },
      { name: "Auth", description: "Authentication, registration, and OAuth" },
      { name: "Email Verification", description: "Email verification flow" },
      { name: "Jobs", description: "Job listings and search" },
      { name: "Resources", description: "Guides, articles, and resource hub" },
      { name: "Applications", description: "Job applications" },
      { name: "Quick Apply", description: "AI-powered one-click applications" },
      { name: "Profile", description: "Candidate profile management" },
      { name: "Companies", description: "Company profiles and reviews" },
      { name: "Messages", description: "In-app messaging" },
      { name: "Notifications", description: "User notifications" },
      { name: "Billing", description: "Subscriptions and payment" },
      { name: "Pricing", description: "Regional pricing" },
      { name: "Saved Searches", description: "Saved job searches and alerts" },
      { name: "AI Chat", description: "AI-powered job assistant" },
      { name: "Autopilot", description: "AI autonomous job matching" },
      { name: "Immigration", description: "Visa and immigration tracking" },
      { name: "Salary Reports", description: "Salary benchmarking data" },
      { name: "Interviews", description: "Interview experiences" },
      { name: "Skills", description: "Skills assessments" },
      { name: "Learning", description: "Learning resources" },
      { name: "Calendar", description: "Interview scheduling" },
      { name: "Referrals", description: "User referral program" },
      { name: "Aggregator", description: "Job board aggregation" },
      { name: "Talent", description: "Employer talent search" },
      { name: "Files", description: "File uploads" },
      { name: "Admin", description: "Admin operations (restricted)" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: { "200": { description: "Service healthy" } },
        },
      },
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "name", "role"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    name: { type: "string" },
                    role: { type: "string", enum: ["CANDIDATE", "EMPLOYER"] },
                    companyName: { type: "string" },
                    location: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "User created" },
            "400": { description: "Validation error or email taken" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Log in with email and password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Login successful" },
            "401": { description: "Invalid credentials" },
            "409": { description: "Provider mismatch (OAuth-only account)" },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current user",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            "200": { description: "Current user" },
            "401": { description: "Not authenticated" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout and revoke token",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "Logged out" } },
        },
      },
      "/api/auth/oauth/google/callback": {
        post: {
          tags: ["Auth"],
          summary: "Google OAuth callback",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: {
                    code: { type: "string" },
                    redirectUri: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Existing user signed in" },
            "201": { description: "New user created via OAuth" },
          },
        },
      },
      "/api/auth/oauth/github/callback": {
        post: {
          tags: ["Auth"],
          summary: "GitHub OAuth callback",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: {
                    code: { type: "string" },
                    redirectUri: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Existing user signed in" },
            "201": { description: "New user created via OAuth" },
          },
        },
      },
      "/api/auth/oauth/providers": {
        get: {
          tags: ["Auth"],
          summary: "List enabled OAuth providers",
          responses: { "200": { description: "Provider list" } },
        },
      },
      "/api/auth/email/send-verification": {
        post: {
          tags: ["Email Verification"],
          summary: "Send verification email",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            "200": { description: "Verification email sent" },
            "401": { description: "Not authenticated" },
          },
        },
      },
      "/api/auth/email/verify": {
        post: {
          tags: ["Email Verification"],
          summary: "Verify email with token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token"],
                  properties: { token: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "200": { description: "Email verified" },
            "400": { description: "Invalid or expired token" },
            "429": { description: "Too many verification attempts" },
          },
        },
      },
      "/api/auth/forgot-password": {
        post: {
          tags: ["Auth"],
          summary: "Request a password reset link",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string", format: "email" },
                  },
                },
                example: { email: "candidate@example.com" },
              },
            },
          },
          responses: {
            "200": { description: "Reset email issued (or no-op for unknown user)" },
            "400": { description: "Validation error" },
          },
        },
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Auth"],
          summary: "Reset password with token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "password"],
                  properties: {
                    token: { type: "string" },
                    password: { type: "string", minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Password reset successful" },
            "400": { description: "Invalid or expired token" },
          },
        },
      },
      "/api/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "List published jobs",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "location", in: "query", schema: { type: "string" } },
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          ],
          responses: { "200": { description: "Paginated job list" } },
        },
      },
      "/api/jobs/{slug}": {
        get: {
          tags: ["Jobs"],
          summary: "Get job by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Job detail" },
            "404": { description: "Not found" },
          },
        },
      },
      "/api/resources": {
        get: {
          tags: ["Resources"],
          summary: "List published resources",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          ],
          responses: {
            "200": { description: "Paginated resources list" },
          },
        },
      },
      "/api/resources/{slug}": {
        get: {
          tags: ["Resources"],
          summary: "Get resource detail by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Resource detail" },
            "404": { description: "Resource not found" },
          },
        },
      },
      "/api/resources/categories": {
        get: {
          tags: ["Resources"],
          summary: "List available resource categories",
          responses: { "200": { description: "Category list" } },
        },
      },
      "/api/companies": {
        get: {
          tags: ["Companies"],
          summary: "List companies",
          parameters: [
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", default: 1 } },
            { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          ],
          responses: {
            "200": { description: "Paginated company list" },
          },
        },
      },
      "/api/companies/{id}": {
        get: {
          tags: ["Companies"],
          summary: "Get company detail",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": { description: "Company detail" },
            "404": { description: "Company not found" },
          },
        },
      },
      "/api/applications": {
        post: {
          tags: ["Applications"],
          summary: "Apply to a job",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jobId"],
                  properties: { jobId: { type: "string" }, coverLetter: { type: "string" } },
                },
              },
            },
          },
          responses: {
            "201": { description: "Applied" },
            "403": { description: "Email verification required" },
            "404": { description: "Job not found or expired" },
          },
        },
      },
      "/api/applications/my": {
        get: {
          tags: ["Applications"],
          summary: "List current candidate applications",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: {
            "200": { description: "Applications list" },
            "403": { description: "Candidate role required" },
          },
        },
      },
      "/api/billing/checkout": {
        post: {
          tags: ["Billing"],
          summary: "Create Stripe checkout session",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "Checkout URL" } },
        },
      },
      "/api/pricing": {
        get: {
          tags: ["Pricing"],
          summary: "Get public pricing for a region",
          parameters: [
            { name: "region", in: "query", schema: { type: "string", enum: ["AFRICA", "EUROPE", "ROW"] } },
          ],
          responses: { "200": { description: "Pricing data" } },
        },
      },
      "/api/quick-apply": {
        post: {
          tags: ["Quick Apply"],
          summary: "Quick apply to a job using profile and active resume",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["jobId"],
                  properties: {
                    jobId: { type: "string", format: "uuid" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Application created via quick apply" },
            "400": { description: "Validation error or missing candidate profile" },
            "403": { description: "Email verification required" },
          },
        },
      },
      "/api/quick-apply/eligible/{jobId}": {
        get: {
          tags: ["Quick Apply"],
          summary: "Check quick-apply eligibility for a job",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: {
            "200": { description: "Eligibility result" },
            "404": { description: "Job not found" },
          },
        },
      },
      "/api/chat/message": {
        post: {
          tags: ["AI Chat"],
          summary: "Send message to AI assistant",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "AI response" } },
        },
      },
      "/api/saved-searches": {
        get: {
          tags: ["Saved Searches"],
          summary: "List saved searches",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "Saved search list" } },
        },
      },
      "/api/notifications": {
        get: {
          tags: ["Notifications"],
          summary: "List user notifications",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "Notification list" } },
        },
      },
      "/api/messages/threads": {
        get: {
          tags: ["Messages"],
          summary: "List message threads",
          security: [{ cookieAuth: [] }, { bearerAuth: [] }],
          responses: { "200": { description: "Thread list" } },
        },
      },
    },
  },
  apis: [], // We define paths inline above rather than via JSDoc comments
};

export const swaggerSpec = swaggerJsdoc(options);
