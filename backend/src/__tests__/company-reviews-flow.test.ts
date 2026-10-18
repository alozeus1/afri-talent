/**
 * Company review flow end to end against a small stateful in-memory Prisma
 * fake (only the calls these routes make):
 *   submit (pending) -> admin console approve -> aggregates recomputed ->
 *   visible on GET /api/companies/:id; reject removes it again.
 *   Employer profiles are reviewable via their shadow Company row.
 *   Helpful votes are deduplicated per user (unique userId+reviewId).
 */
import { vi, describe, it, expect, beforeEach } from "vitest";

// authenticate rehydrates the account per request; model the account behind
// every token this suite mints (see helpers/current-account.ts).
vi.mock("../lib/jwt.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockJwtModule(importOriginal));
vi.mock("../lib/account-access.js", async (importOriginal) =>
  (await import("./helpers/current-account.js")).mockAccountAccessModule(importOriginal));

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const store = vi.hoisted(() => ({
  companies: new Map<string, Row>(),
  employers: new Map<string, Row>(),
  reviews: new Map<string, Row>(),
  aggregates: new Map<string, Row>(),
  votes: [] as Row[],
  seq: 0,
}));

vi.mock("../lib/prisma.js", async () => {
  const { Prisma } = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("in" in v) return (v.in as unknown[]).includes(row[k]);
        if ("not" in v) return row[k] !== v.not;
        if ("gt" in v) return row[k] > v.gt;
      }
      return row[k] === v;
    });

  const pick = (row: Row, select?: Row) =>
    select ? Object.fromEntries(Object.keys(select).filter((k) => select[k] === true).map((k) => [k, row[k]])) : { ...row };

  const applyData = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === "object" && "increment" in v) row[k] += v.increment;
      else if (v && typeof v === "object" && "decrement" in v) row[k] -= v.decrement;
      else row[k] = v;
    }
    return row;
  };

  const companyWithIncludes = (c: Row, args: Row) => {
    if (args.select) return pick(c, args.select);
    const out: Row = { ...c };
    if (args.include?.ratingAggregate) out.ratingAggregate = store.aggregates.get(c.id) ?? null;
    if (args.include?.reviews) {
      const r = args.include.reviews;
      out.reviews = [...store.reviews.values()]
        .filter((rev) => rev.companyId === c.id && matches(rev, r.where))
        .map((rev) => pick(rev, r.select));
    }
    return out;
  };

  const db: Row = {
    company: {
      findUnique: vi.fn(async (args: Row) => {
        const c = store.companies.get(args.where.id);
        return c ? companyWithIncludes(c, args) : null;
      }),
      upsert: vi.fn(async (args: Row) => {
        const existing = store.companies.get(args.where.id);
        if (existing) return pick(applyData(existing, args.update), args.select);
        const row = { ...args.create };
        store.companies.set(row.id, row);
        return pick(row, args.select);
      }),
    },
    employer: {
      findUnique: vi.fn(async (args: Row) => {
        const e = store.employers.get(args.where.id);
        if (!e) return null;
        return args.select ? pick(e, args.select) : { ...e, trustProfile: null, _count: { jobs: 0 } };
      }),
    },
    job: { count: vi.fn(async () => 0) },
    companyReview: {
      findFirst: vi.fn(async (args: Row) => {
        const r = [...store.reviews.values()].find((rev) => matches(rev, args.where));
        return r ? pick(r, args.select) : null;
      }),
      findUnique: vi.fn(async (args: Row) => {
        const r = store.reviews.get(args.where.id);
        return r ? pick(r, args.select) : null;
      }),
      findMany: vi.fn(async (args: Row) =>
        [...store.reviews.values()].filter((rev) => matches(rev, args.where)).map((rev) => pick(rev, args.select)),
      ),
      count: vi.fn(async (args: Row) => [...store.reviews.values()].filter((rev) => matches(rev, args.where)).length),
      create: vi.fn(async (args: Row) => {
        const row = {
          id: `rev_${++store.seq}`,
          helpfulCount: 0,
          isApproved: false,
          moderatedAt: null,
          rejectedAt: null,
          cultureRating: null,
          salaryRating: null,
          workLifeRating: null,
          managementRating: null,
          growthRating: null,
          createdAt: new Date(),
          ...args.data,
        };
        store.reviews.set(row.id, row);
        return { ...row };
      }),
      update: vi.fn(async (args: Row) => {
        const r = store.reviews.get(args.where.id);
        if (!r) throw Object.assign(new Error("missing"), { code: "P2025" });
        return pick(applyData(r, args.data), args.select);
      }),
      updateMany: vi.fn(async (args: Row) => {
        const rows = [...store.reviews.values()].filter((rev) => matches(rev, args.where));
        rows.forEach((r) => applyData(r, args.data));
        return { count: rows.length };
      }),
    },
    companyRatingAggregate: {
      upsert: vi.fn(async (args: Row) => {
        const row = { companyId: args.where.companyId, ...args.update };
        store.aggregates.set(args.where.companyId, row);
        return row;
      }),
      deleteMany: vi.fn(async (args: Row) => {
        const had = store.aggregates.delete(args.where.companyId);
        return { count: had ? 1 : 0 };
      }),
    },
    companyReviewHelpfulVote: {
      create: vi.fn(async (args: Row) => {
        const { userId, reviewId } = args.data;
        if (store.votes.some((v) => v.userId === userId && v.reviewId === reviewId)) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "5.22.0",
          });
        }
        const row = { id: `vote_${++store.seq}`, userId, reviewId };
        store.votes.push(row);
        return row;
      }),
      findMany: vi.fn(async (args: Row) => store.votes.filter((v) => matches(v, args.where)).map((v) => pick(v, args.select))),
      deleteMany: vi.fn(async (args: Row) => {
        const before = store.votes.length;
        store.votes = store.votes.filter((v) => !matches(v, args.where));
        return { count: before - store.votes.length };
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  // Real Prisma queries are lazy until awaited; mirror that so an array
  // $transaction stops at the first failure (atomicity for the fake).
  for (const model of Object.values(db)) {
    for (const [name, fn] of Object.entries(model as Row)) {
      if (typeof fn !== "function") continue;
      (model as Row)[name] = vi.fn((args: Row) => {
        let p: Promise<unknown> | undefined;
        return {
          then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => (p ??= (fn as (a: Row) => Promise<unknown>)(args)).then(res, rej),
        };
      });
    }
  }
  // Array form: run sequentially, abort on first failure (good enough for a fake).
  db.$transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: Row) => unknown)(db);
    const out = [];
    for (const p of arg as Promise<unknown>[]) out.push(await p);
    return out;
  });
  return { default: db };
});

