# PHASE_PLAN — 택시팟 MVP 구현 순서

`PRD.md`의 Must 요구사항(FR-1~FR-29)을 의존관계에 따라 구현 순서로 쪼갠 문서. 프론트엔드(Codex)와 백엔드(Claude Code)가 같은 단계를 동시에 진행하는 것을 전제로, 단계별 작업과 그 사이를 잇는 API 엔드포인트(예정)를 함께 적는다.

> 엔드포인트는 **예정** 목록이다. 실제 계약은 구현 시점에 `docs/api-contract.md`에 확정한다.

**현재 단계: Phase 1-B (백엔드 완료, 프론트엔드 대기)**

의존순서: A → B → C → D → E → F → (G, H는 F 이후, 서로 병렬 가능)

---

## Phase 1-A. 기반 설정
- Backend: ✅ Firebase Admin SDK 초기화(`backend/lib/firebase-admin.ts`), Firestore 데이터 모델 설계(User/Station/Pod, `backend/models/`), 지하철역 데이터 시딩(`backend/scripts/seed-stations.ts`), ID 토큰 검증 미들웨어(`backend/lib/auth.ts`), `GET /api/stations` 구현
  - ⚠️ 버스정류장은 API 키 미확보로 임시 플레이스홀더 8곳만 시딩됨 (실제 공공데이터 아님, `backend/data/README.md` 참고). 키를 받으면 실제 데이터로 교체.
- Frontend: ⬜ Firebase Client SDK 설정, Google 로그인 버튼/플로우 (FR-1) — Codex 담당, 미착수
- 예정 API: `GET /api/stations` (구현 완료, `docs/api-contract.md` 반영됨)
- 검증: 로그인 성공(프론트 완료 후 확인), 정류장 목록 조회 가능(지하철역만 — `npm run seed:stations` 실행 후 `GET /api/stations`로 확인 가능. Firebase 프로젝트/서비스 계정 키가 `.env.local`에 있어야 함)

## Phase 1-B. 사용자 프로필
- Backend: ✅ 프로필 생성/조회/수정 API (`backend/services/profile.ts`), 본인 토큰(uid)으로만 본인 문서 수정 가능하도록 해 불변성 보장 (FR-2, FR-3)
- Frontend: ⬜ 최초 로그인 온보딩 폼(이름/성별/계좌), 마이페이지 수정 폼 (FR-4) — Codex 담당, 미착수
- 예정 API: `GET /api/profile`, `POST /api/profile`, `PATCH /api/profile` (구현 완료, `docs/api-contract.md` 반영됨)
- 검증: 재수정 전까지 정보 불변 확인 (프론트 완료 후 end-to-end 확인 가능)

## Phase 1-C. 팟 생성 & 메인 목록
- Backend: 팟 생성 API(최소인원≤최대인원 검증, 동성 자동 설정) (FR-7~FR-10), 목록 API(위치기반 정렬 / 거부시 최신순) (FR-14, FR-14a)
- Frontend: 팟 생성 폼(정류장/역 선택), 메인화면 목록 UI + 위치 권한 요청
- 예정 API: `POST /api/pods`, `GET /api/pods`
- 검증: AC-1, AC-2, AC-13

## Phase 1-D. 팟 참가/탈퇴
- Backend: 참가 API(동성 필터, 정원마감) (FR-11, FR-12), 탈퇴 API(확정 전 참가자/호스트 탈퇴, 호스트 탈퇴시 자동 폐지) (FR-13, FR-13a)
- Frontend: 참가/탈퇴 버튼, 참가자 목록 표시
- 예정 API: `POST /api/pods/:id/join`, `DELETE /api/pods/:id/leave`
- 검증: AC-3, AC-4, AC-5, AC-5a

## Phase 1-E. 마일리지
- Backend: 쿠폰 충전 API(횟수 제한 없음) (FR-15), 계좌송금 Mock 충전 API (FR-16), 잔액 조회 API (FR-17)
- Frontend: 쿠폰 입력 UI, 충전 UI, 잔액 표시
- 예정 API: `POST /api/mileage/coupon`, `POST /api/mileage/charge`, `GET /api/mileage/balance`
- 검증: AC-12

## Phase 1-F. 확정 투표 & 에스크로
- Backend: 최소인원 도달시 투표 오픈, 전원동의시 확정 (FR-18, FR-19), 잔액부족시 동의 차단 (FR-19a), 확정시 에스크로 차감 (FR-20), 대기상태 유지 (FR-21), 노쇼 환불 없음 정책 (FR-22)
- Frontend: 투표 UI/현황 표시, 잔액부족 안내
- 예정 API: `POST /api/pods/:id/vote`, `GET /api/pods/:id`(상태·투표 현황 포함)
- 검증: AC-6, AC-7, AC-5b, AC-10
- 의존: Phase 1-D, 1-E 완료 필요

## Phase 1-G. 출발시간 임박 처리
- Backend: 출발시간 도달 감지(Vercel Cron 등 스케줄러), 연장 동의 API, 전원동의시 30분 연장 / 미동의시 자동 폐지 (FR-23~FR-26)
- Frontend: 연장 동의 팝업 UI
- 예정 API: `POST /api/pods/:id/extend-vote`
- 검증: AC-8, AC-9
- 의존: Phase 1-F 완료 필요

## Phase 1-H. 팟 해지 & 정산 & 이력
- Backend: 호스트 해지 API → 에스크로 전액 호스트 지급 (FR-27, FR-28), 해지/폐지 이력 기록·조회 (FR-29)
- Frontend: 해지 버튼(호스트 전용), 이력 페이지
- 예정 API: `POST /api/pods/:id/close`, `GET /api/history`
- 검증: AC-11
- 의존: Phase 1-F 완료 필요 (G와 병렬 가능)
