// 실제 백엔드(app/api/**)를 호출하는 클라이언트. 타입은 backend/의 응답 변환 함수에서
// 그대로 가져와(타입만 — 런타임 코드는 번들에 포함되지 않는다) 프론트/백엔드 타입이 어긋나지 않게 한다.
import type { ClientPod } from "@/backend/services/pods";
import type { ClientUser } from "@/backend/services/profile";
import type { ClientMileageTransaction } from "@/backend/services/mileage";
import type { StationDoc } from "@/backend/models/station";
import { getIdToken } from "./firebase";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  if (!token) throw new ApiError(401, "먼저 로그인해 주세요.");

  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  }
  return data as T;
}

export async function getStations(): Promise<StationDoc[]> {
  const res = await fetch("/api/stations");
  const data = await res.json();
  return data.stations;
}

export async function getProfile(): Promise<ClientUser> {
  return (await request<{ profile: ClientUser }>("/api/profile")).profile;
}
export async function createProfile(input: {
  name: string;
  gender: "male" | "female";
  bankAccount: string;
}): Promise<ClientUser> {
  return (await request<{ profile: ClientUser }>("/api/profile", { method: "POST", body: JSON.stringify(input) }))
    .profile;
}
export async function updateProfile(input: Partial<{ name: string; gender: "male" | "female"; bankAccount: string }>): Promise<ClientUser> {
  return (await request<{ profile: ClientUser }>("/api/profile", { method: "PATCH", body: JSON.stringify(input) }))
    .profile;
}
export async function dismissNotice(): Promise<ClientUser> {
  return (await request<{ profile: ClientUser }>("/api/profile/notice", { method: "DELETE" })).profile;
}

export async function listPods(location?: { lat: number; lng: number }): Promise<ClientPod[]> {
  const query = location ? `?lat=${location.lat}&lng=${location.lng}` : "";
  return (await request<{ pods: ClientPod[] }>(`/api/pods${query}`)).pods;
}
export async function createPod(input: {
  departureStationId: string;
  departureExit: string | null;
  arrivalStationId: string;
  departureTime: string;
  maxParticipants: number;
  minParticipants: number;
  totalPrice: number;
}): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>("/api/pods", { method: "POST", body: JSON.stringify(input) })).pod;
}
export async function getPod(id: string): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}`)).pod;
}
export async function joinPod(id: string): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}/join`, { method: "POST" })).pod;
}
export async function leavePod(id: string): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}/leave`, { method: "DELETE" })).pod;
}
export async function kickParticipant(id: string, targetUid: string): Promise<ClientPod> {
  return (
    await request<{ pod: ClientPod }>(`/api/pods/${id}/kick`, { method: "POST", body: JSON.stringify({ targetUid }) })
  ).pod;
}
export async function reportUser(id: string, targetUid: string, reason: string): Promise<void> {
  await request(`/api/pods/${id}/report`, { method: "POST", body: JSON.stringify({ targetUid, reason }) });
}
export async function voteConfirm(id: string): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}/vote`, { method: "POST" })).pod;
}
export async function voteExtend(id: string, agree: boolean): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}/extend-vote`, {
    method: "POST",
    body: JSON.stringify({ agree }),
  })).pod;
}
/** FR-27: 도착(정산) 확인 동의. 참가자 전원이 동의해야 실제로 해지(정산)된다. */
export async function voteClose(id: string): Promise<ClientPod> {
  return (await request<{ pod: ClientPod }>(`/api/pods/${id}/close`, { method: "POST" })).pod;
}
export async function getHistory(): Promise<ClientPod[]> {
  return (await request<{ pods: ClientPod[] }>("/api/history")).pods;
}
export async function getMyActivePods(): Promise<ClientPod[]> {
  return (await request<{ pods: ClientPod[] }>("/api/pods/mine")).pods;
}

export async function redeemCoupon(code: string): Promise<number> {
  return (await request<{ mileageBalance: number }>("/api/mileage/coupon", {
    method: "POST",
    body: JSON.stringify({ code }),
  })).mileageBalance;
}
export async function chargeMileage(amount: number): Promise<number> {
  return (await request<{ mileageBalance: number }>("/api/mileage/charge", {
    method: "POST",
    body: JSON.stringify({ amount }),
  })).mileageBalance;
}
export async function getMileageBalance(): Promise<number> {
  return (await request<{ mileageBalance: number }>("/api/mileage/balance")).mileageBalance;
}
export async function getMileageTransactions(): Promise<ClientMileageTransaction[]> {
  return (await request<{ transactions: ClientMileageTransaction[] }>("/api/mileage/transactions")).transactions;
}
