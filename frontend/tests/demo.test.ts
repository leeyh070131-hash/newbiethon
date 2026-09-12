import { describe, expect, it } from "vitest";
import { distance, initialState, transition, type DemoState } from "../lib/demo";

const now = 1800000000000;
function account(): DemoState {
  return transition(initialState(now), { type: "profile", profile: { id: "me", name: "테스트", gender: "female", bank: "체험은행", account: "1234567890" } }, now);
}
function host(): DemoState {
  return transition(account(), { type: "create", id: "mine", pod: { from: "sungshin", to: "gireum", min: 2, max: 4, price: 3500, departure: now + 60000 } }, now);
}
describe("프론트엔드 체험 규칙", () => {
  it("로그인 없이 참가하지 못한다", () => expect(() => transition(initialState(now), { type: "join", id: "sample-0" }, now)).toThrow("로그인"));
  it("다른 성별과 정원 마감인 팟은 참가를 거부한다", () => {
    expect(() => transition(account(), { type: "join", id: "sample-2" }, now)).toThrow("성별");
    expect(() => transition(account(), { type: "join", id: "sample-5" }, now)).toThrow("마감");
  });
  it("참가 중복과 시간이 지난 팟의 참가를 거부한다", () => {
    const s = transition(account(), { type: "join", id: "sample-0" }, now);
    expect(() => transition(s, { type: "join", id: "sample-0" }, now)).toThrow("이미");
    expect(() => transition(account(), { type: "join", id: "sample-0" }, now + 20 * 60000)).toThrow("참가할 수 없는");
  });
  it("생성 시 최소인원과 출발지, 도착지, 미래 시간을 검증한다", () => {
    const pod = { from: "sungshin", to: "gireum", min: 4, max: 2, price: 3500, departure: now + 60000 };
    expect(() => transition(account(), { type: "create", id: "bad", pod }, now)).toThrow("최소인원");
    expect(() => transition(account(), { type: "create", id: "bad", pod: { ...pod, min: 2, to: "sungshin" } }, now)).toThrow("서로 다른");
    expect(() => transition(account(), { type: "create", id: "bad", pod: { ...pod, min: 2, departure: now - 1 } }, now)).toThrow("출발시간");
    expect(() => transition(account(), { type: "create", id: "bad", pod: { ...pod, min: 2, from: "arbitrary-address" } }, now)).toThrow("선택");
  });
  it("피크닉 쿠폰을 반복 사용하고 잘못된 쿠폰과 충전 금액은 거부한다", () => {
    let s = account();
    for (let i = 0; i < 2; i++) s = transition(s, { type: "coupon", code: "피크닉" }, now);
    expect(s.balance).toBe(100000);
    expect(() => transition(s, { type: "coupon", code: "잘못됨" }, now)).toThrow("쿠폰");
    for (const amount of [-1, NaN, 1000.5, 1000001]) expect(() => transition(s, { type: "charge", amount }, now)).toThrow("정수");
  });
  it("잔액이 부족하면 동의하지 못하며 원본 상태는 바뀌지 않는다", () => {
    const s = transition(account(), { type: "join", id: "sample-0" }, now);
    expect(() => transition(s, { type: "vote", id: "sample-0" }, now)).toThrow("마일리지");
    expect(s.pods[0].members.find(m => m.id === "me")?.voted).toBe(false);
    expect(s.balance).toBe(0);
  });
  it("최소인원 도달과 전원 동의를 기다린 후 한 번만 포인트를 보관한다", () => {
    let s = transition(host(), { type: "coupon", code: "피크닉" }, now);
    expect(() => transition(s, { type: "vote", id: "mine" }, now)).toThrow("최소인원");
    s = transition(s, { type: "demo-join", id: "mine" }, now);
    s = transition(s, { type: "vote", id: "mine" }, now);
    expect(s.pods[0].status).toBe("open"); expect(s.balance).toBe(50000);
    s = transition(s, { type: "demo-vote", id: "mine" }, now);
    expect(s.pods[0].status).toBe("confirmed"); expect(s.balance).toBe(46500); expect(s.pods[0].escrow).toBe(7000);
    expect(s.pods[0].members.find(m => m.id !== "me")?.balance).toBe(46500);
    expect(() => transition(s, { type: "vote", id: "mine" }, now)).toThrow("확정된");
    expect(() => transition(s, { type: "leave", id: "mine" }, now)).toThrow("확정된");
    s = transition(s, { type: "close", id: "mine" }, now);
    expect(s.balance).toBe(53500); expect(s.pods[0].status).toBe("closed"); expect(s.pods[0].escrow).toBe(0);
    expect(() => transition(s, { type: "close", id: "mine" }, now)).toThrow("종료");
  });
  it("호스트가 아닌 참가자는 정산하지 못한다", () => {
    let s = transition(account(), { type: "coupon", code: "피크닉" }, now);
    s = transition(s, { type: "join", id: "sample-0" }, now);
    s = transition(s, { type: "vote", id: "sample-0" }, now);
    s = transition(s, { type: "demo-vote", id: "sample-0" }, now);
    expect(() => transition(s, { type: "close", id: "sample-0" }, now)).toThrow("호스트");
  });
  it("호스트 탈퇴는 참가자 전원의 폐지 기록을 남긴다", () => {
    const before = transition(host(), { type: "demo-join", id: "mine" }, now);
    const ids = before.pods[0].members.map(m => m.id);
    const s = transition(before, { type: "leave", id: "mine" }, now);
    expect(s.pods[0].status).toBe("cancelled"); expect(s.pods[0].members).toEqual([]); expect(s.pods[0].formerMembers).toEqual(ids);
    expect(() => transition(s, { type: "join", id: "mine" }, now)).toThrow("종료");
    expect(s.balance).toBe(before.balance);
  });
  it("일반 참가자는 확정 전 자유롭게 나갈 수 있다", () => {
    let s = transition(account(), { type: "join", id: "sample-0" }, now);
    s = transition(s, { type: "leave", id: "sample-0" }, now);
    expect(s.pods[0].members).toHaveLength(2); expect(s.pods[0].status).toBe("open"); expect(s.balance).toBe(0);
  });
  it("연장은 전원이 동의해야 30분 증가하며 다음 만료 시 다시 투표한다", () => {
    let s = transition(host(), { type: "demo-join", id: "mine" }, now);
    const departure = s.pods[0].departure;
    expect(() => transition(s, { type: "extend", id: "mine", agree: true }, now)).toThrow("출발시간");
    s = transition(s, { type: "extend", id: "mine", agree: true }, departure);
    expect(s.pods[0].departure).toBe(departure);
    s = transition(s, { type: "demo-extend", id: "mine" }, departure);
    expect(s.pods[0].departure).toBe(departure + 1800000);
    expect(s.pods[0].members.every(m => !m.extended)).toBe(true);
    const ids = s.pods[0].members.map(m => m.id);
    s = transition(s, { type: "extend", id: "mine", agree: false }, departure + 1800000);
    expect(s.pods[0].status).toBe("cancelled"); expect(s.pods[0].formerMembers).toEqual(ids); expect(s.balance).toBe(0);
  });
  it("위치 거리는 가까운 역일수록 작다", () => {
    expect(distance(37.5927, 127.0165, "sungshin")).toBe(0);
    expect(distance(37.5927, 127.0165, "gireum")).toBeGreaterThan(0);
  });
});
