// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { listMyActivePods, toClientPod } from "@/backend/services/pods";

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const pods = await listMyActivePods(uid);
    return Response.json({ pods: await Promise.all(pods.map(toClientPod)) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
