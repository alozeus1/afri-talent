import type { LearningResourceItem } from "./api";

export type LearningLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type InterviewDifficulty = "easy" | "medium" | "hard";

export interface EarlyLearningLesson extends LearningResourceItem {
  outcomes: string[];
  steps: string[];
  checklist: string[];
  practiceTask?: string;
}

export interface InterviewPracticeQuestion {
  question: string;
  category:
    | "behavioral"
    | "technical"
    | "scenario"
    | "system design"
    | "troubleshooting"
    | "star practice";
  difficulty: InterviewDifficulty;
  expectedPoints: string[];
}

export interface InterviewRoleTrack {
  role: string;
  focus: string;
  questions: InterviewPracticeQuestion[];
}

export interface InterviewInsight {
  id: string;
  title: string;
  role?: string;
  summary: string;
  bullets: string[];
}

const baseLesson = (
  id: string,
  title: string,
  category: string,
  difficulty: LearningLevel,
  durationHours: number,
  description: string,
  skills: string[],
  steps: string[],
  outcomes: string[],
  checklist: string[],
  practiceTask?: string,
): EarlyLearningLesson => ({
  id,
  title,
  description,
  url: `#${id}`,
  provider: "AfriTalent Starter Lab",
  category,
  skills,
  difficulty,
  durationHours,
  isFree: true,
  imageUrl: null,
  featured: difficulty === "BEGINNER",
  outcomes,
  steps,
  checklist,
  practiceTask,
});

export const EARLY_LEARNING_CATEGORIES = [
  "AWS Cloud Demos",
  "Cybersecurity Demos",
  "DevOps Demos",
  "AI Tools for Career Growth",
  "Job Search Skills",
];

