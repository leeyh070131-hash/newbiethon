// 얇은 라우팅 셸. 실제 로직은 backend/services/profile.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { parseJsonBody } from "@/backend/lib/http";
import { createProfile, getProfile, toClientUser, updateProfile } from "@/backend/services/profile";

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const profile = await getProfile(uid);
    return Response.json({ profile: toClientUser(profile) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const profile = await createProfile(uid, body);
    return Response.json({ profile: toClientUser(profile) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const profile = await updateProfile(uid, body);
    return Response.json({ profile: toClientUser(profile) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
