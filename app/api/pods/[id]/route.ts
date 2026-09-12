// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { getPodById, toClientPod } from "@/backend/services/pods";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const pod = await getPodById(id);
    return Response.json({ pod: await toClientPod(pod) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
