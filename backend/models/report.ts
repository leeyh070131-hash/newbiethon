import type { Timestamp } from "firebase-admin/firestore";

/**
 * reports/{id} 문서. 신고 접수 기록. 일일 3회 제한(신고자 기준)은
 * users/{uid}.reportQuota로 별도 관리하고, 이 문서는 로그 용도다.
 */
export interface ReportDoc {
  id: string;
  podId: string;
  reporterUid: string;
  reportedUid: string;
  reason: string;
  createdAt: Timestamp;
}
