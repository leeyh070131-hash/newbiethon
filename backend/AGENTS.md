# backend/ 담당 규칙

이 디렉터리는 백엔드 담당자(Claude Code)의 작업 영역이다. 전체 프로젝트 공통 규칙은 루트의 `AGENTS.md`를 반드시 함께 참고한다 — 특히 API 계약(`docs/api-contract.md`) 갱신 규칙과 깃 워크플로우. 요구사항은 루트 `PRD.md`, 구현 순서는 루트 `PHASE_PLAN.md`를 따른다.

- API 엔드포인트를 추가/수정하면 그 즉시 `docs/api-contract.md`에 요청/응답 형태를 반영한다.
- 응답 형태를 바꾸는 변경(필드 추가/삭제/이름 변경, 타입 변경 등)은 계약 문서에 변경 사유를 남긴다.
- `frontend/` 디렉터리는 수정하지 않는다.
- Claude Code에서 이 디렉터리 작업 시 `.claude/agents/backend-dev.md` 에이전트를 사용한다.
