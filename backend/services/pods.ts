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

export interface ClientPodParticipant {
  uid: string;
  name: string; // users 컬렉션에서 조회한 표시용 이름(공개 가능한 필드만). 계좌·마일리지 등은 노출하지 않는다.
  joinedAt: string;
  votedConfirm: boolean;
  votedExtend: boolean;
}

export interface ClientPod extends Omit<PodDoc, "participants" | "departureTime" | "createdAt" | "updatedAt"> {
  participants: ClientPodParticipant[];
  departureTime: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 응답 변환. (1) Firestore Timestamp를 ISO 8601 문자열로 바꾸고,
 * (2) 참가자 uid마다 표시용 이름을 붙인다(다른 사람의 계좌/잔액 등 민감 정보는 붙이지 않음).
 * 실제 데이터는 여전히 users 컬렉션이 단일 출처이며, 이 함수는 응답 시점에만 join한다.
 */
export async function toClientPod(pod: PodDoc): Promise<ClientPod> {
  const db = getAdminDb();
  const refs = pod.participantUids.map((uid) => db.collection(COLLECTIONS.users).doc(uid));
  const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
  const namesByUid = new Map(
    snapshots.map((snapshot) => [snapshot.id, snapshot.exists ? (snapshot.data() as UserDoc).name : "알 수 없음"])
  );

  return {
    ...pod,
    departureTime: pod.departureTime.toDate().toISOString(),
    createdAt: pod.createdAt.toDate().toISOString(),
    updatedAt: pod.updatedAt.toDate().toISOString(),
    participants: pod.participants.map((p) => ({
      uid: p.uid,
      name: namesByUid.get(p.uid) ?? "알 수 없음",
      joinedAt: p.joinedAt.toDate().toISOString(),
      votedConfirm: p.votedConfirm,
      votedExtend: p.votedExtend,
    })),
  };
}

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
    participants: [{ uid: hostUid, joinedAt: now, votedConfirm: false, votedExtend: false }],
    participantUids: [hostUid],
    escrowTotal: 0,
    awaitingExtension: false,
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
      participants: [...pod.participants, { uid, joinedAt: Timestamp.now(), votedConfirm: false, votedExtend: false }],
      participantUids: [...pod.participantUids, uid],
      updatedAt: Timestamp.now(),
    };
    tx.set(ref, updated);
    return updated;
  });
}

/** FR-27/FR-28/AC-11: 호스트가 확정된 팟을 해지하면 에스크로 전액이 호스트에게 지급된다. */
export async function closePod(uid: string, podId: string): Promise<PodDoc> {
  const db = getAdminDb();
  const podRef = db.collection(COLLECTIONS.pods).doc(podId);
  const hostUserRef = db.collection(COLLECTIONS.users).doc(uid);

  return db.runTransaction(async (tx) => {
    const [podSnapshot, hostSnapshot] = await Promise.all([tx.get(podRef), tx.get(hostUserRef)]);
    if (!podSnapshot.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
    const pod = podSnapshot.data() as PodDoc;

    if (uid !== pod.hostUid) {
      throw new ForbiddenError("호스트만 팟을 해지할 수 있습니다.");
    }
    if (pod.status !== "confirmed") {
      throw new ConflictError("확정된 팟만 해지할 수 있습니다.");
    }
    if (!hostSnapshot.exists) throw new NotFoundError("프로필이 아직 생성되지 않았습니다.");
    const host = hostSnapshot.data() as UserDoc;

    const now = Timestamp.now();
    tx.set(hostUserRef, { ...host, mileageBalance: host.mileageBalance + pod.escrowTotal, updatedAt: now });

    const updatedPod: PodDoc = { ...pod, status: "closed", updatedAt: now };
    tx.set(podRef, updatedPod);
    return updatedPod;
  });
}

/**
 * FR-29: 본인이 참가했던 팟 중 해지·폐지로 종료된 것들의 이력. 최신순.
 * participantUids로 array-contains 조회 후, status 필터는 인덱스 부담 없이 메모리에서 처리한다.
 */
export async function listHistory(uid: string): Promise<PodDoc[]> {
  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.pods)
    .where("participantUids", "array-contains", uid)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as PodDoc)
    .filter((pod) => pod.status === "closed" || pod.status === "dissolved")
    .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
}

