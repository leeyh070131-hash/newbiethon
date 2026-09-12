// 얇은 라우팅 셸. 실제 로직은 backend/services/mileage.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { getMileageBalance } from "@/backend/services/mileage";

export async function GET(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const mileageBalance = await getMileageBalance(uid);
    return Response.json({ mileageBalance });
  } catch (error) {
    return toErrorResponse(error);
  }
}
