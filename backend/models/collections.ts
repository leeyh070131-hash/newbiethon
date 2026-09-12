/** Firestore 컬렉션 이름 상수. 오타로 인한 컬렉션 분기를 막기 위해 문자열 리터럴 대신 이 상수를 사용한다. */
export const COLLECTIONS = {
  users: "users",
  stations: "stations",
  pods: "pods",
} as const;