/**
 * 본인이 참가 중인 팟(모집중/확정, 아직 종료 전) 목록. "내 팟" 화면에서 사용한다.
 * GET /api/pods(모집중인 전체 목록)는 확정된 팟을 빼버리기 때문에 별도로 필요하다.
 */
export async function listMyActivePods(uid: string): Promise<PodDoc[]> {
  const snapshot = await getAdminDb()
    .collection(COLLECTIONS.pods)
    .where("participantUids", "array-contains", uid)
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as PodDoc)
    .filter((pod) => pod.status === "recruiting" || pod.status === "confirmed")
    .sort((a, b) => a.departureTime.toMillis() - b.departureTime.toMillis());
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
        participantUids: pod.participantUids.filter((participantUid) => participantUid !== uid),
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

/**
 * FR-23: 출발시간에 도달했지만 아직 확정되지 않은 팟을 찾아 연장 동의 대상으로 표시한다.
 * 스케줄러(app/api/cron/check-departures)가 주기적으로 호출한다. status/awaitingExtension은
 * 단일 필드 조건이라 복합 인덱스 없이 조회하고, 출발시간 비교는 메모리에서 한다(MVP 규모 기준 충분).
 */
export async function flagDepartedPodsForExtension(): Promise<number> {
  const db = getAdminDb();
  const snapshot = await db.collection(COLLECTIONS.pods).where("status", "==", "recruiting").get();
  const now = Timestamp.now();

  const targets = snapshot.docs.filter((doc) => {
    const pod = doc.data() as PodDoc;
    return !pod.awaitingExtension && pod.departureTime.toMillis() <= now.toMillis();
  });
  if (targets.length === 0) return 0;

  const batch = db.batch();
  for (const doc of targets) {
    const pod = doc.data() as PodDoc;
    batch.update(doc.ref, {
      awaitingExtension: true,
      participants: pod.participants.map((p) => ({ ...p, votedExtend: false })),
      updatedAt: now,
    });
  }
  await batch.commit();
  return targets.length;
}

/**
 * FR-24~FR-26/AC-8/AC-9: 연장 동의 투표. 한 명이라도 거부하면 즉시 폐지(FR-25),
 * 전원 동의하면 출발시간을 30분 연장하고 다음 라운드를 위해 votedExtend를 초기화한다(FR-24).
 */
export async function voteExtend(uid: string, podId: string, agree: boolean): Promise<PodDoc> {
  const db = getAdminDb();
  const ref = db.collection(COLLECTIONS.pods).doc(podId);

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new NotFoundError("팟을 찾을 수 없습니다.");
    const pod = snapshot.data() as PodDoc;

    if (!pod.awaitingExtension) {
      throw new ConflictError("지금은 연장 동의 투표 대상이 아닙니다.");
    }
    if (!pod.participants.some((p) => p.uid === uid)) {
      throw new ValidationError("이 팟의 참가자가 아닙니다.");
    }

    const now = Timestamp.now();

    if (!agree) {
      // FR-25/AC-9: 한 명이라도 거부하면 즉시 폐지. 마일리지 차감 전이라 환불 처리도 없다(FR-26).
      const dissolved: PodDoc = { ...pod, status: "dissolved", awaitingExtension: false, updatedAt: now };
      tx.set(ref, dissolved);
      return dissolved;
    }

    const updatedParticipants = pod.participants.map((p) => (p.uid === uid ? { ...p, votedExtend: true } : p));
    const allAgreed = updatedParticipants.every((p) => p.votedExtend);

    const updated: PodDoc = allAgreed
      ? {
          // FR-24/AC-8: 전원 동의 → 30분 연장, 다음 라운드를 위해 연장 투표 상태 초기화
          ...pod,
          departureTime: Timestamp.fromMillis(pod.departureTime.toMillis() + 30 * 60 * 1000),
          awaitingExtension: false,
          participants: updatedParticipants.map((p) => ({ ...p, votedExtend: false })),
          updatedAt: now,
        }
      : { ...pod, participants: updatedParticipants, updatedAt: now };

    tx.set(ref, updated);
    return updated;
  });
}
