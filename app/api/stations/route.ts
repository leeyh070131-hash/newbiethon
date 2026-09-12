// 얇은 라우팅 셸. 실제 로직은 backend/services/stations.ts 에 있다.
import { listStations } from "@/backend/services/stations";

export async function GET() {
  const stations = await listStations();
  return Response.json({ stations });
}
