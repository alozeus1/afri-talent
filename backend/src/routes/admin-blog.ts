// ─────────────────────────────────────────────────────────────────────────────
// Admin Blog Routes — review, approve, reject, and trigger AI blog posts
//
// All routes require ADMIN role.
//
// GET    /api/admin/blog          — list all AI-generated blog posts (with status filter)
// GET    /api/admin/blog/:id      — get full draft with content
// PUT    /api/admin/blog/:id/approve — publish the post (sets published=true, approves review)
// PUT    /api/admin/blog/:id/reject  — reject the post (keeps unpublished, notes required)
// POST   /api/admin/blog/trigger  — manually trigger pipeline (for testing/on-demand)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { ReviewStatus, ReviewTargetType, Role } from "@prisma/client";
import prisma from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { runBlogPipeline } from "../lib/blog/pipeline.js";
import logger from "../lib/logger.js";
import { BLOG_CATEGORY } from "../lib/blog/types.js";

const router = Router();
const log = logger.child({ route: "admin-blog" });

router.use(authenticate, authorize(Role.ADMIN));

const rejectSchema = z.object({
  notes: z.string().min(1, "Rejection notes are required"),
});

// ── GET /api/admin/blog — list blog posts with optional status filter ─────────

router.get("/", async (req: Request, res: Response) => {
  try {
    const { status = "pending", page = "1", limit = "20" } = req.query;

    // Map query status to published flag
    let publishedFilter: boolean | undefined;
    if (status === "pending") publishedFilter = false;
    else if (status === "published") publishedFilter = true;
    // "all" = no filter

    const where: { category: string; published?: boolean } = { category: BLOG_CATEGORY };
    if (publishedFilter !== undefined) where.published = publishedFilter;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [posts, total] = await Promise.all([
      prisma.resource.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          coverImage: true,
          published: true,
          publishedAt: true,
          createdAt: true,
          adminReviews: {
            select: { id: true, status: true, notes: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.resource.count({ where }),
    ]);

    // Compute word count from content for each post
    const postsWithMeta = posts.map((post) => ({
      ...post,
      reviewStatus: post.adminReviews[0]?.status ?? "PENDING",
      reviewNotes: post.adminReviews[0]?.notes ?? null,
    }));

    res.json({
      posts: postsWithMeta,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    log.error({ error }, "list blog posts error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/blog/:id — get full post with content ─────────────────────

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const post = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: {
        adminReviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { reviewer: { select: { id: true, email: true } } },
        },
      },
    });

    if (!post || post.category !== BLOG_CATEGORY) {
      res.status(404).json({ error: "Blog post not found" });
      return;
    }

    res.json({
      ...post,
      wordCount: post.content.split(/\s+/).length,
      reviewStatus: post.adminReviews[0]?.status ?? "PENDING",
      reviewNotes: post.adminReviews[0]?.notes ?? null,
    });
  } catch (error) {
    log.error({ error }, "get blog post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/admin/blog/:id/approve — publish the post ───────────────────────

router.put("/:id/approve", async (req: Request, res: Response) => {
  try {
    const post = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { adminReviews: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!post || post.category !== BLOG_CATEGORY) {
      res.status(404).json({ error: "Blog post not found" });
      return;
    }

    if (post.published) {
      res.status(400).json({ error: "Blog post is already published" });
      return;
    }

    // Publish the resource and update the review in a transaction
    const [updatedPost] = await prisma.$transaction([
      prisma.resource.update({
        where: { id: post.id },
        data: { published: true, publishedAt: new Date() },
      }),
      // Update existing review or create a new approval record
      ...(post.adminReviews[0]
        ? [
            prisma.adminReview.update({
              where: { id: post.adminReviews[0].id },
              data: { status: ReviewStatus.APPROVED },
            }),
          ]
        : [
            prisma.adminReview.create({
              data: {
                status: ReviewStatus.APPROVED,
                targetType: ReviewTargetType.RESOURCE,
                targetResourceId: post.id,
                reviewerId: (req as unknown as { user: { id: string } }).user.id,
              },
            }),
          ]),
    ]);

    log.info({ resourceId: post.id, title: post.title }, "blog post approved and published");

    res.json({ success: true, resource: updatedPost });
  } catch (error) {
    log.error({ error }, "approve blog post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/admin/blog/:id/reject — reject the post ─────────────────────────

router.put("/:id/reject", async (req: Request, res: Response) => {
  try {
    const data = rejectSchema.parse(req.body);

    const post = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: { adminReviews: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (!post || post.category !== BLOG_CATEGORY) {
      res.status(404).json({ error: "Blog post not found" });
      return;
    }

    // Update review record
    if (post.adminReviews[0]) {
      await prisma.adminReview.update({
        where: { id: post.adminReviews[0].id },
        data: { status: ReviewStatus.REJECTED, notes: data.notes },
      });
    } else {
      await prisma.adminReview.create({
        data: {
          status: ReviewStatus.REJECTED,
          notes: data.notes,
          targetType: ReviewTargetType.RESOURCE,
          targetResourceId: post.id,
          reviewerId: (req as unknown as { user: { id: string } }).user.id,
        },
      });
    }

    log.info({ resourceId: post.id, title: post.title }, "blog post rejected");

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.issues });
      return;
    }
    log.error({ error }, "reject blog post error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/blog/trigger — manually trigger pipeline ──────────────────

router.post("/trigger", async (_req: Request, res: Response) => {
  log.info("manual blog pipeline trigger requested");

  // Fire pipeline in background — return immediately so HTTP doesn't time out
  setImmediate(async () => {
    try {
      const result = await runBlogPipeline();
      log.info({ result }, "manual blog pipeline trigger complete");
    } catch (err) {
      log.error({ err }, "manual blog pipeline trigger failed");
    }
  });

  res.json({ success: true, message: "Blog pipeline triggered — check /admin/blog for results in a few minutes." });
});

export default router;
