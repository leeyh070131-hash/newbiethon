# API 계약

frontend/backend 사이의 API 요청/응답 형태를 정의하는 문서다. 갱신 규칙은 루트 `AGENTS.md`를 참고한다. 단계별 예정 엔드포인트 목록은 `PHASE_PLAN.md`에 있다 — 여기는 실제로 구현된 계약만 기록한다.

> **2026-09-12 계약 변경**: 모든 응답에서 Firestore `Timestamp` 필드(`createdAt`/`updatedAt`/`departureTime`/참가자의 `joinedAt`)는 **ISO 8601 문자열**로 내려간다(예: `"2026-09-12T13:00:00.000Z"`). 또한 팟 응답의 `participants` 배열 각 항목에 다른 사용자에게 공개해도 되는 `name`(표시용 이름)이 추가됐다 — 계좌·마일리지 등 민감 정보는 여전히 본인 것만(`GET /api/profile`) 조회 가능하다. 아래 각 섹션은 이 형태를 반영해 갱신했다.

엔드포인트마다 아래 형식으로 추가한다.

<!--
## POST /api/example

### Request
```json
{ "field": "type — 설명" }
```

### Response
```json
{ "field": "type — 설명" }
```

### 비고
(에러 케이스, 상태 코드, 변경 이력 등 필요할 때만)
-->

## GET /api/stations

### Request
없음 (인증 불필요 — 정류장/역 목록은 공개 참조 데이터)

### Response
```json
{
  "stations": [
    {
      "id": "string",
      "name": "string — 정류장/역 이름",
      "type": "\"bus\" | \"subway\"",
      "district": "string — MVP에서는 항상 \"성북구\"",
      "lat": "number",
      "lng": "number"
    }
  ]
}
```

### 비고
- 팟 생성(FR-7~FR-10) 시 출발지/도착지는 이 목록에 있는 `id` 중에서만 선택 가능하다 (FR-6).
- 2026-09-12: 최초 구현. 지하철역은 실제 목록(좌표 근사치), 버스정류장은 API 키 미확보로 임시 플레이스홀더 8곳만 포함 — 실제 공공데이터 아님 (`backend/data/README.md` 참고). 키 확보 후 교체 예정.

