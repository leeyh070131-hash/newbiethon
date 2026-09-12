import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import type { StationDoc } from "../models/station";

/** FR-5/FR-6: 성북구 정류장/역 전체 목록을 반환한다. */
export async function listStations(): Promise<StationDoc[]> {
  const snapshot = await getAdminDb().collection(COLLECTIONS.stations).get();
  return snapshot.docs.map((doc) => doc.data() as StationDoc);
}
