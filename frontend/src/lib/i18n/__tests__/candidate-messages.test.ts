import { SUPPORTED_LOCALES } from "../config";
import {
  CANDIDATE_MESSAGES,
  CANDIDATE_NAMESPACES,
  formatCandidateMessage,
  translateCandidate,
  type CandidateMessageKey,
} from "../candidate-messages";

describe("candidate workspace messages", () => {
  it("keeps keys unique across the candidate namespaces", () => {
    const seen = new Set<string>();
    for (const ns of Object.values(CANDIDATE_NAMESPACES)) {
      for (const key of Object.keys(ns.en)) {
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(CANDIDATE_MESSAGES[locale])).toHaveLength(seen.size);
    }
  });

  it("interpolates variables and leaves unknown placeholders intact", () => {
    expect(formatCandidateMessage("{a} of {b}", { a: 1 })).toBe("1 of {b}");
  });

  it("translates outside English and falls back to English", () => {
    const key = "dash.title" as CandidateMessageKey;
    expect(translateCandidate("fr", key)).not.toBe(translateCandidate("en", key));
    expect(translateCandidate("ar", key)).toBeTruthy();
  });
});
