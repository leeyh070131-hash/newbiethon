# 택시팟 프론트엔드

루트 Next.js 앱(`app/`)이 렌더링하는 실제 화면 구현체다. `app/page.tsx`가 `frontend/components/taxi-app.tsx`를 그대로 불러와 렌더링하며, 별도의 서브 앱이나 별도 배포가 아니다 — 루트 `npm run dev`/`npm run build`로 함께 실행·빌드된다.

## 구성

- `components/taxi-app.tsx`: 메인 화면 전체(팟 찾기/내 팟/마일리지/마이페이지 + 모든 모달). 실제 `app/api/**`를 호출한다.
- `components/modal.tsx`: 접근성 처리된 공용 모달(포커스 트랩, Esc/바깥 클릭 닫기).
- `lib/firebase.ts`: Firebase Client SDK 초기화, Google 로그인/로그아웃, ID 토큰 조회. 세션은 새로고침해도 유지된다.
- `lib/api.ts`: 백엔드 호출 클라이언트. 모든 요청에 `Authorization: Bearer <Firebase ID Token>`을 자동으로 붙인다. 타입은 `backend/services/*`의 응답 타입을 그대로 재사용한다(계약이 어긋나지 않도록).

## 환경변수

루트 `.env.local`에 다음을 채운다 (`.env.local.example` 참고):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

Firebase 콘솔에서 Authentication > Sign-in method에서 Google 제공자를 활성화하고, 개발/배포 도메인을 승인된 도메인에 추가해야 로그인이 동작한다. 설정 전에는 로그인 버튼이 비활성화된다.

## 알려진 한계 (다음에 할 일)

- 성북구 정류장/역 데이터가 아직 완전하지 않다 — 지하철역은 실제 목록(좌표 근사치), 버스정류장은 임시 플레이스홀더다 (`backend/data/README.md` 참고).
- 다른 참가자의 실시간 변경(참가/투표)은 상세 화면이 열려 있는 동안 4초 주기 폴링으로만 반영된다. 실시간 구독(Firestore onSnapshot 등)은 아직 없다.
- 이전 버전(Codex 작업)에 있던 "체험: 다른 참가자 참가/동의 시뮬레이션" 버튼은 제거했다 — 실제 여러 사용자가 각자 로그인해서 행동해야 하는 구조로 바뀌었기 때문에 한 브라우저에서 다른 사람 행세를 할 방법이 없다.
- 자동화된 테스트(Vitest/Playwright)는 아직 없다 — 이전 버전의 테스트는 클라이언트 전용 데모 로직(`lib/demo.ts`, 이제 삭제됨)을 검증하던 것이라 실제 API 연동 버전에는 맞지 않아 제거했다.
