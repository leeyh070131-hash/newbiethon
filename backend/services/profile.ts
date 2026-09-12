import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import { ConflictError, NotFoundError, ValidationError } from "../lib/http-errors";
import type { Gender, UserDoc } from "../models/user";

const VALID_GENDERS: Gender[] = ["male", "female"];

export interface ProfileInput {
  name: string;
  gender: Gender;
  bankAccount: string;
}

/**
 * requireAll=true(생성)면 세 필드 모두 필수, false(수정)면 body에 있는 필드만 검증한다.
 * 검증되지 않은 요청 body(Record<string, unknown>)를 다루므로 이 함수 통과 후에만
 * 필드를 ProfileInput 타입으로 취급한다.
 */
function validateProfileInput(input: Record<string, unknown>, requireAll: boolean) {
  const hasName = input.name !== undefined;
  const hasGender = input.gender !== undefined;
  const hasBankAccount = input.bankAccount !== undefined;

  if (requireAll && !(hasName && hasGender && hasBankAccount)) {
    throw new ValidationError("name, gender, bankAccount는 모두 필수입니다.");
  }

  if (hasName && (typeof input.name !== "string" || input.name.trim().length === 0)) {
    throw new ValidationError("name은 빈 문자열일 수 없습니다.");
  }
  if (hasGender && !VALID_GENDERS.includes(input.gender as Gender)) {
    throw new ValidationError('gender는 "male" 또는 "female"이어야 합니다.');
  }
  if (hasBankAccount && (typeof input.bankAccount !== "string" || input.bankAccount.trim().length === 0)) {
    throw new ValidationError("bankAccount는 빈 문자열일 수 없습니다.");
  }
}

/** FR-2: 최초 로그인 시 프로필 생성. 이미 존재하면 거부한다 (수정은 updateProfile을 쓴다). */
export async function createProfile(uid: string, input: Record<string, unknown>): Promise<UserDoc> {
  validateProfileInput(input, true);
  const { name, gender, bankAccount } = input as unknown as ProfileInput;

  const ref = getAdminDb().collection(COLLECTIONS.users).doc(uid);
  const existing = await ref.get();
  if (existing.exists) {
    throw new ConflictError("이미 프로필이 존재합니다. 수정은 PATCH /api/profile을 사용하세요.");
  }

  const now = Timestamp.now();
  const doc: UserDoc = {
    uid,
    name: name.trim(),
    gender,
    bankAccount: bankAccount.trim(),
    mileageBalance: 0,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(doc);
  return doc;
}

export async function getProfile(uid: string): Promise<UserDoc> {
  const doc = await getAdminDb().collection(COLLECTIONS.users).doc(uid).get();
  if (!doc.exists) {
    throw new NotFoundError("프로필이 아직 생성되지 않았습니다.");
  }
  return doc.data() as UserDoc;
}

/**
 * FR-3/FR-4: 본인만 호출 가능한 이 경로를 통해서만 bankAccount가 바뀐다.
 * name/gender는 최초 인증(createProfile) 이후 영구히 고정되며 이 경로로도 바꿀 수 없다.
 * 그 외 어떤 백엔드 로직도 이 필드들을 건드리지 않는다.
 */
export async function updateProfile(uid: string, input: Record<string, unknown>): Promise<UserDoc> {
  if (Object.keys(input).length === 0) {
    throw new ValidationError("수정할 필드가 없습니다.");
  }
  if (input.name !== undefined || input.gender !== undefined) {
    throw new ValidationError("이름과 성별은 최초 인증 후에는 변경할 수 없습니다.");
  }
  validateProfileInput(input, false);
  const { bankAccount } = input as Partial<ProfileInput>;

  const ref = getAdminDb().collection(COLLECTIONS.users).doc(uid);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new NotFoundError("프로필이 아직 생성되지 않았습니다. POST /api/profile로 먼저 생성하세요.");
  }

  const updates: Partial<UserDoc> = { updatedAt: Timestamp.now() };
  if (bankAccount !== undefined) updates.bankAccount = bankAccount.trim();

  await ref.update(updates);
  return { ...(existing.data() as UserDoc), ...updates };
}

export interface ClientUser extends Omit<UserDoc, "createdAt" | "updatedAt"> {
  createdAt: string;
  updatedAt: string;
}

/** API 응답 변환: Firestore Timestamp를 ISO 8601 문자열로 바꾼다. */
export function toClientUser(user: UserDoc): ClientUser {
  return { ...user, createdAt: user.createdAt.toDate().toISOString(), updatedAt: user.updatedAt.toDate().toISOString() };
}
