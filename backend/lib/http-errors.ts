/** API 라우트 공통 에러 타입. app/api/** 에서 잡아 일관된 JSON 응답으로 변환한다. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "인증되지 않은 요청입니다.") {
    super(401, message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** 라우트 핸들러의 catch 블록에서 사용: 알려진 에러는 해당 상태코드로, 그 외는 500으로 변환한다. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
