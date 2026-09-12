export interface LatLng {
  lat: number;
  lng: number;
}

/** 두 좌표 사이 거리(미터). FR-14: 메인화면 정렬(가장 가까운 출발지 기준)에 사용. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