export const EARLY_LEARNING_LESSONS: EarlyLearningLesson[] = [
  baseLesson("aws-s3-static-site", "Create an S3 Static Website Hosting Demo", "AWS Cloud Demos", "BEGINNER", 1, "Publish a simple portfolio page using S3 static website hosting concepts.", ["AWS", "S3", "Static sites"], ["Create a public bucket in a sandbox account.", "Upload an index.html file.", "Enable static website hosting.", "Review the public URL and cleanup plan."], ["Explain when S3 hosting is useful.", "Identify public access risks.", "Document cleanup steps."], ["Use a sandbox account.", "Do not upload secrets.", "Capture the website endpoint."], "Write a short README explaining the architecture and cleanup steps."),
  baseLesson("aws-iam-basics", "IAM User and Role Basics", "AWS Cloud Demos", "BEGINNER", 1, "Learn the difference between users, groups, roles, and least privilege policies.", ["AWS", "IAM", "Security"], ["Compare users, groups, and roles.", "Read a simple policy document.", "Map least privilege to a job scenario.", "List what should use MFA."], ["Describe least privilege.", "Avoid root account usage.", "Recognize risky permissions."], ["Enable MFA where possible.", "Avoid AdministratorAccess for demos.", "Use temporary credentials."], "Review a sample policy and identify which action is too broad."),
  baseLesson("aws-vpc-basics", "VPC Basics for Global Cloud Roles", "AWS Cloud Demos", "BEGINNER", 1.5, "Understand subnets, route tables, internet gateways, and security groups.", ["AWS", "VPC", "Networking"], ["Sketch a VPC with public and private subnets.", "Explain route tables.", "Compare security groups and NACLs.", "Identify what should not be public."], ["Explain a simple cloud network.", "Spot overexposed resources.", "Prepare for junior cloud interviews."], ["Label public and private subnets.", "Check inbound rules.", "Document assumptions."], "Draw a two-tier VPC architecture for a small web app."),
  baseLesson("aws-cloudwatch-basics", "CloudWatch Monitoring Basics", "AWS Cloud Demos", "BEGINNER", 1, "Learn logs, metrics, alarms, and dashboards used in cloud operations.", ["AWS", "CloudWatch", "Monitoring"], ["Identify metrics and logs.", "Create an example alarm plan.", "Define useful dashboard panels.", "Write an incident note."], ["Explain observability basics.", "Connect alerts to business impact.", "Prepare monitoring interview examples."], ["Pick a metric.", "Set a threshold.", "Write an alert response."], "Create a monitoring checklist for an API deployment."),
  baseLesson("aws-lambda-demo", "AWS Lambda Beginner Demo", "AWS Cloud Demos", "BEGINNER", 1, "Understand serverless functions, triggers, logs, and timeout limits.", ["AWS", "Lambda", "Serverless"], ["Describe event-driven execution.", "Create a simple handler concept.", "Review logs and timeout settings.", "Identify when Lambda is not ideal."], ["Explain Lambda basics.", "Read serverless logs.", "Discuss cost and limits."], ["Know trigger source.", "Set timeout intentionally.", "Log safely."], "Write pseudo-code for a Lambda that validates a job alert request."),
  baseLesson("aws-ecs-fargate-overview", "ECS/Fargate Beginner Deployment Overview", "AWS Cloud Demos", "INTERMEDIATE", 2, "Learn container deployment concepts without managing servers.", ["AWS", "ECS", "Fargate", "Docker"], ["Explain task definitions.", "Compare services and tasks.", "Map image build to deployment.", "Review logs and rollback basics."], ["Understand managed containers.", "Discuss deployment tradeoffs.", "Prepare DevOps talking points."], ["Define container image.", "Set health checks.", "Document rollback path."], "Sketch a Fargate deployment pipeline for a Next.js app."),
  baseLesson("phishing-awareness", "Phishing Awareness Basics", "Cybersecurity Demos", "BEGINNER", 0.75, "Learn how attackers use urgency, impersonation, and fake links.", ["Security awareness", "Phishing"], ["Inspect sender identity.", "Check link destinations.", "Identify urgency tactics.", "Report suspicious messages."], ["Spot common phishing patterns.", "Protect accounts during job search.", "Use safer communication habits."], ["Verify domains.", "Do not share OTP codes.", "Report suspicious requests."], "Review three sample recruiter messages and flag the risky one."),
  baseLesson("fake-job-offers", "How to Identify Fake Job Offers", "Cybersecurity Demos", "BEGINNER", 1, "Protect yourself from payment scams, identity theft, and fake recruiters.", ["Job safety", "Scam detection"], ["Check company domain.", "Validate application path.", "Watch for payment requests.", "Verify recruiter identity."], ["Identify scam signals.", "Avoid risky document sharing.", "Use AfriTalent trust checks."], ["No payment to apply.", "No WhatsApp-only process.", "Verify company website."], "Create a personal job verification checklist."),
  baseLesson("password-mfa-basics", "Password Manager and MFA Basics", "Cybersecurity Demos", "BEGINNER", 0.75, "Secure job-search accounts and email with strong passwords and MFA.", ["MFA", "Account security"], ["Choose a password manager.", "Enable MFA.", "Protect recovery codes.", "Recognize MFA fatigue."], ["Improve account security.", "Reduce account takeover risk.", "Explain MFA in interviews."], ["Use unique passwords.", "Enable MFA on email.", "Store recovery codes safely."], "Audit three accounts and list which still need MFA."),
  baseLesson("soc-workflow-intro", "Intro to SOC Analyst Workflow", "Cybersecurity Demos", "BEGINNER", 1.5, "Learn alert triage, enrichment, severity, and escalation basics.", ["SOC", "SIEM", "Incident response"], ["Read an alert.", "Identify indicators.", "Assign severity.", "Write an escalation note."], ["Understand SOC workflow.", "Practice structured triage.", "Prepare entry-level SOC answers."], ["Capture evidence.", "Avoid assumptions.", "Document next steps."], "Write a triage note for a suspicious login alert."),
  baseLesson("security-log-reading", "Reading Security Logs Basics", "Cybersecurity Demos", "BEGINNER", 1, "Practice extracting useful signals from authentication and network logs.", ["Logs", "Security analysis"], ["Identify timestamp, source, and action.", "Look for failed logins.", "Group related events.", "Summarize findings."], ["Read simple logs.", "Find anomalous patterns.", "Explain evidence clearly."], ["Track source IP.", "Compare normal vs abnormal.", "Document uncertainty."], "Analyze a short auth log and identify the suspicious event."),
  baseLesson("cloud-security-best-practices", "Cloud Security Best Practices for Beginners", "Cybersecurity Demos", "INTERMEDIATE", 1.5, "Apply basic cloud security principles to storage, IAM, networking, and logging.", ["Cloud security", "AWS", "Risk"], ["Review least privilege.", "Check public exposure.", "Enable logging.", "Plan incident response."], ["Explain cloud security basics.", "Reduce common misconfigurations.", "Prepare security interview examples."], ["Use MFA.", "Restrict public access.", "Monitor sensitive actions."], "Create a cloud security checklist for a small startup."),
  baseLesson("what-is-cicd", "What is CI/CD?", "DevOps Demos", "BEGINNER", 1, "Understand how commits become tested and deployed software.", ["CI/CD", "DevOps"], ["Define CI and CD.", "Map a pipeline.", "Identify quality gates.", "Discuss rollback."], ["Explain CI/CD confidently.", "Identify pipeline stages.", "Connect automation to reliability."], ["Build.", "Test.", "Scan.", "Deploy.", "Rollback."], "Write a simple pipeline outline for a frontend app."),
  baseLesson("git-github-basics", "Git and GitHub Basics", "DevOps Demos", "BEGINNER", 1, "Learn branches, commits, pull requests, and basic collaboration.", ["Git", "GitHub"], ["Create a branch concept.", "Explain commits.", "Review a pull request.", "Resolve simple merge thinking."], ["Use Git vocabulary.", "Understand PR workflows.", "Prepare for team projects."], ["Meaningful commit message.", "Small PRs.", "Review before merge."], "Write a PR description for a bug fix."),
  baseLesson("docker-basics", "Docker Basics", "DevOps Demos", "BEGINNER", 1.5, "Understand images, containers, Dockerfiles, ports, and environment variables.", ["Docker", "Containers"], ["Explain image vs container.", "Read a Dockerfile.", "Map ports.", "Discuss env vars safely."], ["Explain container basics.", "Avoid secret leakage.", "Debug simple container issues."], ["Do not bake secrets.", "Expose correct port.", "Use health checks."], "Review a Dockerfile and identify one improvement."),
  baseLesson("terraform-basics", "Terraform Basics", "DevOps Demos", "INTERMEDIATE", 2, "Learn infrastructure as code vocabulary and safe plan/apply workflow.", ["Terraform", "IaC"], ["Explain providers and resources.", "Read a plan.", "Discuss state risk.", "Apply change-control thinking."], ["Understand IaC basics.", "Recognize state sensitivity.", "Prepare cloud automation examples."], ["Protect state.", "Review plan.", "Use modules carefully."], "Write a Terraform change review checklist."),
  baseLesson("monitoring-alerting", "Monitoring and Alerting Basics", "DevOps Demos", "BEGINNER", 1, "Design alerts that detect user-impacting failures without noisy paging.", ["Monitoring", "SRE"], ["Pick service-level signals.", "Define severity.", "Write alert runbooks.", "Review false positives."], ["Create useful alerts.", "Explain SLO thinking.", "Improve incident response."], ["Alert on symptoms.", "Include runbook.", "Measure noise."], "Draft an alert for a failed deployment."),
  baseLesson("deployment-rollback", "Deployment Rollback Basics", "DevOps Demos", "INTERMEDIATE", 1.5, "Learn safe rollback patterns for web applications.", ["Deployment", "Rollback"], ["Identify release risks.", "Compare roll forward and rollback.", "Define verification steps.", "Write a rollback note."], ["Reduce release risk.", "Explain safe deployment practice.", "Prepare DevOps scenarios."], ["Know previous version.", "Verify health checks.", "Communicate impact."], "Create a rollback plan for a broken login release."),
  baseLesson("claude-code-safely", "How to Use Claude Code Safely", "AI Tools for Career Growth", "BEGINNER", 1, "Use coding agents as assistants while protecting secrets and reviewing output.", ["AI tools", "Code review"], ["Set clear task scope.", "Avoid sharing secrets.", "Review diffs.", "Run tests."], ["Use AI coding tools responsibly.", "Spot risky generated code.", "Keep ownership of changes."], ["No secrets.", "Review every diff.", "Run tests.", "Document assumptions."], "Write a prompt for a safe bug investigation."),
  baseLesson("codex-learning-support", "How to Use Codex for Learning and Coding Support", "AI Tools for Career Growth", "BEGINNER", 1, "Use Codex to explain code, generate practice tasks, and debug small issues.", ["AI tools", "Learning"], ["Ask focused questions.", "Request citations from code.", "Use tests to verify.", "Summarize lessons learned."], ["Learn faster with AI.", "Avoid blind copying.", "Build debugging confidence."], ["Ask for file references.", "Verify locally.", "Save notes."], "Ask an AI assistant to explain a function and then write your own summary."),
  baseLesson("openrouter-experimentation", "How to Use OpenRouter for Model Experimentation", "AI Tools for Career Growth", "INTERMEDIATE", 1, "Compare model outputs safely for writing, coding, and research tasks.", ["AI models", "Prompting"], ["Define evaluation criteria.", "Compare outputs.", "Check privacy risks.", "Record model strengths."], ["Evaluate AI outputs.", "Choose fit-for-purpose models.", "Avoid sensitive data leakage."], ["Use non-sensitive examples.", "Score outputs.", "Track cost."], "Compare two model responses to the same resume bullet prompt."),
  baseLesson("company-research-ai", "How to Research Companies Before Applying", "AI Tools for Career Growth", "BEGINNER", 1, "Use AI to structure company research without trusting unsupported claims.", ["Research", "Job search"], ["Collect official sources.", "Summarize product and market.", "Check hiring signals.", "Prepare interview questions."], ["Research employers efficiently.", "Ask better questions.", "Avoid fake company traps."], ["Use official website.", "Check careers page.", "Verify domain."], "Create a one-page company brief before applying."),
  baseLesson("ai-resume-without-lying", "How to Use AI to Improve a Resume Without Lying", "AI Tools for Career Growth", "BEGINNER", 1, "Improve clarity and impact while keeping every claim true.", ["Resume", "AI writing"], ["Rewrite weak bullets.", "Quantify honestly.", "Remove inflated claims.", "Match job keywords responsibly."], ["Improve resume quality.", "Avoid fabricated achievements.", "Use AI ethically."], ["Keep facts true.", "Review every claim.", "Save original version."], "Rewrite three resume bullets with measurable but truthful impact."),
  baseLesson("ai-interview-prep", "How to Use AI to Prepare for Interviews", "AI Tools for Career Growth", "BEGINNER", 1, "Practice role-specific answers and improve structure without memorizing scripts.", ["Interview prep", "AI"], ["Generate practice questions.", "Answer using STAR.", "Request feedback.", "Refine examples."], ["Practice consistently.", "Improve answer structure.", "Avoid robotic responses."], ["Use real experience.", "Practice aloud.", "Keep answers concise."], "Record a two-minute answer and improve it with feedback."),
  baseLesson("spot-scam-jobs", "How to Spot Scam Jobs", "Job Search Skills", "BEGINNER", 0.75, "Recognize high-risk job posts before sharing personal data.", ["Scam detection", "Job search"], ["Check apply URL.", "Look for payment requests.", "Verify salary realism.", "Validate recruiter identity."], ["Avoid scam applications.", "Protect identity documents.", "Use trust signals."], ["No upfront payment.", "Verify official domain.", "Watch for pressure tactics."], "Score a job post using five scam signals."),
  baseLesson("tailor-resume-jd", "How to Tailor a Resume to a Job Description", "Job Search Skills", "BEGINNER", 1, "Align your strongest truthful experience with the role requirements.", ["Resume", "ATS"], ["Extract key requirements.", "Match relevant projects.", "Rewrite summary.", "Keep claims accurate."], ["Tailor applications faster.", "Improve relevance.", "Avoid keyword stuffing."], ["Use job keywords naturally.", "Keep formatting simple.", "Proofread."], "Tailor one resume summary for a cloud engineer job."),
  baseLesson("strong-cover-letter", "How to Write a Strong Cover Letter", "Job Search Skills", "BEGINNER", 1, "Write concise letters that connect your experience to the employer's needs.", ["Cover letters", "Writing"], ["Open with role fit.", "Show evidence.", "Explain motivation.", "Close clearly."], ["Write stronger letters.", "Avoid generic text.", "Customize without exaggeration."], ["Mention company.", "Use real examples.", "Keep it short."], "Draft a 180-word cover letter for one saved job."),
  baseLesson("track-applications", "How to Track Job Applications", "Job Search Skills", "BEGINNER", 0.75, "Use statuses, notes, and reminders to stay organized.", ["Applications", "Productivity"], ["Create statuses.", "Add follow-up dates.", "Record contacts.", "Review weekly."], ["Avoid lost opportunities.", "Follow up professionally.", "Measure application quality."], ["Saved.", "Preparing.", "Applied.", "Interviewing.", "Follow-up needed."], "Create a tracker row for three job applications."),
  baseLesson("prepare-remote-work", "How to Prepare for Remote Work", "Job Search Skills", "BEGINNER", 1, "Build communication, documentation, and reliability habits for global teams.", ["Remote work", "Communication"], ["Plan async updates.", "Set work boundaries.", "Document decisions.", "Prepare internet backups."], ["Work better remotely.", "Demonstrate reliability.", "Answer remote interview questions."], ["Stable workspace.", "Clear updates.", "Timezone awareness."], "Write a sample async project update."),
  baseLesson("negotiate-salary", "How to Negotiate Salary", "Job Search Skills", "INTERMEDIATE", 1, "Prepare salary expectations with research, range, and respectful framing.", ["Salary", "Negotiation"], ["Research market data.", "Define a range.", "Consider benefits.", "Practice response scripts."], ["Discuss salary confidently.", "Avoid underpricing.", "Handle recruiter questions."], ["Know minimum.", "Use ranges.", "Stay professional."], "Write a salary expectation response for a remote role."),
];

