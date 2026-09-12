# PHASE_PLAN — 택시팟 MVP 구현 순서

`PRD.md`의 Must 요구사항(FR-1~FR-29)을 의존관계에 따라 구현 순서로 쪼갠 문서.

> 엔드포인트는 이제 전부 구현 완료됐다. 최신 계약은 `docs/api-contract.md` 참고.

**현재 단계: Phase 1 완료 (백엔드 + 프론트엔드) — 배포/운영 확인만 남음**

프론트엔드는 애초 8단계로 나눠 진행할 계획이었으나, 실제로는 `frontend/components/taxi-app.tsx` 한 화면(팟 찾기/내 팟/마일리지/마이페이지 + 전 모달)에서 Phase 1-A~1-H의 흐름을 한 번에 구현했다. 아래는 각 단계가 요구했던 것과 실제 구현 위치를 정리한 기록이다.

---

## Phase 1-A. 기반 설정
- Backend: ✅ Firebase Admin SDK 초기화(`backend/lib/firebase-admin.ts`), Firestore 데이터 모델(`backend/models/`), 지하철역 시딩(`backend/scripts/seed-stations.ts`), ID 토큰 검증(`backend/lib/auth.ts`), `GET /api/stations`
  - ⚠️ 버스정류장은 API 키 미확보로 임시 플레이스홀더 8곳만 시딩됨 (실제 공공데이터 아님, `backend/data/README.md` 참고)
- Frontend: ✅ `frontend/lib/firebase.ts`(Google 로그인, 세션 자동 복원), 정류장 선택 UI(`taxi-app.tsx`)

## Phase 1-B. 사용자 프로필
- Backend: ✅ `backend/services/profile.ts` (생성/조회/수정, 불변성은 본인 uid 토큰으로만 수정 가능한 구조로 보장)
  - (2026-09-12) `updateProfile`이 `name`/`gender`를 아예 받지 않도록 변경 — 최초 인증(`createProfile`) 이후 영구 고정, PATCH로도 변경 불가.
- Frontend: ✅ 온보딩 폼(이름/성별/계좌) — (2026-09-12) 실제로 인증하지 않는 공인인증서 데모 화면으로 리스킨, 마이페이지 수정 폼은 계좌번호만 수정 가능(이름/성별은 비활성 표시)

## Phase 1-C. 팟 생성 & 메인 목록
- Backend: ✅ `backend/services/pods.ts`의 `createPod`/`listPods`
  - ⚠️ Firestore 복합 인덱스(`firestore.indexes.json`)·보안 규칙(`firestore.rules`) 배포 필요 — `firebase deploy --only firestore:rules,firestore:indexes`
  - (2026-09-12) 호스트가 `pricePerPerson`을 직접 입력하던 방식에서 `totalPrice`(택시 총 금액) 입력 + 참가자 수 자동 N빵으로 변경. `joinPod`/`leavePod`에서 인원이 바뀔 때마다 `pricePerPerson` 재계산.
- Frontend: ✅ 팟 생성 폼, 메인화면 목록 + 위치 권한 요청/거부 처리

## Phase 1-D. 팟 참가/탈퇴
- Backend: ✅ `joinPod`/`leavePod` (동성 필터, 정원마감, 호스트 탈퇴시 자동 폐지, 트랜잭션 처리)
  - (2026-09-12) `kickParticipant` 추가 — 호스트가 확정 동의 전인 참가자만 추방 가능. 탈퇴·추방한 uid는 `leftUids`에 기록되어 재참가 차단(`joinPod`에서 검사). 추방 시 대상 유저 문서에 `pendingNotice` 기록(`PATCH` 아님, `users/{uid}` 직접 갱신) → `DELETE /api/profile/notice`로 확인 처리.
- Frontend: ✅ 참가/탈퇴 버튼, 참가자 목록
  - (2026-09-12) 참가자 목록에 호스트 전용 "추방" 버튼(준비 안 한 참가자만), 추방당했을 때 뜨는 확인 팝업(`overlay: "kicked"`), 탈퇴/추방 시 "다시 참가할 수 없다" 안내 문구 추가

## Phase 1-E. 마일리지
- Backend: ✅ `backend/services/mileage.ts` (쿠폰/Mock 충전/잔액 조회)
- Frontend: ✅ 쿠폰 입력, 충전 폼, 잔액 표시

## Phase 1-F. 확정 투표 & 에스크로
- Backend: ✅ `voteConfirm` (최소인원 체크, 잔액부족 시 402, 전원동의 시 에스크로 차감 후 확정)
- Frontend: ✅ 투표 UI/현황, 잔액부족 안내(402 응답 처리 + 사전 비활성화)
- 의존: Phase 1-D, 1-E (완료)

## Phase 1-G. 출발시간 임박 처리
- Backend: ✅ `flagDepartedPodsForExtension`(Vercel Cron, `app/api/cron/check-departures`) + `voteExtend`
  - ⚠️ Vercel Hobby 플랜의 크론 실행 주기 제한 가능성 — 배포 후 실제 동작 확인 필요 (README 참고)
- Frontend: ✅ 연장 동의 팝업(전원 동의/거절 흐름)
- 의존: Phase 1-F (완료)

## Phase 1-H. 팟 해지 & 정산 & 이력
- Backend: ✅ `voteClose`(2026-09-12부터 호스트 단독 → 참가자 전원 동의 방식으로 변경, FR-27 참고)/`listHistory`/`listMyActivePods`, 마일리지 사용 내역(`backend/services/mileage.ts`의 `recordMileageTransaction`/`listMileageTransactions`, FR-17a)
- Frontend: ✅ 도착 확인 버튼(전원 동의 방식), "내 팟" 탭(참여 중/이용 이력), 마일리지 탭 사용 내역, 정산 완료 시 전원에게 알림(토스트, 폴링 기반), "함께 갈 팟" 새로고침 버튼
- 의존: Phase 1-F (완료)

---

## 남은 일 (배포/운영 — 사람이 직접 해야 함)

- [ ] `firebase deploy --only firestore:rules,firestore:indexes` 실행
- [ ] Vercel 프로젝트에 환경변수 등록: `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`(Admin), `NEXT_PUBLIC_FIREBASE_*`(Client), `CRON_SECRET`
- [ ] Firebase Authentication에서 Google 로그인 제공자 활성화 + 승인된 도메인에 배포 도메인 추가
- [ ] Vercel 배포 후 크론(`/api/cron/check-departures`)이 5분 주기로 실제 도는지 확인 (Hobby 플랜 제한 가능성)
- [ ] `npm run seed:stations` 1회 실행해 정류장 데이터 시딩
- [ ] (선택) 버스정류장 실제 공공데이터 키 확보 시 `backend/data/seongbuk-bus-stops-placeholder.json` 교체

## 알려진 한계 (다음 개선 대상)

- 다른 참가자의 변경(참가/투표/연장)은 상세 화면이 열려 있을 때 4초 폴링으로만 반영된다 — 실시간 구독은 아직 없다.
- 버스정류장은 8곳이 실제 공공데이터가 아닌 임시 데이터다.
- 자동화 테스트(단위/e2e)가 아직 없다.
