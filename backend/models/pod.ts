import type { Timestamp } from "firebase-admin/firestore";
import type { Gender } from "./user";

/**
 * 팟 상태.
 * recruiting: 모집 중 (확정 전)
 * confirmed: 전원 동의로 확정, 에스크로 보관 중 (FR-19~FR-22)
 * dissolved: 폐지 — 최소인원 미달 상태로 출발시간 임박 연장에 실패했거나(FR-25), 호스트가 확정 전 탈퇴(FR-13a)
 * closed: 해지 — 호스트가 택시 이용 완료 후 정산 (FR-27~FR-29)
 */
export type PodStatus = "recruiting" | "confirmed" | "dissolved" | "closed";

export interface PodParticipant {
  uid: string;
  joinedAt: Timestamp;
  votedConfirm: boolean; // FR-18~FR-19: 확정 투표 동의 여부
  votedExtend: boolean; // FR-23~FR-24: 출발시간 임박 시 연장 동의 여부 (awaitingExtension이 true일 때만 의미 있음)
}

/**
 * pods/{id} 문서.
 */
export interface PodDoc {
  id: string;
  hostUid: string;
  gender: Gender; // FR-9: 호스트의 등록 성별과 자동으로 동일
  departureStationId: string;
  arrivalStationId: string;
  departureTime: Timestamp;
  maxParticipants: number; // 모집인원(최대 정원), FR-12
  minParticipants: number; // 참여최소인원, FR-10: maxParticipants보다 클 수 없음
  pricePerPerson: number; // 인당예상가격
  status: PodStatus;
  participants: PodParticipant[];
  // participants의 uid만 뽑아 동기화해둔 배열. Firestore는 객체 배열 안의 필드로
  // 직접 쿼리할 수 없어서, "이 uid가 참가자인 팟 목록"(FR-29 이력 조회)을
  // array-contains로 조회하기 위한 용도로만 존재한다. participants 갱신 시 항상 함께 갱신한다.
  participantUids: string[];
  escrowTotal: number; // FR-20: 확정 시 차감된 마일리지 합계 보관
  awaitingExtension: boolean; // FR-23: 출발시간 도달 & 미확정 상태 → 연장 동의 팝업 대상인지
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
