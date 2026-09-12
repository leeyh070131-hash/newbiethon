// 얇은 라우팅 셸. 실제 로직은 backend/services/reports.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse, ValidationError } from "@/backend/lib/http-errors";
import { parseJsonBody } from "@/backend/lib/http";
import { reportUser } from "@/backend/services/reports";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(request);
    const { id } = await params;
    const body = await parseJsonBody(request);
    if (typeof body.targetUid !== "string" || body.targetUid.trim().length === 0) {
      throw new ValidationError("targetUid(string)는 필수입니다.");
    }
    if (typeof body.reason !== "string") {
      throw new ValidationError("reason(string)는 필수입니다.");
    }
    await reportUser(uid, id, body.targetUid, body.reason);
    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
