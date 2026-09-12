// 얇은 라우팅 셸. 실제 로직은 backend/services/profile.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse, ValidationError } from "@/backend/lib/http-errors";
import { createProfile, getProfile, updateProfile } from "@/backend/services/profile";

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ValidationError("요청 본문은 JSON 객체여야 합니다.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("유효한 JSON 본문이 필요합니다.");
  }
}

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const profile = await getProfile(uid);
    return Response.json({ profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const profile = await createProfile(uid, body);
    return Response.json({ profile }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const profile = await updateProfile(uid, body);
    return Response.json({ profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}
