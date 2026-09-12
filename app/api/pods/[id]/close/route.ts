// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { closePod } from "@/backend/services/pods";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { uid } = await requireAuth(request);
    const { id } = await params;
    const pod = await closePod(uid, id);
    return Response.json({ pod });
  } catch (error) {
    return toErrorResponse(error);
  }
}