import request from "supertest";
import app from "../app.js";
import { Role } from "@prisma/client";
import { signToken } from "../lib/jwt.js";

const token = (role: Role, userId: string) => signToken({ userId, email: `${userId}@test.com`, role });
const auth = (role: Role, userId: string) => ({ Authorization: `Bearer ${token(role, userId)}` });

const review = (overrides: Record<string, unknown> = {}) => ({
  overallRating: 4,
  cultureRating: 5,
  title: "Great place for remote engineers",
  pros: "Supportive managers and clear async culture across time zones.",
  cons: "Compensation reviews could happen more often than once a year.",
  jobTitle: "Backend Engineer",
  ...overrides,
});

beforeEach(() => {
  store.companies.clear();
  store.employers.clear();
  store.reviews.clear();
  store.aggregates.clear();
  store.votes = [];
  store.companies.set("co_1", { id: "co_1", name: "Acme Africa", description: null, logo: null });
  store.employers.set("emp_1", {
    id: "emp_1",
    companyName: "Lagos Labs",
    website: "https://lagoslabs.example",
    location: "Lagos",
    bio: null,
    logoUrl: null,
    brandColor: null,
    accentColor: null,
  });
});

describe("company review flow", () => {
  it("submit -> pending (hidden) -> admin approve -> aggregates + visible on company page", async () => {
    const submit = await request(app)
      .post("/api/companies/co_1/reviews")
      .set(auth(Role.CANDIDATE, "cand_a"))
      .send(review());
    expect(submit.status).toBe(201);
    const reviewId = submit.body.review.id;

    // Pending: not public, no aggregate yet.
    let page = await request(app).get("/api/companies/co_1");
    expect(page.status).toBe(200);
    expect(page.body.company.reviews).toHaveLength(0);
    expect(page.body.company.ratingAggregate).toBeNull();

    // Pending queue in the admin console.
    const queue = await request(app).get("/api/admin/reviews?status=pending").set(auth(Role.ADMIN, "admin_1"));
    expect(queue.status).toBe(200);

    // Approve through the admin console path.
    const approve = await request(app)
      .put(`/api/admin/reviews/${reviewId}/moderate`)
      .set(auth(Role.ADMIN, "admin_1"))
      .send({ action: "approve" });
    expect(approve.status).toBe(200);
    expect(approve.body.isApproved).toBe(true);
    expect(approve.body.moderatedAt).toBeTruthy();

    page = await request(app).get("/api/companies/co_1");
    expect(page.body.company.reviews).toHaveLength(1);
    expect(page.body.company.reviews[0].title).toBe("Great place for remote engineers");
    expect(page.body.company.reviews[0].userId).toBeUndefined(); // reviewer identity never exposed
    expect(page.body.company.ratingAggregate).toMatchObject({ totalReviews: 1, averageOverall: 4, averageCulture: 5 });

    // A second approved review updates the averages.
    const second = await request(app)
      .post("/api/companies/co_1/reviews")
      .set(auth(Role.CANDIDATE, "cand_b"))
      .send(review({ overallRating: 2, cultureRating: 3 }));
    await request(app)
      .patch(`/api/companies/co_1/reviews/${second.body.review.id}/moderate`)
      .set(auth(Role.ADMIN, "admin_1"))
      .send({ approved: true });
    page = await request(app).get("/api/companies/co_1");
    expect(page.body.company.ratingAggregate).toMatchObject({ totalReviews: 2, averageOverall: 3, averageCulture: 4, recommendationPct: 50 });

    // Rejecting removes it from the aggregate again and marks it rejected.
    const reject = await request(app)
      .put(`/api/admin/reviews/${second.body.review.id}/moderate`)
      .set(auth(Role.ADMIN, "admin_1"))
      .send({ action: "reject" });
    expect(reject.body.rejectedAt).toBeTruthy();
    page = await request(app).get("/api/companies/co_1");
    expect(page.body.company.ratingAggregate).toMatchObject({ totalReviews: 1, averageOverall: 4 });
  });

  it("rejects a duplicate review from the same user with 409 and invalid input with 400", async () => {
    await request(app).post("/api/companies/co_1/reviews").set(auth(Role.CANDIDATE, "cand_a")).send(review());
    const dup = await request(app).post("/api/companies/co_1/reviews").set(auth(Role.CANDIDATE, "cand_a")).send(review());
    expect(dup.status).toBe(409);

    const bad = await request(app)
      .post("/api/companies/co_1/reviews")
      .set(auth(Role.CANDIDATE, "cand_c"))
      .send(review({ title: "short" }));
    expect(bad.status).toBe(400);
  });

  it("only candidates can submit; unknown companies 404", async () => {
    const asEmployer = await request(app).post("/api/companies/co_1/reviews").set(auth(Role.EMPLOYER, "emp_user")).send(review());
    expect(asEmployer.status).toBe(403);

    const missing = await request(app).post("/api/companies/nope/reviews").set(auth(Role.CANDIDATE, "cand_a")).send(review());
    expect(missing.status).toBe(404);
  });

  it("employer profiles are reviewable via a shadow company and show approved reviews", async () => {
    const submit = await request(app).post("/api/companies/emp_1/reviews").set(auth(Role.CANDIDATE, "cand_a")).send(review());
    expect(submit.status).toBe(201);
    expect(store.companies.get("emp_1")).toMatchObject({ name: "Lagos Labs" });

    await request(app)
      .put(`/api/admin/reviews/${submit.body.review.id}/moderate`)
      .set(auth(Role.ADMIN, "admin_1"))
      .send({ action: "approve" });

    const page = await request(app).get("/api/companies/emp_1");
    expect(page.status).toBe(200);
    expect(page.body.company.profileType).toBe("EMPLOYER");
    expect(page.body.company.companyName).toBe("Lagos Labs");
    expect(page.body.company.reviews).toHaveLength(1);
    expect(page.body.company.ratingAggregate).toMatchObject({ totalReviews: 1, averageOverall: 4 });
  });
});

