// 얇은 라우팅 셸. 실제 로직은 backend/services/pods.ts 에 있다.
import { requireAuth } from "@/backend/lib/auth";
import { toErrorResponse } from "@/backend/lib/http-errors";
import { parseJsonBody } from "@/backend/lib/http";
import { createPod, listPods, toClientPod } from "@/backend/services/pods";
import type { LatLng } from "@/backend/lib/geo";

/** ?lat=..&lng=.. 둘 다 유효한 숫자로 있을 때만 위치로 취급하고, 아니면 위치 없음(최신순 정렬)으로 처리한다. */
function parseLocation(request: Request): LatLng | undefined {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return undefined;
}

export async function GET(request: Request) {
  try {
    await requireAuth(request);
    const location = parseLocation(request);
    const pods = await listPods(location);
    return Response.json({ pods: await Promise.all(pods.map(toClientPod)) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { uid } = await requireAuth(request);
    const body = await parseJsonBody(request);
    const pod = await createPod(uid, body);
    return Response.json({ pod: await toClientPod(pod) }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
