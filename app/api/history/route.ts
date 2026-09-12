// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { listHistory } from "@/backend/services/pods";

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const pods = await listHistory(uid);
    return Response.json({ pods });
  } catch (error) {
    return toErrorResponse(error);
  }
}
