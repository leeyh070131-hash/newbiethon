# 택시팟 (newbiethon)

막차가 끊긴 뒤, 서울 성북구 정류장/역 기준으로 같은 방향으로 가는 대학생끼리 택시를 함께 타고 택시비를 나눠 내는 합승 매칭 서비스.

🔗 **배포 링크**: https://newbiethon-chi.vercel.app

## 소개

- 성북구 내 지하철역/버스정류장 중에서 출발지·도착지를 골라 팟을 만들거나, 이미 만들어진 팟에 참가한다.
- 참가 가능 성별은 호스트의 등록 성별과 자동으로 동일하게 제한된다(동성 팟).
- 호스트는 택시 총 금액만 입력하면 되고, 인당 부담액은 참가 인원 수에 맞춰 자동으로 N빵 계산된다(인원이 바뀌면 다시 계산).
- 출발지가 지하철역이면 몇 번 출구에서 만날지도 지정할 수 있다.
- 참가자 전원이 "확정 동의"하면 각자의 마일리지가 에스크로로 보관되고, 전원이 "도착 확인"에 동의하면 호스트에게 전액 정산된다. 정산/폐지 내역과 마일리지 사용 내역은 마이페이지에서 확인할 수 있다.
- 아직 준비(확정 동의)를 안 한 참가자는 호스트가 추방할 수 있고, 자진 탈퇴했거나 추방당한 사람은 같은 팟에 다시 들어올 수 없다.
- 이용 내역에서 문제가 있었던 상대를 신고할 수 있다(신고자 기준 일일 3회 제한, 접수 시 운영자 이메일 발송).
- 로그인은 Google 계정으로 하고, 최초 로그인 시 (실제 인증기관과 연동되지 않는 데모용) 공인인증서 인증 화면에서 이름/성별/계좌번호를 등록한다.

요구사항은 `PRD.md`, 구현 순서는 `PHASE_PLAN.md`, 협업 규칙은 `AGENTS.md`, API 계약은 `docs/api-contract.md` 참고.

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # Firebase 값 채우기
npm run dev
```

## 성북구 정류장/역 데이터 시딩

```bash
npm run seed:stations
```

`.env.local`에 Firebase Admin 환경변수(`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)가 필요하다. 현재는 지하철역만 채워진다 — `backend/data/README.md` 참고.

## Google 로그인 설정 (프론트엔드)

`.env.local`에 `NEXT_PUBLIC_FIREBASE_API_KEY`/`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`/`NEXT_PUBLIC_FIREBASE_PROJECT_ID`/`NEXT_PUBLIC_FIREBASE_APP_ID`를 채운다(Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱). Firebase Authentication에서 Google 제공자를 활성화하고, 로컬(`localhost`)과 배포 도메인을 승인된 도메인에 추가해야 로그인이 동작한다. 자세한 화면 구성은 `frontend/README.md` 참고.

## 출발시간 임박 처리 크론 (Phase 1-G)

`app/api/cron/check-departures`를 `vercel.json`에 등록된 스케줄(5분마다)로 Vercel Cron이 호출해 출발시간이 지난 미확정 팟을 연장 동의 대상으로 표시한다(FR-23).

- `.env.local`과 Vercel 프로젝트 환경변수 둘 다에 `CRON_SECRET`을 같은 값으로 설정해야 한다(Vercel이 자동으로 `Authorization: Bearer <CRON_SECRET>` 헤더를 붙여 호출을 인증한다).
- ⚠️ **확인 필요**: Vercel Hobby(무료) 플랜은 크론 실행 주기에 제한이 있을 수 있다(플랜에 따라 다름 — Vercel 대시보드에서 실제 배포 후 크론이 5분 주기로 정상 실행되는지 확인 필요). 제한에 걸리면 스케줄을 늘리거나(예: 1일 1회) GitHub Actions 등 외부 스케줄러로 이 엔드포인트를 대신 호출하는 방식으로 바꿔야 한다.

## Firestore 규칙/인덱스 배포

모든 Firestore 접근은 `backend/`(Firebase Admin SDK)를 통해서만 이뤄지므로 `firestore.rules`는 클라이언트 직접 접근을 전부 차단한다. `GET /api/pods`(위치 미제공 시 최신순 정렬)는 복합 인덱스가 필요하다.

```bash
firebase deploy --only firestore:rules,firestore:indexes
```
