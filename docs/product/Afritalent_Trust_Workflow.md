# AfriTalent Trust Workflow

AfriTalent should position trust as a product feature, not just a moderation task.

## Job Trust Signals

Recommended labels:

- Verified: employer or source has been manually verified.
- ATS Verified: apply URL points to a known ATS or official careers domain.
- Quality Checked: job has enough description, location, employment type, and apply details.
- Salary Transparent: salary range is present and plausible.
- Recently Checked: source was checked recently.
- Needs Review: important data is missing or confidence is low.
- Low Trust: multiple quality or verification concerns exist.
- Possible Scam: high-risk signals are present.

## What To Check

- Official company website and careers page.
- Apply URL domain and ATS provider.
- Recruiter email domain.
- Payment or equipment-fee requests.
- WhatsApp/Telegram-only communication.
- Unrealistic salary compared with role and region.
- Missing or vague job description.
- Duplicate spam patterns.
- Freshness and last-checked date.

## Candidate-Facing Explanation

Every warning should explain what was checked and what the candidate should verify next. Avoid absolute claims unless the employer is truly verified.

Example:

> This job has a verified ATS application path and was recently checked. Before applying, verify the role on the employer careers page and do not pay any application or equipment fees.

## Admin Workflow Recommendation

- Queue jobs with `Low Trust` or `Possible Scam` for moderation.
- Let admins mark jobs as reviewed, trusted, rejected, or needs more evidence.
- Store reviewer, timestamp, reason, and source evidence.
- Keep automated scores explainable and reversible.

## Current Implementation Note

The smart-search pipeline already includes scam, quality, and trust-related scoring utilities. This pass does not change database schema. Backend persistence for moderation decisions should be planned separately.

