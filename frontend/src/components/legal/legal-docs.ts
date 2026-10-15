import type { PublicMessageKey } from "@/lib/i18n/public-messages";

// Structure of each legal page; the words live in messages/legal/<locale>.ts.
// Inline tags in the messages: <b>bold</b>, <mail>address</mail>, and the
// link tags declared in `links` (rendered as localized internal links).

type Block =
  | { kind: "p"; key: PublicMessageKey }
  | { kind: "ul"; items: PublicMessageKey[] }
  | { kind: "table"; head: PublicMessageKey[]; rows: Array<Array<PublicMessageKey | { code: string }>> };

export interface LegalDocumentDefinition {
  title: PublicMessageKey;
  updated: { year: number; month: number };
  intro?: PublicMessageKey;
  links?: Record<string, string>;
  sections: Array<{ heading: PublicMessageKey; blocks: Block[] }>;
}

export const LEGAL_DOCUMENTS = {
  privacy: {
    title: "legal.privacy.title",
    updated: { year: 2026, month: 2 },
    links: { cookies: "/cookies-policy" },
    sections: [
      { heading: "legal.privacy.s1", blocks: [{ kind: "p", key: "legal.privacy.s1.p1" }] },
      {
        heading: "legal.privacy.s2",
        blocks: [
          { kind: "p", key: "legal.privacy.s2.provided" },
          { kind: "p", key: "legal.privacy.s2.automatic" },
          { kind: "p", key: "legal.privacy.s2.ai" },
          { kind: "p", key: "legal.privacy.s2.analytics" },
        ],
      },
      {
        heading: "legal.privacy.s3",
        blocks: [
          {
            kind: "ul",
            items: [
              "legal.privacy.s3.i1",
              "legal.privacy.s3.i2",
              "legal.privacy.s3.i3",
              "legal.privacy.s3.i4",
              "legal.privacy.s3.i5",
            ],
          },
        ],
      },
      {
        heading: "legal.privacy.s4",
        blocks: [
          { kind: "p", key: "legal.privacy.s4.p1" },
          { kind: "ul", items: ["legal.privacy.s4.i1", "legal.privacy.s4.i2", "legal.privacy.s4.i3"] },
        ],
      },
      { heading: "legal.privacy.s5", blocks: [{ kind: "p", key: "legal.privacy.s5.p1" }] },
      { heading: "legal.privacy.s6", blocks: [{ kind: "p", key: "legal.privacy.s6.p1" }] },
      { heading: "legal.privacy.s7", blocks: [{ kind: "p", key: "legal.privacy.s7.p1" }] },
      { heading: "legal.privacy.s8", blocks: [{ kind: "p", key: "legal.privacy.s8.p1" }] },
      { heading: "legal.privacy.s9", blocks: [{ kind: "p", key: "legal.privacy.s9.p1" }] },
    ],
  },
  terms: {
    title: "legal.terms.title",
    updated: { year: 2026, month: 2 },
    sections: [
      { heading: "legal.terms.s1", blocks: [{ kind: "p", key: "legal.terms.s1.p1" }] },
      {
        heading: "legal.terms.s2",
        blocks: [{ kind: "ul", items: ["legal.terms.s2.i1", "legal.terms.s2.i2", "legal.terms.s2.i3", "legal.terms.s2.i4"] }],
      },
      {
        heading: "legal.terms.s3",
        blocks: [
          { kind: "p", key: "legal.terms.s3.p1" },
          { kind: "ul", items: ["legal.terms.s3.i1", "legal.terms.s3.i2", "legal.terms.s3.i3"] },
        ],
      },
      { heading: "legal.terms.s4", blocks: [{ kind: "p", key: "legal.terms.s4.p1" }] },
      { heading: "legal.terms.s5", blocks: [{ kind: "p", key: "legal.terms.s5.p1" }] },
      { heading: "legal.terms.s6", blocks: [{ kind: "p", key: "legal.terms.s6.p1" }] },
      { heading: "legal.terms.s7", blocks: [{ kind: "p", key: "legal.terms.s7.p1" }] },
      { heading: "legal.terms.s8", blocks: [{ kind: "p", key: "legal.terms.s8.p1" }] },
    ],
  },
  cookies: {
    title: "legal.cookies.title",
    updated: { year: 2026, month: 2 },
    sections: [
      { heading: "legal.cookies.s1", blocks: [{ kind: "p", key: "legal.cookies.s1.p1" }] },
      {
        heading: "legal.cookies.s2",
        blocks: [
          {
            kind: "table",
            head: ["legal.cookies.th.cookie", "legal.cookies.th.type", "legal.cookies.th.purpose", "legal.cookies.th.duration"],
            rows: [
              [{ code: "auth_token" }, "legal.cookies.row.essential", "legal.cookies.row.authPurpose", "legal.cookies.row.sevenDays"],
            ],
          },
        ],
      },
      { heading: "legal.cookies.s3", blocks: [{ kind: "p", key: "legal.cookies.s3.p1" }] },
      { heading: "legal.cookies.s4", blocks: [{ kind: "p", key: "legal.cookies.s4.p1" }] },
      { heading: "legal.cookies.s5", blocks: [{ kind: "p", key: "legal.cookies.s5.p1" }] },
    ],
  },
  accessibility: {
    title: "legal.a11y.title",
    updated: { year: 2026, month: 2 },
    sections: [
      { heading: "legal.a11y.s1", blocks: [{ kind: "p", key: "legal.a11y.s1.p1" }] },
      { heading: "legal.a11y.s2", blocks: [{ kind: "p", key: "legal.a11y.s2.p1" }] },
      {
        heading: "legal.a11y.s3",
        blocks: [
          { kind: "p", key: "legal.a11y.s3.p1" },
          { kind: "ul", items: ["legal.a11y.s3.i1", "legal.a11y.s3.i2", "legal.a11y.s3.i3", "legal.a11y.s3.i4"] },
        ],
      },
      {
        heading: "legal.a11y.s4",
        blocks: [
          { kind: "p", key: "legal.a11y.s4.p1" },
          { kind: "ul", items: ["legal.a11y.s4.i1", "legal.a11y.s4.i2"] },
        ],
      },
      {
        heading: "legal.a11y.s5",
        blocks: [
          { kind: "p", key: "legal.a11y.s5.p1" },
          { kind: "p", key: "legal.a11y.s5.p2" },
        ],
      },
    ],
  },
} satisfies Record<string, LegalDocumentDefinition>;

export type LegalDocumentId = keyof typeof LEGAL_DOCUMENTS;
