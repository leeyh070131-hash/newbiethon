import { Timestamp, type Transaction } from "firebase-admin/firestore";
import { COLLECTIONS, userMileageTransactionsPath } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import { NotFoundError, ValidationError } from "../lib/http-errors";
import { getProfile } from "./profile";
import type { UserDoc } from "../models/user";
import type { MileageTransactionDoc, MileageTransactionType } from "../models/mileageTransaction";

const COUPON_CODE = "피크닉";
const COUPON_AMOUNT = 50000;

/**
 * 마일리지 잔액이 바뀌는 모든 지점(쿠폰/충전/에스크로 차감/정산 지급)에서 함께 호출해
 * users/{uid}/mileageTransactions에 내역을 남긴다. 잔액 변경과 같은 Firestore
 * 트랜잭션 안에서 호출해야 원자적으로 기록된다 — 이 함수 자체는 그 tx에 기록만 추가한다.
 */
export function recordMileageTransaction(
  tx: Transaction,
  uid: string,
  entry: { type: MileageTransactionType; amount: number; balanceAfter: number; podId?: string | null }
): void {
  const ref = getAdminDb().collection(userMileageTransactionsPath(uid)).doc();
  const doc: MileageTransactionDoc = {
    id: ref.id,
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    podId: entry.podId ?? null,
    createdAt: Timestamp.now(),
  };
  tx.set(ref, doc);
}

/**
 * 잔액을 증감시키는 공통 트랜잭션. 프로필이 없으면 NotFoundError.
 * 증감과 함께 마일리지 거래 내역도 기록한다.
 */
async function applyMileageDelta(uid: string, delta: number, type: MileageTransactionType): Promise<UserDoc> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.users).doc(uid);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) {
      throw new NotFoundError("프로필이 아직 생성되지 않았습니다. POST /api/profile로 먼저 생성하세요.");
    }
    const user = snapshot.data() as UserDoc;
    const newBalance = user.mileageBalance + delta;
    const updated: UserDoc = { ...user, mileageBalance: newBalance, updatedAt: Timestamp.now() };
    tx.set(ref, updated);
    recordMileageTransaction(tx, uid, { type, amount: delta, balanceAfter: newBalance });
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
  return applyMileageDelta(uid, COUPON_AMOUNT, "coupon");
}

/** FR-16: 계좌 송금 Mock 충전. 실제 은행/PG 연동 없이 입력한 금액만큼 즉시 충전된다. */
export async function chargeMileage(uid: string, input: Record<string, unknown>): Promise<UserDoc> {
  const { amount } = input;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError("amount는 0보다 큰 정수여야 합니다.");
  }
  return applyMileageDelta(uid, amount, "charge");
}

/** FR-17: 마일리지 잔액 조회. */
export async function getMileageBalance(uid: string): Promise<number> {
  const profile = await getProfile(uid);
  return profile.mileageBalance;
}

/** 마일리지 사용 내역(충전/차감/지급) 최신순 조회. */
export async function listMileageTransactions(uid: string): Promise<MileageTransactionDoc[]> {
  const snapshot = await getAdminDb()
    .collection(userMileageTransactionsPath(uid))
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => doc.data() as MileageTransactionDoc);
}

export interface ClientMileageTransaction extends Omit<MileageTransactionDoc, "createdAt"> {
  createdAt: string;
}

/** API 응답 변환: Firestore Timestamp를 ISO 8601 문자열로 바꾼다. */
export function toClientTransaction(t: MileageTransactionDoc): ClientMileageTransaction {
  return { ...t, createdAt: t.createdAt.toDate().toISOString() };
}
