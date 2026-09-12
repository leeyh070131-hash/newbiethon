# API 계약

frontend/backend 사이의 API 요청/응답 형태를 정의하는 문서다. 갱신 규칙은 루트 `AGENTS.md`를 참고한다. 단계별 예정 엔드포인트 목록은 `PHASE_PLAN.md`에 있다 — 여기는 실제로 구현된 계약만 기록한다.

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
    "createdAt": "Firestore Timestamp",
    "updatedAt": "Firestore Timestamp"
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
    "departureTime": "Firestore Timestamp",
    "maxParticipants": "number",
    "minParticipants": "number",
    "pricePerPerson": "number",
    "status": "\"recruiting\"",
    "participants": [{ "uid": "string", "joinedAt": "Timestamp", "votedConfirm": "boolean" }],
    "escrowTotal": "number — 생성 시 0",
    "createdAt": "Timestamp",
    "updatedAt": "Timestamp"
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