## GET /api/profile

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{
  "profile": {
    "uid": "string",
    "name": "string",
    "gender": "\"male\" | \"female\"",
    "bankAccount": "string",
    "mileageBalance": "number",
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

### 비고
- 401: 토큰 없음/무효. 404: 아직 프로필을 생성하지 않음(`POST /api/profile` 필요).

## POST /api/profile

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{ "name": "string", "gender": "\"male\" | \"female\"", "bankAccount": "string" }
```
세 필드 모두 필수.

### Response
`201`
```json
{ "profile": "GET /api/profile과 동일한 형태, mileageBalance는 0으로 시작" }
```

### 비고
- FR-2: 최초 로그인 시 온보딩에서 호출. 이미 프로필이 있으면 `409 Conflict` — 이후엔 PATCH만 허용된다(FR-3 불변성).
- 400: 필드 누락/형식 오류 (`name`/`bankAccount` 빈 문자열, `gender`가 male/female 외 값 등).

## PATCH /api/profile

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{ "name": "string (선택)", "gender": "\"male\" | \"female\" (선택)", "bankAccount": "string (선택)" }
```
한 개 이상 필드 필요.

### Response
```json
{ "profile": "GET /api/profile과 동일한 형태 (변경된 필드 + updatedAt 반영)" }
```

### 비고
- FR-3/FR-4: name/gender/bankAccount는 본인이 이 엔드포인트로 직접 호출하지 않는 한 절대 바뀌지 않는다 — 토큰의 uid로만 본인 문서를 수정하므로 다른 경로로는 변경 불가.
- 404: 아직 프로필이 없음(POST 먼저 필요). 400: 본문이 비어있거나 형식 오류.

## POST /api/pods

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{
  "departureStationId": "string — /api/stations의 id",
  "arrivalStationId": "string — /api/stations의 id, departureStationId와 달라야 함",
  "departureTime": "string — ISO 8601 날짜/시간",
  "maxParticipants": "number — 모집인원(최대 정원), 1 이상 정수",
  "minParticipants": "number — 참여최소인원, 1 이상 정수, maxParticipants 이하",
  "pricePerPerson": "number — 인당예상가격, 0보다 큼"
}
```

### Response
`201`
```json
{
  "pod": {
    "id": "string",
    "hostUid": "string",
    "gender": "\"male\" | \"female\" — 호스트 등록 성별로 자동 설정 (FR-9)",
    "departureStationId": "string",
    "arrivalStationId": "string",
    "departureTime": "string (ISO 8601)",
    "maxParticipants": "number",
    "minParticipants": "number",
    "pricePerPerson": "number",
    "status": "\"recruiting\"",
    "participants": [{ "uid": "string", "name": "string", "joinedAt": "string (ISO 8601)", "votedConfirm": "boolean", "votedExtend": "boolean", "votedClose": "boolean — FR-27 도착 확인 동의 여부, confirmed 상태일 때만 의미 있음" }],
    "participantUids": "string[] — participants의 uid만 뽑은 배열(내부 조회용, 프론트는 참고만)",
    "escrowTotal": "number — 생성 시 0",
    "awaitingExtension": "boolean — 생성 시 false",
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

### 비고
- FR-7: 생성자가 자동으로 호스트 겸 첫 참가자가 된다(참가자 배열에 본인 포함, votedConfirm은 아직 false).
- FR-10/AC-2: `minParticipants > maxParticipants`이면 400.
- 400: `departureStationId`/`arrivalStationId`가 `/api/stations`에 없는 id이거나 서로 같은 경우도 포함.
- 404: 프로필을 아직 생성하지 않은 사용자 (`POST /api/profile` 먼저 필요, gender를 여기서 가져오므로 FR-9의 전제조건).

## GET /api/pods

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
쿼리: `?lat=<number>&lng=<number>` (선택 — 위치 미제공/거부 시 생략)

### Response
```json
{ "pods": ["POST /api/pods 응답의 pod와 동일한 형태 배열, status가 \"recruiting\"인 것만"] }
```

### 비고
- FR-14: `lat`/`lng`가 둘 다 유효한 숫자면 각 팟의 출발지 정류장과의 직선거리(haversine) 오름차순으로 정렬.
- FR-14a: `lat`/`lng`가 없거나 숫자가 아니면 최신 생성순(`createdAt` desc)으로 정렬.
- 확정(`confirmed`)·폐지(`dissolved`)·해지(`closed`) 상태 팟은 포함되지 않는다.
- 이 쿼리는 Firestore 복합 인덱스가 필요하다 — `firestore.indexes.json` 참고, `firebase deploy --only firestore:indexes`로 배포.

## GET /api/pods/mine

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{ "pods": ["POST /api/pods 응답의 pod와 동일한 형태 배열, status가 \"recruiting\" 또는 \"confirmed\"인 것만, 출발시간 임박순"] }
```

### 비고
- "내 팟 > 참여 중" 화면용. `GET /api/pods`는 모집중인 팟만 보여주고 확정된 팟은 빠지기 때문에, 본인이 참가한 팟을 상태와 무관하게(참여 중인 것만) 보여주려면 이 엔드포인트가 필요하다.
- 종료된(해지/폐지) 팟은 `GET /api/history`를 사용한다.

## POST /api/pods/:id/join

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
본문 없음

### Response
```json
{ "pod": "POST /api/pods 응답의 pod와 동일한 형태, participants에 본인이 추가된 상태" }
```

### 비고
- FR-11/AC-3: 본인 등록 성별이 팟의 `gender`와 다르면 `403`.
- FR-12/AC-4: `participants.length`가 `maxParticipants`에 도달했으면 `409`("모집 마감된 팟입니다").
- `409`: 이미 참가한 팟에 다시 참가 시도, 또는 팟 상태가 `recruiting`이 아님(이미 확정/폐지/해지).
- `404`: 팟이 없음, 또는 본인 프로필이 없음(`POST /api/profile` 먼저 필요).
- 동시 참가로 정원 초과가 나지 않도록 서버에서 Firestore 트랜잭션으로 처리한다.

## DELETE /api/pods/:id/leave

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
본문 없음

### Response
```json
{ "pod": "탈퇴 반영 후 pod 최신 상태" }
```

### 비고
- FR-13/AC-5: 팟이 `recruiting` 상태일 때만 탈퇴 가능. 참가자가 탈퇴하면 `participants`에서 본인만 제거된다. 확정 전이라 마일리지 차감이 없으므로 환불 처리도 없다.
- FR-13a/AC-5a: 탈퇴하는 사람이 호스트(`hostUid`)면 팟 전체가 `dissolved`로 바뀐다(참가자 목록 자체는 기록으로 남지만 팟은 종료됨).
- `409`: 팟이 이미 `recruiting`이 아님(확정/폐지/해지된 팟은 이 엔드포인트로 탈퇴 불가).
- `400`: 본인이 이 팟의 참가자가 아님. `404`: 팟이 없음.

## POST /api/mileage/coupon

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{ "code": "string" }
```

### Response
```json
{ "mileageBalance": "number — 충전 후 잔액" }
```

### 비고
- FR-15/AC-12: `code`가 정확히 `"피크닉"`이면 50,000 충전. 계정당 횟수 제한 없음(반복 사용 가능).
- `400`: `code`가 없거나 `"피크닉"`이 아님. `404`: 프로필 없음(`POST /api/profile` 먼저 필요).

## POST /api/mileage/charge

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{ "amount": "number — 0보다 큰 정수" }
```

### Response
```json
{ "mileageBalance": "number — 충전 후 잔액" }
```

### 비고
- FR-16: 계좌 송금 Mock. 실제 은행/PG 연동 없이 `amount`만큼 즉시 충전된다.
- `400`: `amount`가 없거나 0 이하/정수가 아님. `404`: 프로필 없음.

## GET /api/mileage/balance

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{ "mileageBalance": "number" }
```

### 비고
- FR-17. `404`: 프로필 없음.

## GET /api/mileage/transactions

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{
  "transactions": [
    {
      "id": "string",
      "type": "\"coupon\" | \"charge\" | \"escrow_deduct\" | \"escrow_payout\"",
      "amount": "number — 잔액 변화량. 차감(escrow_deduct)은 음수, 그 외는 양수",
      "balanceAfter": "number — 이 거래 직후 잔액",
      "podId": "string | null — escrow_deduct/escrow_payout일 때만 관련 팟 id",
      "createdAt": "string (ISO 8601)"
    }
  ]
}
```

### 비고
- 마일리지 잔액이 바뀌는 모든 지점(쿠폰 충전 FR-15, 계좌송금 충전 FR-16, 팟 확정 시 에스크로 차감 FR-20, 팟 해지 시 정산 지급 FR-28)에서 잔액 변경과 같은 Firestore 트랜잭션 안에 함께 기록된다. 최신순(`createdAt` desc).
- 저장 위치는 `users/{uid}/mileageTransactions` 서브컬렉션 — 본인 것만 조회 가능(경로 자체가 본인 uid로 스코프됨).

## GET /api/pods/:id

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{ "pod": "POST /api/pods 응답의 pod와 동일한 형태 — 현재 상태/참가자별 투표 현황 포함" }
```

### 비고
- 투표 현황 폴링(참가자 목록의 `votedConfirm`)에 사용. `404`: 팟이 없음.

## POST /api/pods/:id/vote

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
본문 없음 (호출 = 본인의 확정 동의)

### Response
```json
{ "pod": "동의 반영 후 pod 최신 상태. 전원이 동의했다면 status가 \"confirmed\"로 바뀌고 escrowTotal이 채워짐" }
```

### 비고
- FR-18: 팟의 `participants.length`가 `minParticipants` 미만이면 아직 투표할 수 없다 (`409`).
- FR-19a/AC-5b: 본인의 `mileageBalance`가 `pricePerPerson`보다 적으면 동의 자체가 `402 Payment Required`로 거부된다 — 이 응답을 받으면 프론트는 마일리지 충전 안내를 띄운다.
- FR-19/FR-20/AC-6: 이 호출로 참가자 전원이 동의 상태가 되면, 그 자리에서 팟이 `confirmed`로 바뀌고 참가자 전원의 마일리지에서 `pricePerPerson`만큼 즉시 차감되어 `escrowTotal`에 반영된다(트랜잭션으로 원자 처리).
- FR-21/AC-7: 아직 전원 동의가 아니면 `status`는 계속 `recruiting`으로 유지된다(투표 화면 계속 열려 있음).
- `409`: 팟이 이미 `recruiting`이 아님, 또는 확정 처리 시점에 다른 참가자의 잔액이 부족해진 경우(드문 동시성 케이스).
- `400`: 본인이 이 팟의 참가자가 아님. `404`: 팟/본인 프로필 없음.
- FR-22: 확정(`confirmed`) 이후 노쇼가 발생해도 이미 차감된 마일리지를 되돌리는 API는 없다(정책일 뿐, 별도 엔드포인트 없음).

## GET /api/cron/check-departures

### Request
헤더: `Authorization: Bearer <CRON_SECRET>` (Vercel Cron이 자동으로 붙임 — 사람이 직접 호출하는 API 아님)

### Response
```json
{ "flaggedCount": "number — 이번 호출에서 새로 연장 동의 대상으로 표시된 팟 수" }
```

### 비고
- FR-23: `status === "recruiting"`이고 `awaitingExtension === false`인 팟 중 `departureTime`이 지난 것을 찾아 `awaitingExtension: true`로 바꾸고 참가자 전원의 `votedExtend`를 초기화한다.
- `vercel.json`의 `crons` 설정(5분 주기)으로 호출된다. `401`: `CRON_SECRET` 불일치.

## POST /api/pods/:id/extend-vote

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
```json
{ "agree": "boolean" }
```

### Response
```json
{ "pod": "투표 반영 후 pod 최신 상태" }
```

### 비고
- **2026-09-12 수정**: 원래 `awaitingExtension === true`(스케줄러가 미리 세워둔 값)일 때만 호출 가능했으나, 외부 크론(GitHub Actions, 5분 주기)의 실행 지연에 기능이 좌우되는 문제가 있었다. 이제는 팟의 실제 `departureTime`이 이미 지났으면 `awaitingExtension`이 아직 `false`여도 호출 시점에 서버가 직접 그 자리에서 플래그를 세우고 진행한다. 아직 출발시간 전이면 `409`("아직 출발시간 전이라 연장 동의 투표를 할 수 없습니다"). 스케줄러는 다른 참가자의 화면에 팝업을 더 빨리 띄워주는 보조 수단으로만 남는다.
- FR-25/AC-9: `agree: false`를 보낸 참가자가 한 명이라도 있으면 그 즉시 `status`가 `dissolved`로 바뀐다(다른 참가자 응답을 기다리지 않음).
- FR-24/AC-8: 참가자 전원이 `agree: true`를 보내면 `departureTime`이 30분 뒤로 연장되고 `awaitingExtension`이 `false`로 돌아가며, 다음 라운드를 위해 전원의 `votedExtend`가 초기화된다(`votedConfirm`은 그대로 유지).
- FR-26: 이 시점까지는 마일리지 차감이 없었으므로(미확정 상태) 폐지되어도 환불 처리가 필요 없다.
- `400`: 본인이 참가자가 아니거나 `agree`가 boolean이 아님. `404`: 팟이 없음.

## POST /api/pods/:id/close

> **2026-09-12 브레이킹 체인지**: 원래 "호스트만 즉시 해지" 방식이었으나, 참가자 전원이 도착을 확인해야 정산되는 방식으로 바뀌었다(FR-27 결정 변경, `PRD.md` 참고). 호출 = 본인의 도착 확인 동의이며, 즉시 해지가 아니다. `voteConfirm`/`voteExtend`와 같은 패턴.

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`
본문 없음 (호출 = 본인의 도착 확인 동의)

### Response
```json
{ "pod": "동의 반영 후 pod 최신 상태. 전원이 동의했다면 status가 \"closed\"로 바뀜" }
```

### 비고
- 팟이 `confirmed` 상태일 때만 호출 가능(`409` — 그 외엔 "확정된 팟만 도착 확인을 할 수 있습니다.").
- FR-27: 참가자 누구나(호스트 포함) 호출 가능. 전원이 동의하기 전까지는 `status`가 계속 `confirmed`로 유지되고 `participants[].votedClose`에 본인 동의만 반영된다.
- FR-28: 전원이 동의하는 순간 그 자리에서 `escrowTotal` 전액이 호스트의 `mileageBalance`에 지급되고(`users/{hostUid}/mileageTransactions`에 `escrow_payout` 기록 추가) `status`가 `closed`로 바뀐다.
- `400`: 본인이 이 팟의 참가자가 아님. `404`: 팟이 없음(전원 동의 처리 시 호스트 프로필이 없으면 404).
- `404`: 팟이 없거나 호스트 본인 프로필이 없음.

## GET /api/history

### Request
헤더: `Authorization: Bearer <Firebase ID Token>`

### Response
```json
{ "pods": ["본인이 참가했던 팟 중 status가 \"closed\" 또는 \"dissolved\"인 것들, 최신순(updatedAt desc)"] }
```

### 비고
- FR-29: 해지(`closed`)·폐지(`dissolved`) 기록 모두 포함. 확정 전 스스로 탈퇴해 `participantUids`에서 빠진 사람은 그 팟이 나중에 폐지/해지되어도 이력에 나타나지 않는다(탈퇴 시점에 관계가 끝난 것으로 취급).
