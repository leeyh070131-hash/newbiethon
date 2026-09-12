import { getAdminAuth } from "./firebase-admin";
import { UnauthorizedError } from "./http-errors";

export { UnauthorizedError };

/**
 * Authorization: Bearer <Firebase ID Token> 헤더를 검증해 uid를 반환한다.
 * 토큰이 없거나 유효하지 않으면 UnauthorizedError를 던진다.
 * API 라우트에서는 이 에러를 잡아 401 응답으로 변환한다.
 */
export async function requireAuth(request: Request): Promise<{ uid: string }> {
  const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    throw new UnauthorizedError("Authorization: Bearer <token> 헤더가 필요합니다.");
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    throw new UnauthorizedError("유효하지 않거나 만료된 토큰입니다.");
  }
}
