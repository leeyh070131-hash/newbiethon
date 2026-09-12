# 택시팟 (newbiethon)

막차 이후 성북구 정류장/역 기준으로 택시 합승 팟을 모집·정산하는 서비스. 요구사항은 `PRD.md`, 구현 순서는 `PHASE_PLAN.md`, 협업 규칙은 `AGENTS.md` 참고.

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
