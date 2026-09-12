const REPORT_EMAIL_TO = "leeyh070131@gmail.com";

/**
 * 신고 접수 로그를 관리자 이메일로 보낸다. Resend REST API를 그냥 fetch로 호출한다(SDK 불필요).
 * RESEND_API_KEY가 없으면(로컬 개발 등) 조용히 건너뛴다 — 이메일 발송 실패가 신고 접수 자체를
 * 막으면 안 되므로, 실패해도 에러를 던지지 않고 로그만 남긴다.
 */
export async function sendReportEmail(details: {
  reporterName: string;
  reporterUid: string;
  reportedName: string;
  reportedUid: string;
  podId: string;
  reason: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("RESEND_API_KEY가 설정되지 않아 신고 이메일을 보내지 못했습니다.", details);
    return;
  }

  const text = [
    `팟 ID: ${details.podId}`,
    `신고자: ${details.reporterName} (${details.reporterUid})`,
    `신고 대상: ${details.reportedName} (${details.reportedUid})`,
    `사유: ${details.reason}`,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "택시팟 신고 <onboarding@resend.dev>",
        to: [REPORT_EMAIL_TO],
        subject: `[택시팟 신고] ${details.reportedName}님 신고 접수`,
        text,
      }),
    });
    if (!response.ok) {
      console.error("신고 이메일 발송 실패:", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.error("신고 이메일 발송 중 오류:", error);
  }
}
