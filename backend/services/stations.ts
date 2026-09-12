import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import type { StationDoc } from "../models/station";

/** FR-5/FR-6: 성북구 정류장/역 전체 목록을 반환한다. */
export async function listStations(): Promise<StationDoc[]> {
  const snapshot = await getAdminDb().collection(COLLECTIONS.stations).get();
  return snapshot.docs.map((doc) => doc.data() as StationDoc);
}

/** id로 정류장/역 문서를 조회한다. 없으면 null. FR-6 검증(팟 생성 시 실존 정류장인지)에 사용. */
export async function getStationById(id: string): Promise<StationDoc | null> {
  const doc = await getAdminDb().collection(COLLECTIONS.stations).doc(id).get();
  return doc.exists ? (doc.data() as StationDoc) : null;
}

/** 중복 제거된 id 목록에 대해 배치로 정류장 문서를 조회해 id -> StationDoc 맵으로 반환한다. */
export async function getStationsByIds(ids: string[]): Promise<Map<string, StationDoc>> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return new Map();

  const db = getAdminDb();
  const refs = uniqueIds.map((id) => db.collection(COLLECTIONS.stations).doc(id));
  const docs = await db.getAll(...refs);

  const map = new Map<string, StationDoc>();
  for (const doc of docs) {
    if (doc.exists) map.set(doc.id, doc.data() as StationDoc);
  }
  return map;
}
