// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse, ValidationError } from "@/backend/lib/http-errors";
import { parseJsonBody } from "@/backend/lib/http";
import { voteExtend } from "@/backend/services/pods";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(request);
    const { id } = await params;
    const body = await parseJsonBody(request);
    if (typeof body.agree !== "boolean") {
      throw new ValidationError("agree(boolean)는 필수입니다.");
    }
    const pod = await voteExtend(uid, id, body.agree);
    return Response.json({ pod });
  } catch (error) {
    return toErrorResponse(error);
  }
}
