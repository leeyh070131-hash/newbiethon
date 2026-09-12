/**
 * 성북구 정류장/역 데이터를 Firestore stations 컬렉션에 시딩한다. (FR-5)
 * 실행: npm run seed:stations
 *
 * 현재는 지하철역만 채운다. 버스정류장은 공공데이터포털 API 키가 준비되면 추가한다.
 * (backend/data/README.md 참고)
 */
import subwayStations from "../data/seongbuk-subway-stations.json";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import type { StationDoc } from "../models/station";

async function main() {
  const db = getAdminDb();
  const stations = subwayStations as StationDoc[];

  const batch = db.batch();
  for (const station of stations) {
    const ref = db.collection(COLLECTIONS.stations).doc(station.id);
    batch.set(ref, station);
  }
  await batch.commit();

  console.log(`${stations.length}개 지하철역 시딩 완료.`);
}

main().catch((error) => {
  console.error("시딩 실패:", error);
  process.exit(1);
});