export const INTERVIEW_ROLE_TRACKS: InterviewRoleTrack[] = [
  {
    role: "Cloud Engineer",
    focus: "AWS fundamentals, troubleshooting, networking, monitoring",
    questions: [
      { question: "Walk me through how you would troubleshoot an EC2 instance that is unreachable over SSH.", category: "troubleshooting", difficulty: "medium", expectedPoints: ["Security group and NACL checks", "Route table and public IP", "Key pair and OS-level logs"] },
      { question: "Explain the difference between public and private subnets in a VPC.", category: "technical", difficulty: "easy", expectedPoints: ["Route to internet gateway", "NAT gateway use", "Workload placement"] },
      { question: "Tell me about a time you improved reliability or monitoring for a system.", category: "star practice", difficulty: "medium", expectedPoints: ["Situation and metric", "Specific action", "Measured result"] },
    ],
  },
  {
    role: "DevOps Engineer",
    focus: "CI/CD, containers, infrastructure as code, rollback",
    questions: [
      { question: "Design a CI/CD pipeline for a web application from commit to production.", category: "system design", difficulty: "medium", expectedPoints: ["Build/test/security gates", "Deployment strategy", "Rollback and observability"] },
      { question: "A deployment passes tests but production health checks fail. What do you do first?", category: "scenario", difficulty: "medium", expectedPoints: ["Stop rollout", "Check logs/metrics", "Rollback or fix-forward decision"] },
      { question: "How do you manage secrets in CI/CD without exposing them in logs or images?", category: "technical", difficulty: "medium", expectedPoints: ["Secret store", "Least privilege", "Masking and rotation"] },
    ],
  },
  {
    role: "DevSecOps Engineer",
    focus: "secure pipelines, dependency scanning, threat-informed automation",
    questions: [
      { question: "Where would you add security controls in a deployment pipeline?", category: "technical", difficulty: "medium", expectedPoints: ["SAST/dependency/container scans", "Policy gates", "Exception process"] },
      { question: "A critical CVE is found in a base image after release. How do you respond?", category: "scenario", difficulty: "hard", expectedPoints: ["Impact assessment", "Patch/rebuild/redeploy", "Communication and verification"] },
      { question: "Describe a time you balanced delivery speed with a security requirement.", category: "behavioral", difficulty: "medium", expectedPoints: ["Risk framing", "Stakeholder alignment", "Outcome"] },
    ],
  },
  {
    role: "AWS Solutions Architect",
    focus: "architecture tradeoffs, availability, cost, security",
    questions: [
      { question: "Design a highly available web application on AWS for a startup with unpredictable traffic.", category: "system design", difficulty: "hard", expectedPoints: ["Load balancing and autoscaling", "Managed database", "Caching and cost controls"] },
      { question: "How would you reduce AWS cost without hurting reliability?", category: "scenario", difficulty: "medium", expectedPoints: ["Right sizing", "Savings plans/spot where safe", "Monitoring unused resources"] },
      { question: "Explain how IAM roles improve application security compared with long-lived keys.", category: "technical", difficulty: "medium", expectedPoints: ["Temporary credentials", "Least privilege", "Rotation reduction"] },
    ],
  },
  {
    role: "SOC Analyst",
    focus: "alert triage, evidence, escalation, log review",
    questions: [
      { question: "You receive an impossible travel alert for a privileged account. How do you triage it?", category: "scenario", difficulty: "medium", expectedPoints: ["Validate activity", "Check MFA/session details", "Escalate and contain if suspicious"] },
      { question: "What information should be included in a SOC escalation note?", category: "technical", difficulty: "easy", expectedPoints: ["Timeline", "Indicators", "User/system impact", "Recommended action"] },
      { question: "Tell me about a time you investigated a problem with incomplete information.", category: "behavioral", difficulty: "medium", expectedPoints: ["Evidence discipline", "Communication", "Decision under uncertainty"] },
    ],
  },
  {
    role: "Cybersecurity Analyst",
    focus: "risk, vulnerability management, incident response, user safety",
    questions: [
      { question: "How would you prioritize vulnerabilities when there are more findings than the team can fix immediately?", category: "scenario", difficulty: "medium", expectedPoints: ["Exploitability", "Asset criticality", "Compensating controls"] },
      { question: "Explain phishing indicators you would teach non-technical users to check.", category: "technical", difficulty: "easy", expectedPoints: ["Sender/domain", "Urgency/payment", "Suspicious links/attachments"] },
      { question: "Describe a security recommendation you had to explain to a non-security stakeholder.", category: "behavioral", difficulty: "medium", expectedPoints: ["Plain language", "Business impact", "Practical next step"] },
    ],
  },
  {
    role: "Frontend Developer",
    focus: "UI quality, accessibility, state, performance",
    questions: [
      { question: "How would you make a complex form accessible and usable on mobile?", category: "technical", difficulty: "medium", expectedPoints: ["Labels and errors", "Keyboard flow", "Responsive layout"] },
      { question: "A React page feels slow when filtering a large list. How would you diagnose and improve it?", category: "scenario", difficulty: "medium", expectedPoints: ["Measure first", "Reduce rendering work", "Pagination/virtualization/deferred updates"] },
      { question: "Tell me about a UI bug you fixed that improved user experience.", category: "star practice", difficulty: "easy", expectedPoints: ["User impact", "Root cause", "Validation"] },
    ],
  },
  {
    role: "Backend Developer",
    focus: "APIs, data modeling, reliability, security",
    questions: [
      { question: "Design an API for saving and tracking job applications.", category: "system design", difficulty: "medium", expectedPoints: ["Resources/status transitions", "Authz", "Validation and audit trail"] },
      { question: "How do you prevent duplicate records when ingesting jobs from multiple providers?", category: "technical", difficulty: "medium", expectedPoints: ["Stable keys", "Normalization", "Safe merge strategy"] },
      { question: "A production endpoint is timing out. What is your debugging sequence?", category: "troubleshooting", difficulty: "medium", expectedPoints: ["Logs/metrics/traces", "Dependency checks", "Mitigation and root cause"] },
    ],
  },
  {
    role: "Product Manager",
    focus: "user problems, prioritization, tradeoffs, metrics",
    questions: [
      { question: "How would you prioritize improvements for a pre-launch job platform?", category: "scenario", difficulty: "medium", expectedPoints: ["User value", "Risk", "Learning velocity"] },
      { question: "Tell me about a time you changed direction after user feedback.", category: "behavioral", difficulty: "medium", expectedPoints: ["Evidence", "Decision", "Outcome"] },
      { question: "What metrics would you track for an application assistant feature?", category: "technical", difficulty: "medium", expectedPoints: ["Activation", "Completion", "Quality feedback", "Safety signals"] },
    ],
  },
  {
    role: "Data Analyst",
    focus: "SQL, metrics, dashboards, decision support",
    questions: [
      { question: "How would you measure whether job recommendations are useful?", category: "technical", difficulty: "medium", expectedPoints: ["CTR/save/apply rate", "Feedback quality", "Segment analysis"] },
      { question: "A dashboard metric suddenly drops by 40 percent. How do you investigate?", category: "scenario", difficulty: "medium", expectedPoints: ["Data freshness", "Definition changes", "Segment and pipeline checks"] },
      { question: "Describe a time your analysis changed a team's decision.", category: "behavioral", difficulty: "medium", expectedPoints: ["Question", "Method", "Business impact"] },
    ],
  },
  {
    role: "AI Engineer",
    focus: "LLM workflows, evaluation, guardrails, retrieval",
    questions: [
      { question: "How would you evaluate an AI cover letter generator for truthfulness and usefulness?", category: "technical", difficulty: "hard", expectedPoints: ["Grounding", "Human review", "Quality and safety metrics"] },
      { question: "Design a resume-to-job matching assistant with safeguards against hallucination.", category: "system design", difficulty: "hard", expectedPoints: ["Structured inputs", "Explainable scoring", "Fallback and audit logs"] },
      { question: "Tell me about a time you improved an AI workflow after observing poor output.", category: "behavioral", difficulty: "medium", expectedPoints: ["Failure mode", "Evaluation", "Iteration"] },
    ],
  },
  {
    role: "Technical Support Engineer",
    focus: "customer debugging, communication, escalation",
    questions: [
      { question: "A user says login is broken but you cannot reproduce it. What do you ask and check?", category: "troubleshooting", difficulty: "easy", expectedPoints: ["Environment details", "Steps/screenshots", "Logs and account status"] },
      { question: "How do you explain a technical outage to a frustrated non-technical user?", category: "behavioral", difficulty: "medium", expectedPoints: ["Empathy", "Clear status", "Next update timing"] },
      { question: "When should a support issue be escalated to engineering?", category: "scenario", difficulty: "medium", expectedPoints: ["Severity", "Reproducibility", "Customer impact and workaround"] },
    ],
  },
];

