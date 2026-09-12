import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import {
  ConflictError,
  ForbiddenError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from "../lib/http-errors";
import { haversineDistanceMeters, type LatLng } from "../lib/geo";
import { getProfile } from "./profile";
import { getStationById, getStationsByIds } from "./stations";
import type { PodDoc } from "../models/pod";
import type { UserDoc } from "../models/user";

export interface CreatePodInput {
  departureStationId: string;
  arrivalStationId: string;
  departureTime: string; // ISO 8601
  maxParticipants: number;
  minParticipants: number;
  pricePerPerson: number;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function validateCreatePodInput(input: Record<string, unknown>): Promise<CreatePodInput> {
  const { departureStationId, arrivalStationId, departureTime, maxParticipants, minParticipants, pricePerPerson } =
    input;

  if (typeof departureStationId !== "string" || departureStationId.trim().length === 0) {
    throw new ValidationError("departureStationId는 필수입니다.");
  }
  if (typeof arrivalStationId !== "string" || arrivalStationId.trim().length === 0) {
    throw new ValidationError("arrivalStationId는 필수입니다.");
  }
  if (departureStationId === arrivalStationId) {
    throw new ValidationError("출발지와 도착지는 서로 달라야 합니다.");
  }
  if (typeof departureTime !== "string" || Number.isNaN(Date.parse(departureTime))) {
    throw new ValidationError("departureTime은 유효한 날짜/시간 문자열이어야 합니다.");
  }
  if (!isPositiveInteger(maxParticipants)) {
    throw new ValidationError("maxParticipants(모집인원)는 1 이상의 정수여야 합니다.");
  }
  if (!isPositiveInteger(minParticipants)) {
    throw new ValidationError("minParticipants(참여최소인원)는 1 이상의 정수여야 합니다.");
  }
  if (minParticipants > maxParticipants) {
    // FR-10 / AC-2
    throw new ValidationError("참여최소인원은 모집인원(최대 정원)보다 클 수 없습니다.");
  }
  if (!isPositiveNumber(pricePerPerson)) {
    throw new ValidationError("pricePerPerson(인당예상가격)은 0보다 큰 숫자여야 합니다.");
  }

  // FR-6: 출발지/도착지는 실제 등록된 정류장/역 중에서만 선택 가능
  const [departureStation, arrivalStation] = await Promise.all([
    getStationById(departureStationId),
    getStationById(arrivalStationId),
  ]);
  if (!departureStation) throw new ValidationError("departureStationId에 해당하는 정류장/역이 없습니다.");
  if (!arrivalStation) throw new ValidationError("arrivalStationId에 해당하는 정류장/역이 없습니다.");

  return {
    departureStationId,
    arrivalStationId,
    departureTime,
    maxParticipants,
    minParticipants,
    pricePerPerson,
  };
}

/** FR-7~FR-10: 팟 생성. 생성자가 호스트가 되고, 참가 가능 성별은 호스트 등록 성별로 자동 고정된다. */
export async function createPod(hostUid: string, input: Record<string, unknown>): Promise<PodDoc> {
  const validated = await validateCreatePodInput(input);
  const hostProfile = await getProfile(hostUid); // 프로필 없으면 NotFoundError(404)로 전파됨

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.pods).doc();
  const now = Timestamp.now();

  const pod: PodDoc = {
    id: ref.id,
    hostUid,
    gender: hostProfile.gender, // FR-9
    departureStationId: validated.departureStationId,
    arrivalStationId: validated.arrivalStationId,
    departureTime: Timestamp.fromDate(new Date(validated.departureTime)),
    maxParticipants: validated.maxParticipants,
    minParticipants: validated.minParticipants,
    pricePerPerson: validated.pricePerPerson,
    status: "recruiting",
    participants: [{ uid: hostUid, joinedAt: now, votedConfirm: false }],
    escrowTotal: 0,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(pod);
  return pod;
}

/**
 * FR-14/FR-14a: 모집 중인 팟 목록. lat/lng가 주어지면 출발지 정류장과의 거리순,
 * 아니면 최신 생성순으로 정렬한다.
 */
export async function listPods(location?: LatLng): Promise<PodDoc[]> {
  const db = getAdminDb();

  if (!location) {
    const snapshot = await db
      .collection(COLLECTIONS.pods)
      .where("status", "==", "recruiting")
      .orderBy("createdAt", "desc")
      .get();
    return snapshot.docs.map((doc) => doc.data() as PodDoc);
  }

  // 거리 정렬은 Firestore 쿼리로 표현할 수 없어, 모집 중인 팟을 모두 읽어 메모리에서 정렬한다.
  // MVP(성북구 한정) 규모에서는 이 정도 전체 스캔이면 충분하다.
  const snapshot = await db.collection(COLLECTIONS.pods).where("status", "==", "recruiting").get();
  const pods = snapshot.docs.map((doc) => doc.data() as PodDoc);

  const stationMap = await getStationsByIds(pods.map((pod) => pod.departureStationId));

  return pods
    .map((pod) => {
      const station = stationMap.get(pod.departureStationId);
      const distance = station ? haversineDistanceMeters(location, station) : Number.POSITIVE_INFINITY;
      return { pod, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .map(({ pod }) => pod);
}

/** FR-11/FR-12/AC-3/AC-4: 동성만, 정원 마감 전까지만 참가 가능. 동시 참가로 정원 초과가 나지 않도록 트랜잭션으로 처리한다. */
export async function joinPod(uid: string, podId: string): Promise<PodDoc> {
  const profile = await getProfile(uid); // 프로필 없으면 404로 전파

  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.pods).doc(podId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
    const pod = snapshot.data() as PodDoc;

    if (pod.status !== "recruiting") {
      throw new ConflictError("이미 마감되었거나 확정된 팟입니다.");
    }
    if (pod.gender !== profile.gender) {
      // FR-11/AC-3: 동성 팟만 참가 가능
      throw new ForbiddenError("이 팟은 참가자와 등록 성별이 다릅니다.");
    }
    if (pod.participants.some((p) => p.uid === uid)) {
      throw new ConflictError("이미 참가한 팟입니다.");
    }
    if (pod.participants.length >= pod.maxParticipants) {
      // FR-12/AC-4
      throw new ConflictError("모집 마감된 팟입니다.");
    }

    const updated: PodDoc = {
      ...pod,
      participants: [...pod.participants, { uid, joinedAt: Timestamp.now(), votedConfirm: false }],
      updatedAt: Timestamp.now(),
    };
    tx.set(ref, updated);
    return updated;
  });
}

export async function getPodById(podId: string): Promise<PodDoc> {
  const doc = await getAdminDb().collection(COLLECTIONS.pods).doc(podId).get();
  if (!doc.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
  return doc.data() as PodDoc;
}

/**
 * FR-13/FR-13a/AC-5/AC-5a: 확정 전(status === "recruiting")에만 탈퇴 가능.
 * 호스트가 탈퇴하면 팟 전체가 자동 폐지된다(마일리지 차감 전 상태라 환불 처리는 불필요).
 */
export async function leavePod(uid: string, podId: string): Promise<PodDoc> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.pods).doc(podId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
    const pod = snapshot.data() as PodDoc;

    if (pod.status !== "recruiting") {
      throw new ConflictError("이미 확정되었거나 종료된 팟은 탈퇴할 수 없습니다.");
    }
    if (!pod.participants.some((p) => p.uid === uid)) {
      throw new ValidationError("이 팟의 참가자가 아닙니다.");
    }

    let updated: PodDoc;
    if (uid === pod.hostUid) {
      // FR-13a: 호스트 탈퇴 → 팟 자동 폐지. 참가자 목록은 기록으로 남긴다(FR-29 대비).
      updated = { ...pod, status: "dissolved", updatedAt: Timestamp.now() };
    } else {
      updated = {
        ...pod,
        participants: pod.participants.filter((p) => p.uid !== uid),
        updatedAt: Timestamp.now(),
      };
    }
    tx.set(ref, updated);
    return updated;
  });
}

/**
 * FR-18~FR-22/AC-5b/AC-6/AC-7: 확정 투표. 호출한 본인의 동의만 기록하며, 그 결과
 * 참가자 전원이 동의한 상태가 되면 그 자리에서 팟을 확정하고 전원의 마일리지를
 * 에스크로로 차감한다.
 */
export async function voteConfirm(uid: string, podId: string): Promise<PodDoc> {
  const db = getAdminDb();
  const podRef = db.collection(COLLECTIONS.pods).doc(podId);
  const userRef = db.collection(COLLECTIONS.users).doc(uid);

  return db.runTransaction(async (tx) => {
    const [podSnapshot, userSnapshot] = await Promise.all([tx.get(podRef), tx.get(userRef)]);
    if (!podSnapshot.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
    if (!userSnapshot.exists) throw new NotFoundError("프로필이 아직 생성되지 않았습니다.");

    const pod = podSnapshot.data() as PodDoc;
    const user = userSnapshot.data() as UserDoc;

    if (pod.status !== "recruiting") {
      throw new ConflictError("이미 확정되었거나 종료된 팟입니다.");
    }
    if (!pod.participants.some((p) => p.uid === uid)) {
      throw new ValidationError("이 팟의 참가자가 아닙니다.");
    }
    if (pod.participants.length < pod.minParticipants) {
      // FR-18: 참여최소인원 도달 전에는 투표 자체가 열리지 않는다.
      throw new ConflictError("아직 참여최소인원에 도달하지 않아 투표할 수 없습니다.");
    }
    if (user.mileageBalance < pod.pricePerPerson) {
      // FR-19a/AC-5b
      throw new InsufficientFundsError("마일리지 잔액이 부족합니다. 충전 후 다시 시도하세요.");
    }

    const updatedParticipants = pod.participants.map((p) => (p.uid === uid ? { ...p, votedConfirm: true } : p));
    const allConfirmed = updatedParticipants.every((p) => p.votedConfirm);

    if (!allConfirmed) {
      // FR-21/AC-7: 전원 동의 전까지는 "확정 대기" 상태로 투표 화면을 계속 연다.
      const updated: PodDoc = { ...pod, participants: updatedParticipants, updatedAt: Timestamp.now() };
      tx.set(podRef, updated);
      return updated;
    }

    // 마지막 동의 — 확정 처리 전에 본인 외 참가자들의 잔액도 다시 한 번 확인한다.
    // (각자 투표 시점엔 충분했더라도 그 사이 다른 팟 확정 등으로 잔액이 바뀌었을 수 있다.)
    const otherUids = updatedParticipants.map((p) => p.uid).filter((participantUid) => participantUid !== uid);
    const otherUserRefs = otherUids.map((participantUid) => db.collection(COLLECTIONS.users).doc(participantUid));
    const otherUserSnapshots =
      otherUserRefs.length > 0 ? await Promise.all(otherUserRefs.map((ref) => tx.get(ref))) : [];

    for (const snapshot of otherUserSnapshots) {
      if (!snapshot.exists || (snapshot.data() as UserDoc).mileageBalance < pod.pricePerPerson) {
        throw new ConflictError("다른 참가자의 마일리지 잔액이 부족해 지금은 확정할 수 없습니다.");
      }
    }

    // FR-20: 확정과 동시에 전원의 마일리지를 인당예상가격만큼 차감해 에스크로로 옮긴다.
    const now = Timestamp.now();
    tx.set(userRef, { ...user, mileageBalance: user.mileageBalance - pod.pricePerPerson, updatedAt: now });
    otherUserSnapshots.forEach((snapshot, index) => {
      const otherUser = snapshot.data() as UserDoc;
      tx.set(otherUserRefs[index], {
        ...otherUser,
        mileageBalance: otherUser.mileageBalance - pod.pricePerPerson,
        updatedAt: now,
      });
    });

    const updatedPod: PodDoc = {
      ...pod,
      participants: updatedParticipants,
      status: "confirmed",
      escrowTotal: pod.pricePerPerson * updatedParticipants.length,
      updatedAt: now,
    };
    tx.set(podRef, updatedPod);
    return updatedPod;
  });
}
