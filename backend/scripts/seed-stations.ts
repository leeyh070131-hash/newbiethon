/**
 * 성북구 정류장/역 데이터를 Firestore stations 컬렉션에 시딩한다. (FR-5)
 * 실행: npm run seed:stations
 *
 * 지하철역은 실제 역 목록(좌표는 근사값). 버스정류장은 공공데이터 API 키가
 * 없어 임시 플레이스홀더를 사용한다 — 공식 데이터가 아니다.
 * (backend/data/README.md 참고, 키 확보 시 placeholder 파일을 통째로 교체)
 */
import subwayStations from "../data/seongbuk-subway-stations.json";
import busStopsPlaceholder from "../data/seongbuk-bus-stops-placeholder.json";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import type { StationDoc } from "../models/station";

async function main() {
  const db = getAdminDb();
  const stations = [...subwayStations, ...busStopsPlaceholder] as StationDoc[];

  const batch = db.batch();
  for (const station of stations) {
    const ref = db.collection(COLLECTIONS.stations).doc(station.id);
    batch.set(ref, station);
  }
  await batch.commit();

  console.log(
    `${stations.length}개 정류장/역 시딩 완료 (지하철 ${subwayStations.length}, 버스 플레이스홀더 ${busStopsPlaceholder.length}).`
  );
}

main().catch((error) => {
  console.error("시딩 실패:", error);
  process.exit(1);
});