export const INTERVIEW_INSIGHTS: InterviewInsight[] = [
  { id: "aws-cloud-engineer-questions", title: "Common AWS Cloud Engineer interview questions", role: "Cloud Engineer", summary: "Expect VPC, IAM, monitoring, incident response, and cost tradeoff questions.", bullets: ["Practice explaining VPC flow in plain language.", "Prepare one reliability improvement story.", "Know how to troubleshoot access issues."] },
  { id: "devops-questions", title: "Common DevOps Engineer interview questions", role: "DevOps Engineer", summary: "Most rounds test pipeline design, deployment safety, secrets, and rollback thinking.", bullets: ["Draw a pipeline before describing tools.", "Mention quality gates and rollback.", "Use one real outage or deployment story."] },
  { id: "cyber-analyst-questions", title: "Common Cybersecurity Analyst interview questions", role: "Cybersecurity Analyst", summary: "Analyst interviews reward evidence-based thinking over dramatic answers.", bullets: ["Explain triage steps.", "Use risk and impact language.", "Document uncertainty instead of guessing."] },
  { id: "tell-me-about-yourself", title: "How to answer: Tell me about yourself", summary: "Use a concise present-past-future structure tied to the role.", bullets: ["Start with current focus.", "Mention two relevant strengths.", "Close with why this role fits."] },
  { id: "explain-project", title: "How to explain a project you built", summary: "Interviewers want problem, constraints, technical choices, tradeoffs, and results.", bullets: ["Name the user problem.", "Explain your exact contribution.", "Share what you would improve."] },
  { id: "salary-expectations", title: "How to answer salary expectation questions", summary: "Prepare a researched range and avoid locking yourself into the lowest number too early.", bullets: ["Use a range.", "Consider benefits and timezone demands.", "Ask about total compensation."] },
  { id: "remote-global-interviews", title: "How to prepare for remote global interviews", summary: "Remote interviews test communication, reliability, and ownership as much as technical skill.", bullets: ["Test audio and internet.", "Prepare async collaboration examples.", "Clarify timezone expectations."] },
  { id: "star-answering", title: "STAR-format practice prompts", summary: "STAR keeps behavioral answers specific and prevents vague storytelling.", bullets: ["Situation: keep context short.", "Task and action: emphasize your role.", "Result: quantify honestly."] },
  { id: "system-design-senior", title: "System design questions for senior roles", summary: "Senior interviews look for tradeoffs, constraints, and operational maturity.", bullets: ["Ask clarifying questions.", "Start simple, then scale.", "Discuss observability and failure modes."] },
  { id: "cloud-security-troubleshooting", title: "Cloud/security troubleshooting questions", summary: "Troubleshooting answers should move from scope to evidence to mitigation.", bullets: ["Define blast radius.", "Check recent changes.", "Mitigate before deep root cause."] },
];

