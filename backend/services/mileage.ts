import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import { NotFoundError, ValidationError } from "../lib/http-errors";
import { getProfile } from "./profile";
import type { UserDoc } from "../models/user";

const COUPON_CODE = "피크닉";
const COUPON_AMOUNT = 50000;

/**
 * 잔액을 증감시키는 공통 트랜잭션. 프로필이 없으면 NotFoundError.
 * delta가 음수여도(향후 확정 시 차감 등에 재사용 가능하도록) 동작하지만,
 * Phase 1-E에서는 항상 양수(쿠폰/충전)로만 호출한다.
 */
async function applyMileageDelta(uid: string, delta: number): Promise<UserDoc> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.users).doc(uid);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      throw new NotFoundError("프로필이 아직 생성되지 않았습니다. POST /api/profile로 먼저 생성하세요.");
    }
    const user = snapshot.data() as UserDoc;
    const updated: UserDoc = {
      ...user,
      mileageBalance: user.mileageBalance + delta,
      updatedAt: Timestamp.now(),
    };
    tx.set(ref, updated);
    return updated;
  });
}

/** FR-15/AC-12: 쿠폰 코드 "피크닉" 입력 시 50,000 마일리지 충전. 횟수 제한 없음. */
export async function redeemCoupon(uid: string, input: Record<string, unknown>): Promise<UserDoc> {
  const { code } = input;
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new ValidationError("code는 필수입니다.");
  }
  if (code !== COUPON_CODE) {
    throw new ValidationError("유효하지 않은 쿠폰 코드입니다.");
  }
  return applyMileageDelta(uid, COUPON_AMOUNT);
}

/** FR-16: 계좌 송금 Mock 충전. 실제 은행/PG 연동 없이 입력한 금액만큼 즉시 충전된다. */
export async function chargeMileage(uid: string, input: Record<string, unknown>): Promise<UserDoc> {
  const { amount } = input;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError("amount는 0보다 큰 정수여야 합니다.");
  }
  return applyMileageDelta(uid, amount);
}

/** FR-17: 마일리지 잔액 조회. */
export async function getMileageBalance(uid: string): Promise<number> {
  const profile = await getProfile(uid);
  return profile.mileageBalance;
}
