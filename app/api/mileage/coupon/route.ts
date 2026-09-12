// 얇은 라우팅 셸. 실제 로직은 backend/services/mileage.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { parseJsonBody } from "@/backend/lib/http";
import { redeemCoupon } from "@/backend/services/mileage";

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const profile = await redeemCoupon(uid, body);
    return Response.json({ mileageBalance: profile.mileageBalance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
