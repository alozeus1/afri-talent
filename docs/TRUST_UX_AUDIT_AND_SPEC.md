# Trust UX Audit And Spec

## Goal

Make AfriTalent feel immediately credible, safe, and professionally operated by improving visible trust cues, explanation copy, state handling, and support paths across public and signed-in trust surfaces.

## UI Audit

### Before

- Trust language was correct but flat and overly generic.
- Success, pending, rejected, and review states were mostly plain banners or raw status badges.
- Users could see a badge without enough context for why it existed.
- Support and escalation paths were inconsistent.
- Empty states often stopped at "nothing here yet" instead of explaining the next high-trust action.
- Trust center copy explained concepts, but not the distinction between free, paid, and verified clearly enough.

### After

- Trust states now use explicit status banners with better explanation copy.
- Explainability modals now clarify why a candidate, employer, or job is trusted.
- Empty states now point users toward the next trust-building action.
- Trust support and reporting paths are visible from public trust pages, signed-in trust pages, talent search, and job detail.
- Badge language is more consistent:
  - `Verified company domain`
  - `Business registration reviewed`
  - `Eligible for verified filters`
  - `Assessment verified`
  - `Complete profile`
  - `New employer review`

## Copy System

### Principles

- Explain trust in plain language.
- Separate platform access from trust approval.
- Never imply that payment creates trust.
- Use moderation language that feels protective, not punitive.
- Tell users what the other side sees.

### Core copy positions

- `Badges are earned, not bought`
- `Show employers proof, not just profile claims`
- `Filter for proof, not just keywords`
- `AfriTalent shows trust cues when there is concrete context behind them`

## New Components

- `frontend/src/components/trust/trust-status-banner.tsx`
  - Reusable state banner for success, info, warning, and danger trust states.
- `frontend/src/components/trust/trust-explainer-modal.tsx`
  - Accessible explainer modal for "why trusted" and verification explanation flows.
- `frontend/src/components/trust/trust-support-card.tsx`
  - Reusable support and reporting path card.

## Screen Specs

### Trust Center

- Hero must explain that AfriTalent combines verification, moderation, and fraud detection.
- Must clarify free vs paid vs verified.
- Must include employer badge explanations, candidate badge explanations, moderation transparency, safety tips, and report flow guidance.

### Employer Trust

- Must show current trust standing at the top.
- Must explain what candidates see.
- Must clarify whether public posting is enabled or still limited.
- Evidence list must show approved, pending, rejected, and needs-more-info states with explanatory copy.
- Must include support path for stuck verification or suspicious activity.

### Candidate Trust

- Must show current trust standing at the top.
- Must explain what employers see.
- Must clarify that premium filters use real evidence-backed trust signals.
- Phone, artifact, skill, and partner sections must each explain why they matter.
- Empty states must push toward the next credibility-building action.

### Employer Talent Search

- Must explain that advanced trust filters narrow to evidence-backed profiles.
- Candidate cards must show a short "why this candidate is trusted" block.
- Empty state must encourage broader filtering, not just say no results.

### Job Detail

- Must show why the employer or job looks trusted with concrete supporting reasons.
- Must preserve a clear report or support path if something feels suspicious.

## Accessibility Checks

- Explainer modal uses `role="dialog"` and `aria-modal="true"`.
- Modal can be dismissed with `Escape`.
- All trust actions remain keyboard reachable.
- Status banners use text, not color alone, to communicate state.
- Empty states and support paths are phrased as actionable text, not decorative copy.
- Existing button and focus-ring patterns are preserved.

## Screenshot Checklist

- Trust center hero plus free vs paid vs verified section
- Employer trust status banner plus "What candidates see"
- Candidate trust status banner plus explainability cards
- Employer talent result card with "Why this candidate is trusted"
- Job detail "Why this employer or job looks trusted"
- Trust report form with current target state and help copy

## QA Focus

- Verify modal open, close, and escape-key behavior.
- Verify support links and report links render correctly from each trust surface.
- Verify pending, approved, rejected, and needs-more-info artifact states.
- Verify no copy implies that payment creates verification.
- Verify badge language is consistent across trust center, dashboards, talent search, and job detail.
