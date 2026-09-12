export type StationType = "bus" | "subway";

/**
 * stations/{id} 문서.
 * FR-5/FR-6: 성북구 내 버스정류장·지하철역 목록. 팟의 출발지/도착지는 이 목록 중에서만 선택 가능하다.
 */
export interface StationDoc {
  id: string;
  name: string;
  type: StationType;
  district: string; // MVP 범위: "성북구" 고정
  lat: number;
  lng: number;
}
