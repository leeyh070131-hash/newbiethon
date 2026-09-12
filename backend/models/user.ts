import type { Timestamp } from "firebase-admin/firestore";

export type Gender = "male" | "female";

/**
 * users/{uid} 문서.
 * name/gender/bankAccount는 FR-3에 따라 본인이 직접 수정(PATCH /api/profile)하지 않는 한 절대 변경되지 않는다.
 */
export interface UserDoc {
  uid: string;
  name: string;
  gender: Gender;
  bankAccount: string;
  mileageBalance: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
