/** Firestore 컬렉션 이름 상수. 오타로 인한 컬렉션 분기를 막기 위해 문자열 리터럴 대신 이 상수를 사용한다. */
export const COLLECTIONS = {
  users: "users",
  stations: "stations",
  pods: "pods",
} as const;

/** users/{uid} 아래의 마일리지 거래 내역 서브컬렉션 경로. */
export function userMileageTransactionsPath(uid: string): string {
  return `${COLLECTIONS.users}/${uid}/mileageTransactions`;
}
