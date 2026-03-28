import { NextRequest, NextResponse } from "next/server";

function buildRedirect(req: NextRequest, sourceParams: URLSearchParams): NextResponse {
  const params = new URLSearchParams();
  params.set("provider", "apple");

  const passthroughKeys = ["code", "id_token", "state", "error", "error_description", "user"];
  for (const key of passthroughKeys) {
    const value = sourceParams.get(key);
    if (value) {
      params.set(key, value);
    }
  }

  const redirectUrl = new URL(`/auth/callback?${params.toString()}`, req.nextUrl.origin);
  return NextResponse.redirect(redirectUrl);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = new URLSearchParams();

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return buildRedirect(req, params);
}

export async function GET(req: NextRequest) {
  return buildRedirect(req, req.nextUrl.searchParams);
}