describe("helpful vote dedupe", () => {
  async function approvedReview(): Promise<string> {
    const submit = await request(app).post("/api/companies/co_1/reviews").set(auth(Role.CANDIDATE, "author")).send(review());
    await request(app)
      .put(`/api/admin/reviews/${submit.body.review.id}/moderate`)
      .set(auth(Role.ADMIN, "admin_1"))
      .send({ action: "approve" });
    return submit.body.review.id;
  }

  it("counts one vote per user, is idempotent on repeat, and can be withdrawn", async () => {
    const id = await approvedReview();
    const url = `/api/companies/co_1/reviews/${id}/helpful`;

    const first = await request(app).post(url).set(auth(Role.CANDIDATE, "reader_1"));
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ voted: true, alreadyVoted: false, helpfulCount: 1 });

    const repeat = await request(app).post(url).set(auth(Role.CANDIDATE, "reader_1"));
    expect(repeat.status).toBe(200);
    expect(repeat.body).toMatchObject({ alreadyVoted: true, helpfulCount: 1 });

    const other = await request(app).post(url).set(auth(Role.EMPLOYER, "reader_2"));
    expect(other.body.helpfulCount).toBe(2);
    expect(store.reviews.get(id)!.helpfulCount).toBe(2);
    expect(store.votes).toHaveLength(2);

    // Reader sees their own vote state on the reviews list.
    const list = await request(app).get("/api/companies/co_1/reviews").set(auth(Role.CANDIDATE, "reader_1"));
    expect(list.body.reviews[0].votedByViewer).toBe(true);

    const withdraw = await request(app).delete(url).set(auth(Role.CANDIDATE, "reader_1"));
    expect(withdraw.body).toMatchObject({ voted: false, helpfulCount: 1 });
    const withdrawAgain = await request(app).delete(url).set(auth(Role.CANDIDATE, "reader_1"));
    expect(withdrawAgain.body.helpfulCount).toBe(1);
  });

  it("blocks self-votes, unapproved reviews and anonymous callers", async () => {
    const id = await approvedReview();
    const self = await request(app).post(`/api/companies/co_1/reviews/${id}/helpful`).set(auth(Role.CANDIDATE, "author"));
    expect(self.status).toBe(400);

    const pending = await request(app).post("/api/companies/co_1/reviews").set(auth(Role.CANDIDATE, "cand_z")).send(review());
    const onPending = await request(app)
      .post(`/api/companies/co_1/reviews/${pending.body.review.id}/helpful`)
      .set(auth(Role.CANDIDATE, "reader_1"));
    expect(onPending.status).toBe(404);

    const anon = await request(app).post(`/api/companies/co_1/reviews/${id}/helpful`);
    expect(anon.status).toBe(401);
  });
});
