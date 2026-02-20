# AfriTalent Differentiators v1

> *"The global talent platform built for Africans, not built for everyone and adapted for Africans."*

---

## 1. Visa-Friendly Job Labeling — Transparent, Not Overpromising

**The problem with every other job board:** "International" jobs are mixed with domestic ones. "Global remote" listings quietly exclude African applicants. Visa sponsorship is buried or missing entirely.

**What AfriTalent does differently:**
- Every job is explicitly labeled: `Visa Sponsorship: YES / NO / UNKNOWN` — never hidden
- `Relocation Assistance` is a first-class filter, not a footnote
- `Eligible Countries` is surfaced on every listing so a Nigerian candidate knows before applying whether they qualify
- Employer listings are labeled `Verified Employer Post` vs `Aggregated Listing` — candidates know the source
- A **Sponsorship Trust Score** on employer profiles based on verified history, not self-reported claims

**Why this matters for the product:** Reducing false applications = reducing frustration = higher retention. Candidates who get rejected because of unstated visa restrictions churn and never return. AfriTalent shows them only what's real.

---

## 2. Candidate Trust + Privacy — Platform Inbox, No Data Leakage

**The problem:** Most job boards either expose candidate contact details to unverified employers, or don't facilitate direct contact at all.

**What AfriTalent does differently:**
- **Platform inbox only** — employers cannot see a candidate's email, phone, or LinkedIn unless the candidate explicitly shares them after accepting a message request
- No personal contact info in the public profile by default
- Resumes stored encrypted (KMS) in private S3 — never accessible via public URL
- Presigned URLs with 5-minute expiry for all resume access
- Employer verification required before direct candidate outreach (domain verification + attestation)
- Candidates can block any employer in one click
- All employer-candidate communication logged for moderation and dispute resolution

**Why this matters for the product:** African professionals have been burned by job scams, data harvesting, and ghost recruiters. Trust is AfriTalent's primary acquisition lever.

---

## 3. African-Friendly Pricing + Low-Data UX

**The problem:** Most global job platforms price for Silicon Valley budgets and assume 5G connections.

**What AfriTalent does differently:**
- **Freemium with a real free tier** — candidates can build a full profile, browse jobs, and apply manually at no cost
- Paid tier ($5–$15/month) priced for African purchasing power, not US averages (Paystack integration in Phase 2 supports local payment methods: M-Pesa, bank transfer, mobile money)
- AI features (resume tailoring, cover letter drafting) are the paid upgrade, not basic job search
- Frontend optimized for low bandwidth: minimal JS bundles, no autoplay media, progressive loading
- Mobile-first layout — most African users are on mobile, often on limited data plans

**Why this matters for the product:** A product only used by Africans who can afford Stripe cards is not a product for Africans. Phase 2 Paystack integration + local payment methods unlock the mass market.

---

## 4. Quality Applications — No Spam Auto-Apply in MVP

**The problem:** Platforms that enable bulk auto-apply degrade employer experience, increase rejection rates, and ultimately hurt candidates with low-quality matches.

**What AfriTalent does differently:**
- MVP uses **Assisted Apply**: AI builds the tailored resume + cover letter, but the candidate reviews and approves before submission
- No "apply to 200 jobs in one click" — intentionally gated
- Auto-pilot (rules-based auto-apply) is a **premium, consent-gated feature** with strict guardrails: daily cap, blacklist companies, salary floor, country filter
- Employers see AfriTalent applications as higher quality because they come with tailored materials, not copy-paste CVs
- Application completeness score shown to candidates before they submit ("Your application is 72% complete — add a skills section to reach 90%")

**Why this matters for the product:** Every successful hire is a case study. Every spam application is a burned employer relationship. Quality over volume is the moat.

---

## Summary — The Narrative for Investors + Marketing

AfriTalent is the only platform that:

1. **Curates visa-sponsoring employers** so candidates only see real opportunities
2. **Protects candidate privacy** until they choose to engage
3. **Prices for African purchasing power**, not Western SaaS norms
4. **Produces quality applications** with AI assistance, not bulk automation

The global talent shortage is real. African engineers, healthcare workers, tradespeople, and professionals are ready. The gap is not talent — it's infrastructure for trust, visibility, and safe navigation. AfriTalent closes that gap.

---

*Last updated: 2026-02-18 | Status: v1 draft | Owner: Product*
