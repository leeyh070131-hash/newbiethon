// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
// Vercel Cron이 주기 호출한다 (vercel.json의 crons 설정 참고).
import { requireCronSecret } from "@/backend/lib/cron";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { flagDepartedPodsForExtension } from "@/backend/services/pods";

export async function GET(request: Request) {
  try {
    requireCronSecret(request);
    const flaggedCount = await flagDepartedPodsForExtension();
    return Response.json({ flaggedCount });
  } catch (error) {
    return toErrorResponse(error);
  }
}
