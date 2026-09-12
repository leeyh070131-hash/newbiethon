# CLAUDE.md

이 프로젝트는 코덱스 사용자와 공유하는 저장소다. 담당 구역, API 계약 규칙, 깃 워크플로우 등 **두 도구가 공통으로 지켜야 하는 규칙은 전부 루트의 `AGENTS.md`에 있다** — 여기서 중복해서 적지 않는다. 반드시 `AGENTS.md`를 먼저 읽는다.

새 기능을 시작하거나 요구사항이 애매할 때는 `PRD.md`를 먼저 참고한다. 구현 순서와 현재 진행 단계는 `PHASE_PLAN.md`에 있다.

## 하네스: newbiethon(택시팟) 개발

**목표:** `backend/`·`frontend/` 전체 개발과, push 전 프론트-백엔드 API 정합성 확인을 지원한다. (2026-09-12부터 프론트엔드도 Claude Code가 담당 — 아래 변경 이력 참고.)

**트리거:** `backend/` 관련 작업 요청 시 `backend-dev` 에이전트를 사용하라. 통합 점검, push 전 확인, "프론트/백엔드 맞는지 봐줘" 요청 시 `integration-checker` 에이전트를 사용하라. `frontend/` 작업은 전담 에이전트 없이 직접 처리한다(단독 개발로 바뀌어 분업 검증용 에이전트가 당장 필요하지 않음 — 업무량이 늘면 `frontend-dev` 에이전트 추가 검토). 단순 질문은 직접 응답 가능.

**모델 정책:** 이 하네스에서 정의하는 모든 에이전트는 `model: sonnet`으로 고정한다. 새 에이전트를 추가할 때도 동일하게 적용한다.

**확장 규칙:** `backend/` 안의 특정 하위 영역(예: 마일리지/에스크로, 팟 확정·투표) 업무량이 늘어 세분화가 필요해지면, `AGENTS.md`의 "업무량에 따른 확장" 절차대로 하위 폴더 + 하위 `AGENTS.md`를 만들고, 그 영역 전담 에이전트를 `.claude/agents/`에 추가한다(예: `backend-mileage-dev.md`, model: sonnet). 새 에이전트를 추가하면 곧바로 아래 변경 이력에 기록한다.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-09-12 | `coworkharness` 템플릿을 newbiethon으로 이전·통합 (backend-dev, integration-checker 에이전트 + AGENTS.md 기반 코덱스 협업 구조, PRD.md/PHASE_PLAN.md 연동) | 전체 | 택시팟 서비스 PRD·Phase 확정 후 실제 프로젝트에 하네스 적용 요청 |
| 2026-09-12 | Codex가 만든 `feat/taxipot-frontend`(데모 UI, 백엔드 미연동) 병합 후 단일 앱으로 통합, 실제 API 연동으로 재작성. 이후 프론트엔드도 Claude Code가 전담하는 것으로 전환 | AGENTS.md, frontend/, backend/(응답 직렬화·참가자 이름 enrichment 추가) | "이제부터 FE 작업도 너가 하자" 요청 |
