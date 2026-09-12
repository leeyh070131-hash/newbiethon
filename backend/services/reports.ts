import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../models/collections";
import { getAdminDb } from "../lib/firebase-admin";
import { ConflictError, NotFoundError, ValidationError } from "../lib/http-errors";
import { sendReportEmail } from "../lib/email";
import { getPodById } from "./pods";
import { getProfile } from "./profile";
import type { UserDoc } from "../models/user";

const DAILY_REPORT_LIMIT = 3;

/** "YYYY-MM-DD" (Asia/Seoul 기준). 신고 횟수 제한은 이 날짜 단위로 초기화된다. */
function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

/**
 * 이용 내역에서 같은 팟에 있었던 상대를 신고한다. 신고자 기준 일일 3회 제한이 있고,
 * 신고가 접수되면 관리자 이메일로 로그를 보낸다(발송 실패는 신고 접수 자체를 막지 않음).
 */
export async function reportUser(reporterUid: string, podId: string, targetUid: string, reason: string): Promise<void> {
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (trimmedReason.length === 0) {
    throw new ValidationError("신고 사유를 입력해 주세요.");
  }
  if (trimmedReason.length > 500) {
    throw new ValidationError("신고 사유는 500자 이하로 입력해 주세요.");
  }
  if (targetUid === reporterUid) {
    throw new ValidationError("본인을 신고할 수 없습니다.");
  }

  const pod = await getPodById(podId);
  // 자진 탈퇴했거나 추방당한 사람도 신고 대상이 될 수 있어야 하므로, 현재 참가자뿐 아니라
  // 과거에 이 팟에 있었던 사람까지 포함한다.
  const everInPod = new Set([...pod.participantUids, ...(pod.leftUids ?? [])]);
  if (!everInPod.has(reporterUid)) {
    throw new ValidationError("이 팟과 관련이 없어 신고할 수 없습니다.");
  }
  if (!everInPod.has(targetUid)) {
    throw new ValidationError("신고 대상이 이 팟의 참가자가 아닙니다.");
  }

  const db = getAdminDb();
  const reporterRef = db.collection(COLLECTIONS.users).doc(reporterUid);
  const reportRef = db.collection(COLLECTIONS.reports).doc();
  const today = todayInSeoul();

  await db.runTransaction(async (tx) => {
    const reporterSnapshot = await tx.get(reporterRef);
    if (!reporterSnapshot.exists) throw new NotFoundError("프로필이 아직 생성되지 않았습니다.");
    const reporter = reporterSnapshot.data() as UserDoc;

    const quota = reporter.reportQuota && reporter.reportQuota.date === today ? reporter.reportQuota : null;
    if (quota && quota.count >= DAILY_REPORT_LIMIT) {
      throw new ConflictError(`일일 신고 횟수(${DAILY_REPORT_LIMIT}회)를 모두 사용했습니다. 내일 다시 시도해 주세요.`);
    }

    const now = Timestamp.now();
    tx.set(reporterRef, {
      ...reporter,
      reportQuota: { date: today, count: (quota?.count ?? 0) + 1 },
      updatedAt: now,
    });
    tx.set(reportRef, {
      id: reportRef.id,
      podId,
      reporterUid,
      reportedUid: targetUid,
      reason: trimmedReason,
      createdAt: now,
    });
  });

  const [reporterProfile, targetProfile] = await Promise.all([
    getProfile(reporterUid).catch(() => null),
    getProfile(targetUid).catch(() => null),
  ]);
  await sendReportEmail({
    reporterName: reporterProfile?.name ?? "알 수 없음",
    reporterUid,
    reportedName: targetProfile?.name ?? "알 수 없음",
    reportedUid: targetUid,
    podId,
    reason: trimmedReason,
  });
}
