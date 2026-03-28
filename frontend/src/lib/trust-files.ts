import { files } from "@/lib/api";

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type VerificationUploadScope =
  | "candidate-verification"
  | "employer-verification";

function resolveContentType(file: File): typeof PDF_MIME | typeof DOCX_MIME {
  if (file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf")) {
    return PDF_MIME;
  }

  if (file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
    return DOCX_MIME;
  }

  throw new Error("Upload a PDF or DOCX document.");
}

export async function uploadVerificationFile(
  file: File,
  scope: VerificationUploadScope,
) {
  const contentType = resolveContentType(file);
  const upload = await files.presign({
    scope,
    contentType,
    fileName: file.name,
    fileSizeBytes: file.size,
  });

  const response = await fetch(upload.presignedUrl, {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });

  if (!response.ok) {
    throw new Error("Failed to upload the verification file.");
  }

  return {
    fileKey: upload.s3Key,
    fileName: file.name,
  };
}
