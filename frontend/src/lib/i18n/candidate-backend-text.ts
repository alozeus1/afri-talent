"use client";

// Localises the fixed English copy that some candidate APIs still return
// (retention journeys and weekly digest from lib/candidate-retention.ts, trust
// badge and warnings from lib/trust/risk.ts). Unknown text is shown as-is, so a
// new backend string degrades to English rather than breaking the page.
import { useCallback } from "react";
import { useCandidateT, type CandidateMessageKey } from "./candidate-messages";

const EXACT: Record<string, CandidateMessageKey> = {
  "Saved search alerts are running": "dash.bt.savedSearch.done.title",
  "Your job alerts can keep discovering fresh matches while you are away.": "dash.bt.savedSearch.done.desc",
  "Refine alerts": "dash.bt.savedSearch.done.cta",
  "Create a saved search": "dash.bt.savedSearch.ready.title",
  "Turn your preferences into a trusted job feed instead of starting from scratch each visit.": "dash.bt.savedSearch.ready.desc",
  "Create alert": "dash.bt.savedSearch.ready.cta",
  "Profile is employer-ready": "dash.bt.profile.done.title",
  "Your profile already gives employers the context they need to trust a shortlist.": "dash.bt.profile.done.desc",
  "Review profile": "dash.bt.profile.done.cta",
  "Complete your profile": "dash.bt.profile.ready.title",
  "A stronger profile increases recommendation quality and employer response rates.": "dash.bt.profile.ready.desc",
  "Complete profile": "dash.bt.profile.ready.cta",
  "Verification signals are strong": "dash.bt.verify.done.title",
  "Verified details help premium employers trust your application faster.": "dash.bt.verify.done.desc",
  "Review trust profile": "dash.bt.verify.done.cta",
  "Finish profile verification": "dash.bt.verify.ready.title",
  "Phone, identity, and skills signals unlock stronger employer trust filters.": "dash.bt.verify.ready.desc",
  "Boost trust score": "dash.bt.verify.ready.cta",
  "Keep momentum on live applications": "dash.bt.momentum.watch.title",
  "Stay responsive, keep documents current, and line up backup opportunities.": "dash.bt.momentum.watch.desc",
  "Track applications": "dash.bt.momentum.watch.cta",
  "Build application momentum": "dash.bt.momentum.ready.title",
  "Fresh, trusted roles are waiting. A steady application rhythm beats random bursts.": "dash.bt.momentum.ready.desc",
  "Browse matches": "dash.bt.momentum.ready.cta",
  "Salary signal available": "dash.bt.salary.ready.title",
  "Use current market data to judge whether a role is worth your time.": "dash.bt.salary.ready.desc",
  "See salary data": "dash.bt.salary.ready.cta",
  "Salary insight will unlock soon": "dash.bt.salary.watch.title",
  "As we collect more salary data for your target roles, we will highlight pay trends here.": "dash.bt.salary.watch.desc",
  "Explore salary hub": "dash.bt.salary.watch.cta",
  "Interview prep is recommended": "dash.bt.interview.ready.title",
  "You have active employer interest. Practice now while the window is warm.": "dash.bt.interview.ready.desc",
  "Start prep": "dash.bt.interview.ready.cta",
  "Interview prep will appear when needed": "dash.bt.interview.watch.title",
  "Once you are shortlisted or under review, we will suggest targeted mock interview prep.": "dash.bt.interview.watch.desc",
  "Open assistant": "dash.bt.interview.watch.cta",
  "We are watching the market for the next high-signal role.": "dash.bt.digest.empty",
  "Email verified": "dash.bt.badge.email",
  "Phone verified": "dash.bt.badge.phone",
  "Identity verified": "dash.bt.badge.identity",
  "Skills verified": "dash.bt.badge.skills",
  "Employment history checked": "dash.bt.badge.employment",
  "Unverified profile": "dash.bt.badge.unverified",
  "Complete more of your profile to improve authenticity.": "dash.bt.warn.profile",
  "Your account has unresolved trust reports.": "dash.bt.warn.reports",
  "High-volume applications can trigger anti-spam review.": "dash.bt.warn.volume",
  "Add evidence-backed skills or portfolio links to increase employer confidence.": "dash.bt.warn.evidence",
};

const PATTERNS: Array<[RegExp, CandidateMessageKey]> = [
  [/^(\d+) trusted roles rose to the top this week\.$/, "dash.bt.digest.trusted"],
  [/^(\d+) fresh matches fit your profile right now\.$/, "dash.bt.digest.fresh"],
];

export function useCandidateBackendText() {
  const t = useCandidateT();
  return useCallback(
    (text: string | null | undefined): string => {
      if (!text) return "";
      const key = EXACT[text];
      if (key) return t(key);
      for (const [re, patternKey] of PATTERNS) {
        const match = re.exec(text);
        if (match) return t(patternKey, { count: match[1] });
      }
      return text;
    },
    [t],
  );
}
