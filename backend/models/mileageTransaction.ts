import type { Timestamp } from "firebase-admin/firestore";

/**
 * coupon: 쿠폰 충전 (FR-15)
 * charge: 계좌송금 Mock 충전 (FR-16)
 * escrow_deduct: 팟 확정 시 에스크로로 차감 (FR-20)
 * escrow_payout: 팟 해지(정산) 시 호스트에게 지급 (FR-28)
 */
export type MileageTransactionType = "coupon" | "charge" | "escrow_deduct" | "escrow_payout";

/** users/{uid}/mileageTransactions/{id} 문서. 마일리지 잔액이 바뀔 때마다 함께 기록한다. */
export interface MileageTransactionDoc {
  id: string;
  type: MileageTransactionType;
  amount: number; // 잔액 변화량. 차감은 음수, 충전/지급은 양수.
  balanceAfter: number;
  podId: string | null; // escrow_deduct/escrow_payout일 때만 관련 팟 id
  createdAt: Timestamp;
}
