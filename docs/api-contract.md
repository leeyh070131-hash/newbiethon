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
- 2026-09-12: 최초 구현. 현재는 지하철역만 채워져 있고 버스정류장은 비어 있다 — 공공데이터포털 API 키 확보 후 추가 예정 (`backend/data/README.md` 참고).
