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
