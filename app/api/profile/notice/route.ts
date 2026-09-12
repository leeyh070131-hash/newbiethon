// 얇은 라우팅 셸. 실제 로직은 backend/services/profile.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { dismissNotice, toClientUser } from "@/backend/services/profile";

/** 확인한 알림(예: 추방됨)을 지운다. 프론트가 팝업을 보여준 뒤 호출한다. */
export async function DELETE(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const profile = await dismissNotice(uid);
    return Response.json({ profile: toClientUser(profile) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
