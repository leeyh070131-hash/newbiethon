// 프론트엔드 체험 전용 모델입니다. 서버 API 계약이나 실제 거래를 정의하지 않습니다.
export type Gender = "female" | "male";
export type Profile = { id: string; name: string; gender: Gender; bank: string; account: string };
export type Member = { id: string; name: string; balance: number; voted: boolean; extended: boolean };
export type Pod = {
  id: string; hostId: string; from: string; to: string; departure: number; created: number;
  max: number; min: number; price: number; gender: Gender;
  status: "open" | "confirmed" | "closed" | "cancelled";
  members: Member[]; formerMembers: string[]; escrow: number;
};
export type DemoState = { profile: Profile | null; balance: number; pods: Pod[] };
export const stations = [
  { id: "sungshin", name: "성신여대입구역", area: "동선동", line: "4호선", lat: 37.5927, lng: 127.0165 },
  { id: "hansung", name: "한성대입구역", area: "삼선동", line: "4호선", lat: 37.5884, lng: 127.006 },
  { id: "gireum", name: "길음역", area: "길음동", line: "4호선", lat: 37.6034, lng: 127.025 },
  { id: "jeongneung", name: "정릉역", area: "정릉동", line: "우이신설", lat: 37.6026, lng: 127.0135 },
  { id: "bomun", name: "보문역", area: "보문동", line: "6호선", lat: 37.5853, lng: 127.0194 },
  { id: "anam", name: "안암역", area: "안암동", line: "6호선", lat: 37.5863, lng: 127.0292 },
  { id: "wolgok", name: "월곡역", area: "하월곡동", line: "6호선", lat: 37.6019, lng: 127.0415 },
  { id: "dolgoji", name: "돌곶이역", area: "석관동", line: "6호선", lat: 37.6106, lng: 127.0564 },
];
export const station = (id: string) => stations.find(s => s.id === id)!;
export const money = (n: number) => n.toLocaleString("ko-KR");
export const time = (n: number) => new Date(n).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
export const active = (p: Pod) => p.status === "open" || p.status === "confirmed";
export const joined = (p: Pod, id?: string) => p.members.some(m => m.id === id);
export function distance(lat: number, lng: number, id: string) {
  const s = station(id), rad = Math.PI / 180;
  const a = Math.sin((s.lat - lat) * rad / 2) ** 2 + Math.cos(lat * rad) * Math.cos(s.lat * rad) * Math.sin((s.lng - lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function initialState(now = Date.now()): DemoState {
  const routes = [
    ["sungshin", "jeongneung", "female", 2, 3500, 15, "서연"],
    ["hansung", "gireum", "female", 3, 4000, 25, "지우"],
    ["anam", "wolgok", "male", 2, 3200, 35, "민준"],
    ["sungshin", "gireum", "female", 1, 3000, 45, "하은"],
    ["bomun", "dolgoji", "male", 3, 4500, 55, "도윤"],
    ["gireum", "jeongneung", "female", 4, 2500, 65, "수빈"],
  ] as const;
  return { profile: null, balance: 0, pods: routes.map(([from, to, gender, count, price, minutes, name], i) => ({
    id: `sample-${i}`, hostId: `host-${i}`, from, to, departure: now + minutes * 60000,
    created: now - i * 60000, max: 4, min: 2, price, gender, status: "open",
    members: Array.from({ length: count }, (_, j) => ({ id: j === 0 ? `host-${i}` : `guest-${i}-${j}`, name: j === 0 ? name : ["유진", "지민", "수현"][j - 1], balance: 50000, voted: false, extended: false })),
    formerMembers: [], escrow: 0,
  })) };
}
export type Action =
  | { type: "profile"; profile: Profile }
  | { type: "charge"; amount: number }
  | { type: "coupon"; code: string }
  | { type: "create"; pod: Pick<Pod, "from" | "to" | "departure" | "max" | "min" | "price">; id: string }
  | { type: "join" | "leave" | "vote" | "close"; id: string }
  | { type: "extend"; id: string; agree: boolean }
  | { type: "demo-join" | "demo-vote" | "demo-extend"; id: string };

function fail(message: string): never { throw new Error(message); }
export function transition(current: DemoState, action: Action, now = Date.now()): DemoState {
  const s = structuredClone(current);
  if (action.type === "profile") {
    const p = action.profile;
    if (!p.name.trim() || !p.bank.trim() || !/^\d{6,20}$/.test(p.account.replace(/[- ]/g, "")) || !["female", "male"].includes(p.gender)) fail("이름, 성별, 은행과 계좌번호(6~20자리 숫자)를 확인해 주세요.");
    s.profile = { ...p, name: p.name.trim(), bank: p.bank.trim() };
    for (const pod of s.pods) for (const m of pod.members) if (m.id === p.id) m.name = p.name.trim();
    return s;
  }
  const user = s.profile;
  if (!user) fail("먼저 로그인하고 프로필을 완성해 주세요.");
  if (action.type === "charge" || action.type === "coupon") {
    if (action.type === "coupon" && action.code.trim() !== "피크닉") fail("쿠폰 코드를 확인해 주세요. 체험용 코드는 ‘피크닉’이에요.");
    const amount = action.type === "coupon" ? 50000 : action.amount;
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 1000000 || !Number.isSafeInteger(s.balance + amount)) fail("1,000~1,000,000 사이의 정수 금액을 입력해 주세요.");
    s.balance += amount;
    return s;
  }
  if (action.type === "create") {
    const p = action.pod;
    if (!stations.some(x => x.id === p.from) || !stations.some(x => x.id === p.to) || p.from === p.to) fail("목록에서 서로 다른 출발지와 도착지를 선택해 주세요.");
    if (!Number.isInteger(p.max) || !Number.isInteger(p.min) || p.min < 2 || p.max > 4 || p.min > p.max) fail("최소인원은 2명 이상이며 모집인원을 넘을 수 없어요. 최대 4명까지 탈 수 있어요.");
    if (!Number.isFinite(p.departure) || p.departure <= now) fail("출발시간을 현재 시간 이후로 선택해 주세요.");
    if (!Number.isSafeInteger(p.price) || p.price < 1 || p.price > 1000000) fail("인당예상가격은 1~1,000,000 사이의 정수로 입력해 주세요.");
    s.pods.unshift({ ...p, id: action.id, hostId: user.id, gender: user.gender, status: "open", created: now,
      members: [{ id: user.id, name: user.name, balance: s.balance, voted: false, extended: false }], formerMembers: [], escrow: 0 });
    return s;
  }
  const p = s.pods.find(x => x.id === action.id);
  if (!p || !active(p)) fail("이미 종료되었거나 찾을 수 없는 팟이에요.");
  const me = p.members.find(m => m.id === user.id);
  if (action.type === "join") {
    if (p.status !== "open" || p.departure <= now) fail("지금은 참가할 수 없는 팟이에요.");
    if (me) fail("이미 참가한 팟이에요.");
    if (p.gender !== user.gender) fail("등록한 성별과 같은 팟에만 참가할 수 있어요.");
    if (p.members.length >= p.max) fail("모집이 마감되었어요.");
    p.members.push({ id: user.id, name: user.name, balance: s.balance, voted: false, extended: false });
    p.members.forEach(m => { m.voted = false; m.extended = false; });
    return s;
  }
  if (!me) fail("이 팟의 참가자만 이용할 수 있어요.");
  if (action.type === "close") {
    if (p.status !== "confirmed" || p.hostId !== user.id) fail("확정된 팟의 호스트만 정산할 수 있어요.");
    s.balance += p.escrow;
    p.escrow = 0;
    p.status = "closed";
    return s;
  }
  if (p.status !== "open") fail("확정된 팟은 탈퇴하거나 투표할 수 없어요.");
  if (action.type === "demo-join") {
    if (p.hostId !== user.id || p.members.length >= p.max || p.departure <= now) fail("모집 중인 내 팟에 자리가 있을 때만 체험 참가자를 추가할 수 있어요.");
    const guestId = `${p.id}-demo-${p.members.length}`;
    p.members.push({ id: guestId, name: ["", "유진", "지민", "수현"][p.members.length], balance: 50000, voted: false, extended: false });
    p.members.forEach(m => { m.voted = false; m.extended = false; });
    return s;
  }
  if (action.type === "leave") {
    if (p.hostId === user.id) {
      p.formerMembers = [...new Set([...p.formerMembers, ...p.members.map(m => m.id)])];
      p.members = []; p.status = "cancelled";
    } else {
      p.members = p.members.filter(m => m.id !== user.id);
      p.members.forEach(m => { m.voted = false; m.extended = false; });
    }
    return s;
  }
  if (action.type === "extend" || action.type === "demo-extend") {
    if (p.departure > now) fail("출발시간이 된 뒤에 연장 투표를 할 수 있어요.");
    if (action.type === "extend" && !action.agree) {
      p.formerMembers = [...new Set([...p.formerMembers, ...p.members.map(m => m.id)])];
      p.members = []; p.status = "cancelled"; return s;
    }
    if (action.type === "extend") me.extended = true;
    else p.members.filter(m => m.id !== user.id).forEach(m => { m.extended = true; });
    if (p.members.every(m => m.extended)) {
      p.departure += 30 * 60000;
      p.members.forEach(m => { m.extended = false; });
    }
    return s;
  }
  if (p.departure <= now) fail("출발시간이 지났어요. 먼저 연장 투표를 완료해 주세요.");
  if (p.members.length < p.min) fail("최소인원이 모이면 확정에 동의할 수 있어요.");
  if (action.type === "vote") {
    if (s.balance < p.price) fail("마일리지가 부족해요. 충전 후 동의해 주세요.");
    me.voted = true;
  } else if (action.type === "demo-vote") {
    p.members.filter(m => m.id !== user.id && m.balance >= p.price).forEach(m => { m.voted = true; });
  }
  if (p.members.every(m => m.voted)) {
    if (s.balance < p.price || p.members.some(m => m.id !== user.id && m.balance < p.price)) fail("잔액이 부족한 참가자가 있어 확정할 수 없어요.");
    s.balance -= p.price;
    p.members.forEach(m => { m.balance = m.id === user.id ? s.balance : m.balance - p.price; });
    p.escrow = p.price * p.members.length;
    p.status = "confirmed";
  }
  return s;
}