export const SCAM_PROTECTION_TIPS = [
  "Never pay money to apply, interview, receive equipment, or unlock a job offer.",
  "Treat WhatsApp-only or Telegram-only recruiters as high risk until independently verified.",
  "Verify the application URL uses the employer's official domain or a known ATS provider.",
  "Be cautious when salaries are far above market but requirements are vague.",
  "Do not share passport, national ID, or bank details before verifying the employer and stage.",
  "Check whether the recruiter email domain matches the company domain.",
  "Search the company careers page to confirm the role exists.",
  "Watch for pressure tactics like same-day payment or immediate document submission.",
  "Keep copies of communication and report suspicious jobs.",
  "Use AfriTalent trust labels as a starting point, not a substitute for personal verification.",
];

export const RESUME_IMPROVEMENT_TIPS = [
  "Lead each role with impact, not only responsibilities.",
  "Use truthful metrics when available, such as uptime, cost reduction, tickets resolved, or users supported.",
  "Keep formatting ATS-friendly with clear headings and simple bullets.",
  "Avoid claiming tools or certifications you cannot discuss in an interview.",
  "Tailor your summary to the target role instead of using one generic statement.",
  "Group technical skills by category so recruiters can scan quickly.",
  "Show remote collaboration experience if applying globally.",
  "Use action verbs but keep the claim specific and verifiable.",
  "Remove outdated or unrelated details that distract from the target role.",
  "Proofread for spelling, dates, and inconsistent job titles.",
];

