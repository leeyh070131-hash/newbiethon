# frontend/ 담당 규칙

이 디렉터리는 프론트엔드 담당자(Codex)의 작업 영역이다. 전체 프로젝트 공통 규칙은 루트의 `AGENTS.md`를 반드시 함께 참고한다 — 특히 API 계약(`docs/api-contract.md`) 갱신 규칙과 깃 워크플로우. 요구사항은 루트 `PRD.md`, 구현 순서는 루트 `PHASE_PLAN.md`를 따른다.

- API를 호출하는 코드는 `docs/api-contract.md`에 정의된 요청/응답 형태를 그대로 따른다.
- 계약 문서에 없는 엔드포인트가 필요하면, 먼저 계약 문서에 항목을 추가(또는 백엔드 담당자와 합의)한 뒤 구현한다.
- `backend/` 디렉터리는 수정하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
