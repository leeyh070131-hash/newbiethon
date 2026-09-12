import { ValidationError } from "./http-errors";

/** app/api 라우트에서 공용으로 쓰는 JSON 본문 파싱. 객체가 아니면 ValidationError. */
export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ValidationError("요청 본문은 JSON 객체여야 합니다.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("유효한 JSON 본문이 필요합니다.");
  }
}