export const COVER_LETTER_TEMPLATES = [
  "Professional: I am applying for [Role] because my experience in [Skill] and [Project] aligns with your need for [Requirement].",
  "Warm and human: I was drawn to [Company] because [Reason]. My background in [Skill] has prepared me to contribute to [Team goal].",
  "Confident: I can help your team [Outcome] by bringing hands-on experience with [Skill], [Tool], and [Process].",
  "Short and direct: I am interested in [Role]. I have built [Relevant work] and can contribute immediately to [Need].",
  "Entry-level: While early in my career, I have practiced [Skill] through [Project] and am ready to learn quickly in [Role].",
  "Senior-level: I bring experience leading [Scope], improving [Metric], and mentoring teams through [Challenge].",
  "Remote-first: I have worked across [Timezone/team type] using clear documentation, async updates, and reliable delivery habits.",
  "Career switcher: My background in [Previous field] gives me strength in [Transferable skill], now applied to [Target role].",
  "Cloud role: My work with [AWS/service/tool] and [Reliability/security outcome] matches the responsibilities in this role.",
  "Security role: I approach security work with evidence, user safety, and practical risk reduction, which fits [Company need].",
];

export const JOB_SEARCH_STRATEGY_TIPS = [
  "Prioritize jobs with verified application paths and clear responsibilities.",
  "Apply fewer times with stronger tailoring instead of mass-applying generic materials.",
  "Save jobs first, then compare match quality before spending time tailoring.",
  "Track every application with status, date, link, and next follow-up action.",
  "Prepare one resume version per target role family.",
  "Use interview prep before applying to roles where you are a strong match.",
  "Check visa, relocation, and country restrictions before writing a cover letter.",
  "Research the company product and market before interview scheduling.",
  "Follow up politely after 7 to 10 business days if the employer invited follow-up.",
  "Review rejection patterns monthly and improve skills or targeting accordingly.",
];

