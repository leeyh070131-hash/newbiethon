import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.getByRole("button", { name: "로그인", exact: true }).first().click();
  await page.getByRole("button", { name: "체험 계정으로 시작하기" }).click();
  await page.getByRole("textbox", { name: "이름", exact: true }).fill("택시친구");
  await page.getByRole("textbox", { name: "은행", exact: true }).fill("체험은행");
  await page.getByRole("textbox", { name: "계좌번호", exact: true }).fill("1234567890");
  await page.getByRole("button", { name: "저장하고 시작하기" }).click();
}
test("검색, 빈 목록, 위치 거부 및 화면 너비", async ({ page }) => {
  // 브라우저별 권한 창 동작 대신, 표준 거부 콜백에 대한 앱의 처리를 검사합니다.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => {
      failure?.({ code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    };
  });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "지금, 함께 갈 팟" })).toBeVisible();
  await expect(page.locator(".pod-card")).toHaveCount(6);
  await page.getByLabel("출발지", { exact: true }).selectOption("sungshin");
  await page.locator(".search-button").click();
  await expect(page.locator(".pod-card")).toHaveCount(2);
  await page.getByLabel("도착지", { exact: true }).selectOption("dolgoji");
  await page.locator(".search-button").click();
  await expect(page.getByText("아직 이 방향의 팟이 없어요")).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await page.getByRole("button", { name: "내 위치로 찾기" }).click();
  await expect(page.getByText("위치를 확인할 수 없어 최신 생성순으로 보여드려요.")).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/home-${test.info().project.name}.png`, fullPage: true });
});
test("로그인부터 팟 생성, 충전, 전원 동의, 정산과 이력", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/"); await login(page);
  await page.getByRole("button", { name: "팟 만들기", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("combobox", { name: "출발지", exact: true }).selectOption("sungshin");
  await modal.getByRole("combobox", { name: "도착지", exact: true }).selectOption("gireum");
  await modal.getByRole("combobox", { name: "모집인원 (최대)", exact: true }).selectOption("2");
  await modal.getByRole("combobox", { name: "참여최소인원", exact: true }).selectOption("4");
  await modal.getByRole("button", { name: "팟 만들기", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("최소인원");
  await modal.getByRole("combobox", { name: "참여최소인원", exact: true }).selectOption("2");
  await modal.getByRole("button", { name: "팟 만들기", exact: true }).click();
  await page.getByRole("button", { name: "체험: 참가자 1명 추가" }).click();
  await expect(page.getByRole("button", { name: "팟 결성에 동의하기" })).toBeDisabled();
  await modal.getByRole("button", { name: "충전하기", exact: true }).click();
  await modal.getByRole("textbox", { name: "쿠폰 코드" }).fill("틀린코드");
  await modal.getByRole("button", { name: "등록", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("쿠폰 코드");
  await modal.getByRole("textbox", { name: "쿠폰 코드" }).fill("피크닉");
  await modal.getByRole("button", { name: "등록", exact: true }).click();
  await expect(modal.getByText("50,000 P", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator(".pod-card").first().click();
  await page.getByRole("button", { name: "팟 결성에 동의하기" }).click();
  await page.getByRole("button", { name: "체험: 다른 참가자 확정 동의" }).click();
  await expect(page.getByText("출발이 확정되었어요!")).toBeVisible();
  await expect(page.getByRole("button", { name: "팟 폐지하고 나가기" })).toHaveCount(0);
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "도착 완료 · 정산하기" }).click();
  await expect(modal.getByText("정산이 완료되어 호스트에게 포인트를 지급했어요.")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.locator(".balance-link")).toHaveText("53,500 P");
  const navigation = test.info().project.name.startsWith("mobile") ? page.locator(".mobile-nav") : page.locator(".desktop-nav");
  await navigation.getByRole("button", { name: "내 팟", exact: true }).click();
  await page.getByRole("button", { name: "이용 이력" }).click();
  await expect(page.locator(".pod-card")).toHaveCount(1);
  await expect(page.locator(".pod-card")).toContainText("정산 완료");
  await expect(page.locator(".pod-card .joined-tag")).toHaveText("이용 이력");
  expect(errors).toEqual([]);
});

test("프로필 수정과 취소, 마이페이지 잔액, 대화상자 키보드 이동", async ({ page }) => {
  await page.goto("/"); await login(page);
  await page.locator(".header-account").getByRole("button", { name: "마이페이지" }).click();
  await expect(page.locator("dl")).toContainText("마일리지 잔액0 P");
  await page.getByRole("button", { name: "프로필 수정", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "프로필 수정", exact: true });
  await expect(modal).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await modal.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  }
  await modal.getByRole("textbox", { name: "이름", exact: true }).fill("저장하지않음");
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await expect(page.locator("dl")).toContainText("택시친구");
  await expect(page.getByRole("button", { name: "프로필 수정", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "프로필 수정", exact: true }).click();
  await modal.getByRole("textbox", { name: "이름", exact: true }).fill("새이름");
  await modal.getByRole("button", { name: "변경 내용 저장" }).click();
  await expect(page.locator("dl")).toContainText("새이름");
  await page.getByRole("button", { name: "프로필 수정", exact: true }).click();
  await expect(modal.getByRole("textbox", { name: "이름", exact: true })).toHaveValue("새이름");
});

test("참가 성별 제한과 실제 시간 경과에 따른 연장 및 폐지 이력", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-12T14:00:00+09:00") });
  await page.goto("/"); await login(page);
  await page.getByRole("button", { name: /안암역에서 월곡역/ }).click();
  await expect(page.getByRole("button", { name: "등록 성별과 같은 팟만 참가할 수 있어요" })).toBeDisabled();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: /성신여대입구역에서 정릉역/ }).click();
  await page.getByRole("button", { name: "이 팟에 참가하기" }).click();
  await page.clock.fastForward(16 * 60000);
  await expect(page.getByRole("dialog", { name: "조금 더 기다려 볼까요?" })).toBeVisible();
  await page.getByRole("button", { name: "30분 연장 동의", exact: true }).click();
  await expect(page.getByText("1/3명 연장 동의", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "체험: 다른 참가자 연장 동의" }).click();
  await expect(page.getByRole("button", { name: "30분 연장 동의", exact: true })).toHaveCount(0);
  await page.clock.fastForward(30 * 60000);
  await page.getByRole("button", { name: "연장 거절", exact: true }).click();
  await expect(page.getByText("폐지된 팟이에요. 포인트는 차감되지 않았어요.")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const navigation = test.info().project.name.startsWith("mobile") ? page.locator(".mobile-nav") : page.locator(".desktop-nav");
  await navigation.getByRole("button", { name: "내 팟", exact: true }).click();
  await page.getByRole("button", { name: "이용 이력" }).click();
  await expect(page.locator(".pod-card")).toContainText("모집 폐지");
});

test("허용된 위치로 가까운 출발지 정렬", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.5853, longitude: 127.0194 });
  await page.goto("/");
  await page.getByRole("button", { name: "내 위치로 찾기" }).click();
  await expect(page.getByLabel("정렬 기준")).toHaveValue("distance");
  await expect(page.locator(".pod-card").first()).toHaveAccessibleName(/보문역에서 돌곶이역/);
});
