import { test, expect } from "@playwright/test";

test("초기 로딩 측정 기록", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "동일한 Chromium 환경에서 전후 비교합니다.");
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 };
    Object.assign(window, { auditMetrics: metrics });
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) metrics.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => {
      for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
        if (!e.hadRecentInput) metrics.cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "지금, 함께 갈 팟" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // 화면 표시 이후 두 번의 paint가 완료된 시점의 관측치이며, 실사용자 성능 지표가 아닙니다.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const metrics = await page.evaluate(() => {
    const scripts = performance.getEntriesByType("resource").filter(e => e.name.includes("/_next/") && new URL(e.name).pathname.endsWith(".js")) as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return {
      ...((window as unknown as { auditMetrics: { lcp: number; cls: number } }).auditMetrics),
      scriptCount: scripts.length,
      scriptDecodedBytes: scripts.reduce((n, r) => n + r.decodedBodySize, 0),
      scriptEncodedBytes: scripts.reduce((n, r) => n + r.encodedBodySize, 0),
      domContentLoadedMs: nav.domContentLoadedEventEnd,
      observation: "localhost production build, unthrottled desktop Chromium, one observation",
    };
  });
  await testInfo.attach("initial-load.json", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
  console.log("INITIAL_LOAD", JSON.stringify(metrics));
});