export function getInterviewRoleNames(): string[] {
  return INTERVIEW_ROLE_TRACKS.map((track) => track.role);
}

export function getInterviewQuestionsForRole(role: string, difficulty: InterviewDifficulty): InterviewPracticeQuestion[] {
  const normalizedRole = role.toLowerCase().trim();
  const exact = INTERVIEW_ROLE_TRACKS.find((track) => track.role.toLowerCase() === normalizedRole);
  const fuzzy = exact ?? INTERVIEW_ROLE_TRACKS.find((track) => normalizedRole.includes(track.role.toLowerCase().split(" ")[0]));
  const selected = fuzzy ?? INTERVIEW_ROLE_TRACKS[0];
  const preferred = selected.questions.filter((question) => question.difficulty === difficulty);
  const mixed = [...preferred, ...selected.questions.filter((question) => question.difficulty !== difficulty)];
  return mixed.slice(0, 6).map((question) => ({ ...question, difficulty }));
}

export function evaluateInterviewAnswerLocally(question: InterviewPracticeQuestion, answer: string) {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const lower = answer.toLowerCase();
  const coveredPoints = question.expectedPoints.filter((point) =>
    point
      .toLowerCase()
      .split(/\W+/)
      .filter((part) => part.length > 4)
      .some((part) => lower.includes(part)),
  );
  const hasStarSignal = ["situation", "task", "action", "result", "impact", "learned"].some((term) => lower.includes(term));
  const lengthScore = words.length >= 90 ? 30 : words.length >= 45 ? 22 : words.length >= 20 ? 14 : 6;
  const coverageScore = Math.min(40, coveredPoints.length * 14);
  const structureScore = hasStarSignal ? 20 : 8;
  const clarityScore = answer.includes(".") || answer.includes(",") ? 10 : 5;
  const score = Math.max(25, Math.min(92, lengthScore + coverageScore + structureScore + clarityScore));

  return {
    score,
    feedback:
      "This fallback review uses answer length, structure, and coverage of the prompt's expected points. Treat it as practice guidance, not a hiring decision.",
    suggestedAnswer:
      "A strong answer should briefly set context, explain your specific actions, connect decisions to the role, and close with a measurable or clearly described result.",
    strengths: [
      words.length >= 45 ? "You provided enough detail for review." : "You started with a concise answer that can now be expanded.",
      coveredPoints.length > 0 ? "Your answer touched at least one expected topic." : "You addressed the prompt and can improve by covering more expected points.",
    ],
    improvements: [
      hasStarSignal ? "Keep using a clear STAR-style structure." : "Add a STAR structure: situation, task, action, and result.",
      "Include a concrete metric, tradeoff, or lesson learned where truthful.",
      `Make sure you cover: ${question.expectedPoints.join(", ")}.`,
    ],
    source: "heuristic" as const,
  };
}

