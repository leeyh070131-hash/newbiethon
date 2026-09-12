import type { Timestamp } from "firebase-admin/firestore";

export type Gender = "male" | "female";

/** 본인이 확인하기 전까지 떠 있어야 하는 알림. 한 번에 하나만 보관한다(MVP 규모). */
export interface PendingNotice {
  type: "kicked"; // 호스트에게 추방당함
  podId: string;
  createdAt: Timestamp;
}

/** 일일 신고 횟수 제한 카운터. date는 "YYYY-MM-DD"(Asia/Seoul 기준) 문자열. */
export interface ReportQuota {
  date: string;
  count: number;
}

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
  pendingNotice: PendingNotice | null;
  reportQuota: ReportQuota | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
