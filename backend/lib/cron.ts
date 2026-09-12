import { UnauthorizedError } from "./http-errors";

/**
 * Vercel Cron이 호출하는 라우트를 외부에서 함부로 못 두드리게 막는다.
 * Vercel Cron은 요청 시 자동으로 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 보낸다.
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export function requireCronSecret(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET 환경변수가 설정되지 않았습니다.");
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    throw new UnauthorizedError("유효하지 않은 크론 요청입니다.");
  }
}
