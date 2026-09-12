import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import { ValidationError } from "../lib/http-errors";
import { haversineDistanceMeters, type LatLng } from "../lib/geo";
import { getProfile } from "./profile";
import { getStationById, getStationsByIds } from "./stations";
import type { PodDoc } from "../models/pod";

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
