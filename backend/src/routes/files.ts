import { Router, Request, Response } from "express";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { authenticate, authorize } from "../middleware/auth.js";
import { Role } from "@prisma/client";

const router = Router();

const BUCKET = process.env.S3_UPLOADS_BUCKET;
const REGION = process.env.AWS_REGION || "us-east-1";
const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

const presignSchema = z.object({
  contentType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  fileName: z.string().min(1).max(255),
  fileSizeBytes: z.coerce.number().int().min(1).max(MAX_FILE_SIZE_BYTES),
});

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: REGION });
  }
  return s3Client;
}

// POST /api/files/presign — generate a presigned PUT URL for direct S3 upload
// Flow:
//   1. Frontend calls this to get a presigned URL + s3Key
//   2. Frontend PUTs the file directly to S3 (browser → S3, no server bandwidth)
//   3. Frontend calls POST /api/profile/resumes with the s3Key to register the metadata
router.post("/presign", authenticate, authorize(Role.CANDIDATE), async (req: Request, res: Response) => {
  if (!BUCKET) {
    res.status(503).json({
      error: "File uploads are not configured on this server",
      code: "S3_NOT_CONFIGURED",
    });
    return;
  }

  try {
    const data = presignSchema.parse(req.body);
    const ext = ALLOWED_CONTENT_TYPES[data.contentType];
    const s3Key = `resumes/${req.user!.userId}/${nanoid()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: data.contentType,
      ContentLength: data.fileSizeBytes,
      ServerSideEncryption: "aws:kms", // KMS encryption at rest
      Metadata: {
        userId: req.user!.userId,
        originalFileName: encodeURIComponent(data.fileName),
      },
    });

    const presignedUrl = await getSignedUrl(getS3Client(), command, {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    });

    res.json({
      presignedUrl,
      s3Key,
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      method: "PUT",
      headers: {
        "Content-Type": data.contentType,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }
    console.error("Presign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
