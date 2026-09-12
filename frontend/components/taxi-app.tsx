"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  ArrowDownUp, ArrowRight, CarTaxiFront, Check, ChevronDown, ChevronRight, Clock3, Compass, CreditCard,
  History, Leaf, LocateFixed, LogOut, MapPin, Moon, Plus, RefreshCw, Search, ShieldCheck, Sparkles,
  Ticket, TrainFront, Users, Wallet, X,
} from "lucide-react";
import Modal from "./modal";
import { firebaseConfigured, googleLogin, googleLogout, onAuthChange } from "@/frontend/lib/firebase";
import {
  ApiError, chargeMileage, createPod, createProfile, getHistory, getMileageTransactions, getMyActivePods,
  getPod, getProfile, getStations, joinPod, leavePod, listPods, redeemCoupon, updateProfile, voteClose,
  voteConfirm, voteExtend,
} from "@/frontend/lib/api";
import type { ClientPod } from "@/backend/services/pods";
import type { ClientUser } from "@/backend/services/profile";
import type { ClientMileageTransaction } from "@/backend/services/mileage";
import type { StationDoc } from "@/backend/models/station";

const transactionLabel: Record<ClientMileageTransaction["type"], string> = {
  coupon: "쿠폰 충전",
  charge: "계좌송금 충전",
  escrow_deduct: "팟 확정 보관",
  escrow_payout: "정산 지급",
};

type Tab = "explore" | "mine" | "wallet" | "profile";
type Overlay = "login" | "profile" | "create" | "charge" | "guide" | "detail" | "extend" | null;
type Gender = "female" | "male";

const labels: Record<ClientPod["status"], string> = {
  recruiting: "모집 중",
  confirmed: "확정 완료",
  closed: "정산 완료",
  dissolved: "모집 폐지",
};
const genderLabel = (g: Gender) => (g === "female" ? "여성" : "남성");
const dateInput = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const toMs = (iso: string) => new Date(iso).getTime();
const money = (n: number) => n.toLocaleString("ko-KR");
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
const active = (p: ClientPod) => p.status === "recruiting" || p.status === "confirmed";
const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "처리하지 못했어요. 다시 시도해 주세요.";
}

export default function TaxiApp() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null | undefined>(undefined);
  const [profile, setProfile] = useState<ClientUser | null>(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [stations, setStations] = useState<StationDoc[]>([]);
  const [pods, setPods] = useState<ClientPod[]>([]);
  const [myActivePods, setMyActivePods] = useState<ClientPod[]>([]);
  const [historyPods, setHistoryPods] = useState<ClientPod[]>([]);
  const [mileageTransactions, setMileageTransactions] = useState<ClientMileageTransaction[]>([]);
  const [selected, setSelected] = useState<ClientPod | null>(null);
  const [exploreRefreshing, setExploreRefreshing] = useState(false);
  const modalOpener = useRef<HTMLElement | null>(null);
  const prevConfirmedIdsRef = useRef<Set<string> | null>(null);

  const [tab, setTab] = useState<Tab>("explore");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedId, setSelectedId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState({ from: "", to: "" });
  const [createFrom, setCreateFrom] = useState("");
  const [createTo, setCreateTo] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | Gender>("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<"newest" | "departure" | "distance">("newest");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState("위치를 허용하면 가까운 출발지부터 볼 수 있어요");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(0);
  const [historyTab, setHistoryTab] = useState(false);
  const [dismissedExtension, setDismissedExtension] = useState("");

  const refreshExplore = useCallback(async () => {
    try {
      setPods(await listPods());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExploreRefreshing(false);
    }
  }, []);
  const refreshMine = useCallback(async () => {
    try {
      const [mine, history] = await Promise.all([getMyActivePods(), getHistory()]);

      // 정산 완료 알림: 직전에 "확정" 상태였던 팟이 이번엔 목록에서 사라졌는데 이력에는
      // "closed"로 있으면 그 사이 정산이 완료된 것이다. 로그인 직후 첫 호출(baseline)에는
      // 과거 정산 건까지 알림이 뜨지 않도록 prevConfirmedIdsRef가 null일 때는 건너뛴다.
      const newConfirmedIds = new Set(mine.filter((p) => p.status === "confirmed").map((p) => p.id));
      if (prevConfirmedIdsRef.current) {
        for (const id of prevConfirmedIdsRef.current) {
          if (newConfirmedIds.has(id)) continue;
          if (history.some((p) => p.id === id && p.status === "closed")) {
            setNotice("정산이 완료된 팟이 있어요. 내 팟 > 이용 이력에서 확인하세요.");
          }
        }
      }
      prevConfirmedIdsRef.current = newConfirmedIds;

      setMyActivePods(mine);
      setHistoryPods(history);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  // 마일리지는 본인 행동(투표/정산 등)뿐 아니라 다른 참가자의 마지막 동의로도 바뀔 수 있어
  // (예: 내가 이미 확정 동의한 뒤 다른 사람이 마지막으로 동의하면 그 순간 내 잔액이 차감됨),
  // 헤더/지갑에 보이는 값이 곧바로 맞아야 하는 곳마다 이 함수를 함께 호출한다.
  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getProfile());
    } catch {
      // 폴링 중 일시적 실패는 조용히 무시한다 — 다음 주기에 다시 시도된다.
    }
  }, []);
  const refreshSelected = useCallback(async (id: string) => {
    try {
      setSelected(await getPod(id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // 초기화: 정류장 목록(공개), 로그인 상태 구독, 1초 타이머
  useEffect(() => {
    getStations().then(setStations).catch((e) => setError(errorMessage(e)));
    const unsubscribe = onAuthChange(setAuthUser);
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  // 로그인 상태가 바뀌면 프로필을 확인한다. 없으면(첫 로그인) null 유지 → 온보딩 유도.
  useEffect(() => {
    if (authUser === undefined) return;
    if (!authUser) {
      setProfile(null);
      setProfileChecked(false);
      return;
    }
    (async () => {
      try {
        setProfile(await getProfile());
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setProfile(null);
        else setError(errorMessage(e));
      } finally {
        setProfileChecked(true);
      }
    })();
  }, [authUser]);

  // 로그인 화면이 열려 있는 상태에서 프로필 확인이 끝나면: 신규 사용자면 온보딩 폼을,
  // 기존 사용자면 로그인 창을 닫는다. 확인 전에 폼을 열면 defaultValue가 빈 값으로
  // 고정돼버리므로(uncontrolled input) 반드시 profileChecked 이후에만 분기한다.
  useEffect(() => {
    if (!authUser || !profileChecked || overlay !== "login") return;
    if (profile) {
      setOverlay(null);
      setNotice("로그인했어요.");
    } else {
      setOverlay("profile");
    }
  }, [authUser, profileChecked, profile, overlay]);

  useEffect(() => {
    // authUser가 undefined인 동안(Firebase 세션 복원 전)에는 아직 로그인 여부를 모른다.
    // 이때 바로 호출하면 401로 조용히 실패하고 이후 재시도가 없어 목록이 계속 비어 보인다.
    if (authUser) refreshExplore();
  }, [authUser, refreshExplore]);
  useEffect(() => {
    if (tab === "mine" && authUser) refreshMine();
  }, [tab, authUser, refreshMine]);
  // 정산 완료 알림은 "내 팟" 탭을 보고 있지 않아도 떠야 하므로, 로그인 중에는
  // 탭과 무관하게 주기적으로 내 팟 상태를 확인한다. 다른 참가자의 마지막 동의로
  // 내 마일리지가 바뀌는 경우도 있어 같은 주기로 잔액도 함께 갱신한다.
  useEffect(() => {
    if (!authUser) {
      prevConfirmedIdsRef.current = null;
      return;
    }
    const timer = setInterval(() => {
      refreshMine();
      refreshProfile();
    }, 8000);
    return () => clearInterval(timer);
  }, [authUser, refreshMine, refreshProfile]);
  useEffect(() => {
    if (tab === "wallet" && authUser) {
      getMileageTransactions().then(setMileageTransactions).catch((e) => setError(errorMessage(e)));
    }
  }, [tab, authUser]);
  // 팟 만들기 창을 열 때마다 검색 조건(있다면)으로 출발/도착지를 미리 채운다.
  useEffect(() => {
    if (overlay === "create") {
      setCreateFrom(query.from);
      setCreateTo(query.to);
    }
  }, [overlay, query.from, query.to]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  // 상세/연장 화면이 열려 있는 동안은 다른 참가자의 변경을 반영하기 위해 주기적으로 다시 불러온다.
  useEffect(() => {
    if (!selectedId || (overlay !== "detail" && overlay !== "extend")) return;
    refreshSelected(selectedId);
    const timer = setInterval(() => {
      refreshSelected(selectedId);
      refreshProfile(); // 다른 참가자의 동의로 이 화면을 보는 동안 내 잔액이 바뀔 수 있다.
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedId, overlay, refreshSelected, refreshProfile]);

  useEffect(() => {
    // 이미 위치를 허용한 사용자는 별도 클릭 없이 가까운 출발지부터 봅니다.
    let cancelled = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        if (!cancelled && result.state === "granted") locate();
      })
      .catch(() => {
        /* Permissions API 미지원 시 위치 버튼으로 요청합니다. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const stationName = (id: string) => stationById.get(id)?.name ?? id;

  const due = myActivePods.find(
    (p) =>
      p.status === "recruiting" &&
      toMs(p.departureTime) <= now &&
      `${p.id}-${p.departureTime}` !== dismissedExtension
  );
  useEffect(() => {
    if (due && (!overlay || (overlay === "detail" && selectedId === due.id))) {
      setSelectedId(due.id);
      setOverlay("extend");
      setError("");
    }
  }, [due, overlay, selectedId]);

  function open(next: Overlay) {
    setError("");
    setOverlay(next);
  }
  function close() {
    if (overlay === "extend" && selected) setDismissedExtension(`${selected.id}-${selected.departureTime}`);
    setOverlay(null);
    setError("");
  }
  function requireUser(next: Overlay) {
    open(authUser ? next : "login");
  }
  function selectPod(p: ClientPod) {
    setSelectedId(p.id);
    setSelected(p);
    open("detail");
  }

  async function login() {
    setBusy(true);
    setError("");
    try {
      await googleLogin();
      // 로그인 후 다음 단계(온보딩 또는 닫기)는 profileChecked 이펙트가 처리한다.
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === "auth/popup-closed-by-user"
          ? "로그인 창이 닫혔어요. 다시 시도할 수 있어요."
          : code === "auth/popup-blocked"
          ? "팝업이 차단되었어요. 브라우저에서 팝업을 허용해 주세요."
          : "Google 로그인에 실패했어요. Firebase 설정과 네트워크를 확인해 주세요."
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await googleLogout();
      setTab("explore");
      setNotice("로그아웃했어요.");
    } catch {
      setNotice("로그아웃에 실패했어요. 다시 시도해 주세요.");
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocationNote("위치 기능을 지원하지 않아 최신 생성순으로 보여드려요.");
      setSort("newest");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setSort("distance");
        setLocationNote("현재 위치에서 가까운 출발지 순으로 보고 있어요");
        setLocating(false);
      },
      () => {
        setSort("newest");
        setLocationNote("위치를 확인할 수 없어 최신 생성순으로 보여드려요.");
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  async function profileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (profile) {
        // 이름·성별은 최초 인증 후 변경할 수 없어 계좌번호만 수정한다.
        setProfile(await updateProfile({ bankAccount: String(data.get("account")) }));
      } else {
        setProfile(
          await createProfile({
            name: String(data.get("name")),
            gender: data.get("gender") as Gender,
            bankAccount: String(data.get("account")),
          })
        );
      }
      setNotice("프로필을 저장했어요.");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError("");
    if (!createFrom || !createTo) {
      setError("목록에 있는 정류장·역 이름을 정확히 입력해 출발지와 도착지를 선택해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const pod = await createPod({
        departureStationId: createFrom,
        arrivalStationId: createTo,
        departureTime: new Date(String(data.get("departure"))).toISOString(),
        maxParticipants: Number(data.get("max")),
        minParticipants: Number(data.get("min")),
        totalPrice: Number(data.get("price")),
      });
      setNotice("함께 갈 팟을 만들었어요!");
      await refreshExplore();
      selectPod(pod);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<ClientPod>, message: string) {
    setBusy(true);
    setError("");
    try {
      const pod = await action();
      setSelected(pod);
      setNotice(message);
      await Promise.all([
        refreshExplore(),
        authUser ? refreshMine() : Promise.resolve(),
        authUser ? refreshProfile() : Promise.resolve(),
      ]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (authUser === undefined) {
    return (
      <div className="loading">
        <span className="brand-icon">
          <TrainFront />
        </span>
        <p>함께 돌아갈 준비를 하고 있어요…</p>
      </div>
    );
  }

  const filteredPods = pods
    .filter(
      (p) =>
        (!query.from || p.departureStationId === query.from) &&
        (!query.to || p.arrivalStationId === query.to) &&
        (genderFilter === "all" || p.gender === genderFilter) &&
        (!availableOnly || (p.participants.length < p.maxParticipants && toMs(p.departureTime) > now))
    )
    .sort((a, b) => {
      const stationA = stationById.get(a.departureStationId);
      const stationB = stationById.get(b.departureStationId);
      if (sort === "distance" && location && stationA && stationB) {
        return haversine(location, stationA) - haversine(location, stationB) || toMs(b.createdAt) - toMs(a.createdAt);
      }
      if (sort === "departure") return toMs(a.departureTime) - toMs(b.departureTime);
      return toMs(b.createdAt) - toMs(a.createdAt);
    });
  const myPodsShown = historyTab ? historyPods : myActivePods;
  const myMember = selected?.participants.find((m) => m.uid === authUser?.uid);
  const title =
    overlay === "login"
      ? "함께 가는 첫걸음"
      : overlay === "profile"
      ? profile
        ? "프로필 수정"
        : "공인인증서로 본인인증"
      : overlay === "create"
      ? "함께 갈 팟 만들기"
      : overlay === "charge"
      ? "마일리지 충전"
      : overlay === "guide"
      ? "택시팟, 이렇게 이용해요"
      : overlay === "extend"
      ? "조금 더 기다려 볼까요?"
      : "함께 갈 팟";

  return (
    <>
      <header className="header">
        <div className="header-inner">
          <button className="brand" onClick={() => setTab("explore")} aria-label="택시팟 홈">
            <span className="brand-icon">
              <TrainFront size={21} />
            </span>
            택시팟<span className="beta">BETA</span>
          </button>
          <nav className="desktop-nav" aria-label="주 메뉴">
            <button className={tab === "explore" ? "active" : ""} onClick={() => setTab("explore")}>
              팟 찾기
            </button>
            <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>
              내 팟{myActivePods.length > 0 && <span className="nav-count">{myActivePods.length}</span>}
            </button>
            <button className={tab === "wallet" ? "active" : ""} onClick={() => setTab("wallet")}>
              마일리지
            </button>
          </nav>
          <div className="header-account">
            {authUser && profile ? (
              <>
                <button className="balance-link" onClick={() => setTab("wallet")}>
                  <Wallet size={16} />
                  {money(profile.mileageBalance)} P
                </button>
                <button className="avatar" aria-label="마이페이지" onClick={() => setTab("profile")}>
                  {profile.name.slice(0, 1)}
                </button>
              </>
            ) : (
              <button className="login-button" onClick={() => open("login")}>
                로그인 <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        {tab === "explore" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">
                  <Moon size={14} /> 성북구의 밤, 함께 가요
                </span>
                <h1>
                  방향은 같으니까,
                  <br />
                  귀갓길은 <span>가볍게.</span>
                </h1>
                <p>
                  같은 방향으로 가는 친구와 택시를 나눠 타요.
                  <br />
                  택시비 부담은 줄이고, 집까지 함께.
                </p>
                <button className="text-link" onClick={() => open("guide")}>
                  택시팟이 처음이라면 <ArrowRight size={16} />
                </button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <span className="art-star star-one">✦</span>
                <span className="art-star star-two">✧</span>
                <div className="moon-art" />
                <div className="art-label start-label">
                  <span className="pin-dot" />
                  우리의 출발지
                </div>
                <div className="road">
                  <span />
                </div>
                <div className="taxi">
                  <div className="taxi-sign">TAXI</div>
                  <div className="taxi-top">
                    <span />
                    <span />
                  </div>
                  <div className="taxi-body">
                    <i />
                    <b />
                    <i />
                  </div>
                  <div className="wheel wheel-left" />
                  <div className="wheel wheel-right" />
                </div>
                <div className="art-label end-label">
                  <MapPin size={16} />
                  집까지 함께!
                </div>
                <div className="floating-fare">
                  <div className="fare-avatars">
                    <i>나</i>
                    <i>너</i>
                    <i>우리</i>
                  </div>
                  <span>
                    함께 타면 부담은 <strong>1/N</strong>
                  </span>
                </div>
              </div>
            </section>
            <form
              className="search-panel"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery({ from, to });
              }}
            >
              <StationCombobox
                id="search-from"
                icon={<span className="pin-dot" />}
                label="출발지"
                placeholder="어디에서 출발하나요?"
                value={from}
                onChange={setFrom}
                stations={stations}
                wrapInSearchField
              />
              <button
                type="button"
                className="swap-button"
                aria-label="출발지와 도착지 바꾸기"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
              >
                <ArrowDownUp size={18} />
              </button>
              <StationCombobox
                id="search-to"
                icon={<MapPin size={15} />}
                label="도착지"
                placeholder="어디로 가시나요?"
                value={to}
                onChange={setTo}
                stations={stations}
                wrapInSearchField
              />
              <button className="primary search-button" type="submit">
                <Search size={19} />
                팟 찾기
              </button>
            </form>
            <div className="location-row">
              <span>
                <MapPin size={14} />
                {locationNote}
              </span>
              <button disabled={locating} onClick={locate}>
                <LocateFixed size={14} />
                {locating ? "위치 확인 중…" : "내 위치로 찾기"}
              </button>
            </div>
            <div className="content-layout">
              <section className="listing">
                <div className="section-head">
                  <div className="heading-inline">
                    <h2>지금, 함께 갈 팟</h2>
                    <span className="count">{filteredPods.length}</span>
                  </div>
                  <div className="section-actions">
                    <button
                      className="icon-refresh"
                      aria-label="목록 새로고침"
                      disabled={exploreRefreshing}
                      onClick={() => {
                        setExploreRefreshing(true);
                        refreshExplore();
                      }}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button className="primary small" onClick={() => requireUser("create")}>
                      <Plus size={17} />
                      팟 만들기
                    </button>
                  </div>
                </div>
                <div className="filter-row">
                  <div className="chips" role="group" aria-label="참가 성별">
                    <button className={genderFilter === "all" ? "selected" : ""} onClick={() => setGenderFilter("all")}>
                      전체
                    </button>
                    <button
                      className={genderFilter === "female" ? "selected" : ""}
                      onClick={() => setGenderFilter("female")}
                    >
                      여성 팟
                    </button>
                    <button className={genderFilter === "male" ? "selected" : ""} onClick={() => setGenderFilter("male")}>
                      남성 팟
                    </button>
                  </div>
                  <label className="sort">
                    <select
                      aria-label="정렬 기준"
                      value={sort}
                      onChange={(e) => {
                        if (e.target.value === "distance" && !location) locate();
                        else setSort(e.target.value as typeof sort);
                      }}
                    >
                      <option value="newest">최신 생성순</option>
                      <option value="departure">출발 임박순</option>
                      <option value="distance">가까운 출발지순</option>
                    </select>
                    <ChevronDown size={14} />
                  </label>
                </div>
                <div className="list-meta">
                  <span>성북구 정류장·역에서 만나요</span>
                  <label className="checkbox">
                    <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
                    참가 가능한 팟만
                  </label>
                </div>
                {(query.from || query.to) && (
                  <div className="applied-filter">
                    {query.from ? stationName(query.from) : "모든 출발지"} → {query.to ? stationName(query.to) : "모든 도착지"}
                    <button
                      aria-label="검색 초기화"
                      onClick={() => {
                        setQuery({ from: "", to: "" });
                        setFrom("");
                        setTo("");
                      }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <div className="pod-grid">
                  {filteredPods.map((p) => (
                    <PodCard
                      key={p.id}
                      pod={p}
                      now={now}
                      stationName={stationName}
                      isMine={p.participants.some((m) => m.uid === authUser?.uid)}
                      onClick={() => selectPod(p)}
                    />
                  ))}
                </div>
                {!filteredPods.length && (
                  <Empty
                    title="아직 이 방향의 팟이 없어요"
                    text="검색 조건을 바꾸거나 직접 첫 팟을 만들어 보세요."
                    action="팟 만들기"
                    onClick={() => requireUser("create")}
                  />
                )}
                <p className="list-footnote">
                  <ShieldCheck size={15} />
                  모든 팟은 호스트와 같은 성별의 친구들로 구성돼요.
                </p>
              </section>
              <aside className="sidebar">
                <div className="wallet-card">
                  <span className="side-eyebrow">
                    <Wallet size={17} />
                    나의 마일리지
                  </span>
                  <h3>
                    {profile ? money(profile.mileageBalance) : "0"}
                    <span> P</span>
                  </h3>
                  <p>함께 갈 준비, 미리 충전해 두세요.</p>
                  <button onClick={() => requireUser("charge")}>
                    충전하기 <Plus size={16} />
                  </button>
                  <div className="wallet-note">실제 현금이 아닌 시연용 포인트예요</div>
                </div>
                <button className="coupon-card" onClick={() => requireUser("charge")}>
                  <span className="coupon-icon">
                    <Ticket size={23} />
                  </span>
                  <span>
                    <small>첫 귀갓길을 응원해요</small>
                    <strong>
                      ‘피크닉’ 입력하고
                      <br />
                      <em>50,000 P</em> 받기
                    </strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <div className="how-card">
                  <span className="side-eyebrow">같이 가는 건 간단해요</span>
                  <div>
                    <i>1</i>
                    <p>
                      <strong>같은 방향의 팟 찾기</strong>
                      <span>출발지와 도착지를 확인해요</span>
                    </p>
                  </div>
                  <div>
                    <i>2</i>
                    <p>
                      <strong>모두 동의하면 출발 확정</strong>
                      <span>최소인원이 모이면 투표해요</span>
                    </p>
                  </div>
                  <div>
                    <i>3</i>
                    <p>
                      <strong>도착 후 깔끔하게 정산</strong>
                      <span>전원이 도착을 확인하면 정산돼요</span>
                    </p>
                  </div>
                  <button className="text-link" onClick={() => open("guide")}>
                    이용 방법 자세히 보기 <ArrowRight size={15} />
                  </button>
                </div>
                <div className="eco-note">
                  <Leaf size={19} />
                  <p>
                    같이 타는 작은 선택,
                    <br />
                    <strong>오늘의 귀갓길을 바꿔요.</strong>
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
        {tab === "mine" && (
          <section className="page-section">
            <span className="eyebrow">
              <Users size={15} />
              MY PODS
            </span>
            <h1>우리의 귀갓길</h1>
            <p className="muted">참여한 팟과 지난 이용 내역을 확인해요.</p>
            <div className="page-tabs">
              <button className={!historyTab ? "selected" : ""} onClick={() => setHistoryTab(false)}>
                참여 중
              </button>
              <button className={historyTab ? "selected" : ""} onClick={() => setHistoryTab(true)}>
                <History size={16} />
                이용 이력
              </button>
            </div>
            {!authUser ? (
              <Empty
                title="함께 갈 팟을 모아 볼까요?"
                text="로그인하면 참여한 팟을 확인할 수 있어요."
                action="로그인"
                onClick={() => open("login")}
              />
            ) : myPodsShown.length ? (
              <div className="pod-grid wide">
                {myPodsShown.map((p) => (
                  <PodCard key={p.id} pod={p} now={now} stationName={stationName} isMine onClick={() => selectPod(p)} />
                ))}
              </div>
            ) : (
              <Empty
                title={historyTab ? "아직 이용 이력이 없어요" : "아직 참여한 팟이 없어요"}
                text={historyTab ? "정산 완료 또는 폐지된 팟이 여기에 남아요." : "같은 방향으로 가는 친구를 찾아보세요."}
                action="팟 둘러보기"
                onClick={() => setTab("explore")}
              />
            )}
          </section>
        )}
        {tab === "wallet" && (
          <section className="page-section narrow">
            <span className="eyebrow">
              <Wallet size={15} />
              MY MILEAGE
            </span>
            <h1>귀갓길을 위한 준비</h1>
            <p className="muted">마일리지는 실제 화폐가 아닌 시연용 가상 포인트예요.</p>
            <div className="balance-card">
              <span>사용 가능한 마일리지</span>
              <h2>
                {money(profile?.mileageBalance ?? 0)} <small>P</small>
              </h2>
              <button className="primary" onClick={() => requireUser("charge")}>
                <Plus size={18} />
                마일리지 충전
              </button>
            </div>
            <div className="info-panel">
              <Ticket size={24} />
              <div>
                <h3>오늘의 쿠폰, 피크닉</h3>
                <p>입력할 때마다 50,000 P가 충전돼요. 횟수 제한 없이 사용할 수 있어요.</p>
              </div>
            </div>
            <div className="info-panel">
              <ShieldCheck size={24} />
              <div>
                <h3>확정할 때 보관하고, 도착 후 정산해요</h3>
                <p>
                  전원이 동의하면 인당예상가격만큼 포인트를 보관해요. 참가자 전원이 도착을 확인하면 보관된 전액을
                  호스트에게 지급해요. 확정 이후에는 불참해도 환불되지 않아요.
                </p>
              </div>
            </div>
            <h3 className="tx-heading">마일리지 사용 내역</h3>
            {mileageTransactions.length ? (
              <ul className="tx-items">
                {mileageTransactions.map((t) => (
                  <li key={t.id}>
                    <span>{transactionLabel[t.type]}</span>
                    <span className={t.amount >= 0 ? "tx-plus" : "tx-minus"}>
                      {t.amount >= 0 ? "+" : ""}
                      {money(t.amount)} P
                    </span>
                    <small>
                      {new Date(t.createdAt).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">아직 마일리지 사용 내역이 없어요.</p>
            )}
          </section>
        )}
        {tab === "profile" && (
          <section className="page-section narrow">
            <span className="eyebrow">MY PROFILE</span>
            <h1>마이페이지</h1>
            {profile ? (
              <>
                <div className="profile-card">
                  <div className="profile-heading">
                    <span className="avatar large">{profile.name.slice(0, 1)}</span>
                    <div>
                      <h2>{profile.name}님</h2>
                      <span className="muted">오늘도 편안한 귀갓길 되세요</span>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>마일리지 잔액</dt>
                      <dd>{money(profile.mileageBalance)} P</dd>
                    </div>
                    <div>
                      <dt>이름</dt>
                      <dd>{profile.name}</dd>
                    </div>
                    <div>
                      <dt>등록 성별</dt>
                      <dd>{genderLabel(profile.gender)}</dd>
                    </div>
                    <div>
                      <dt>계좌번호</dt>
                      <dd>
                        {"•".repeat(Math.max(0, profile.bankAccount.length - 4))}
                        {profile.bankAccount.slice(-4)}
                      </dd>
                    </div>
                  </dl>
                  <button className="secondary full" onClick={() => open("profile")}>
                    프로필 수정
                  </button>
                </div>
                <button className="text-link logout" onClick={logout}>
                  <LogOut size={16} />
                  로그아웃
                </button>
              </>
            ) : (
              <Empty
                title="나를 소개해 주세요"
                text="로그인 후 이름, 성별과 정산 계좌를 등록할 수 있어요."
                action="로그인"
                onClick={() => open("login")}
              />
            )}
          </section>
        )}
        <footer className="footer">
          <span className="footer-brand">
            택시팟 <span>같은 방향, 가벼운 귀가.</span>
          </span>
          <span>성북구 한정 서비스</span>
          <button onClick={() => open("guide")}>이용 안내</button>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {(
          [
            { id: "explore", label: "팟 찾기", icon: Compass },
            { id: "mine", label: "내 팟", icon: Users },
            { id: "wallet", label: "마일리지", icon: Wallet },
            { id: "profile", label: "마이페이지", icon: CreditCard },
          ] as const
        ).map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            <item.icon size={20} />
            {item.label}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
          <button aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {overlay && (
        <Modal title={title} onClose={close} returnFocusTo={modalOpener.current}>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {overlay === "login" && (
            <div className="login-content">
              <div className="login-illustration">
                <Moon size={35} />
                <Sparkles size={22} />
              </div>
              <p>
                같은 방향으로 가는 친구를 만나고
                <br />
                택시비를 가볍게 나눠요.
              </p>
              <button className="secondary full google" disabled={!firebaseConfigured || busy} onClick={login}>
                <b>G</b>
                {busy ? "로그인 중…" : "Google로 계속하기"}
              </button>
              {!firebaseConfigured && <p className="form-hint">Google 로그인은 Firebase 설정 후 사용할 수 있어요.</p>}
            </div>
          )}
          {overlay === "profile" && (
            <form className="form" onSubmit={profileSubmit}>
              {!profile && (
                <div className="inline-info">
                  <ShieldCheck size={17} />
                  실제 인증기관과 연동되지 않는 데모 화면이에요. 여기서 입력한 정보로 최초 프로필이 만들어져요.
                </div>
              )}
              <label>
                이름
                <input
                  name="name"
                  placeholder="예: 김택시"
                  defaultValue={profile?.name ?? authUser?.displayName ?? ""}
                  maxLength={20}
                  disabled={!!profile}
                  required
                />
              </label>
              <fieldset>
                <legend>성별</legend>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      defaultChecked={!profile || profile.gender === "female"}
                      disabled={!!profile}
                    />
                    여성
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      defaultChecked={profile?.gender === "male"}
                      disabled={!!profile}
                    />
                    남성
                  </label>
                </div>
                <small>
                  {profile
                    ? "이름과 성별은 최초 인증 후에는 변경할 수 없어요."
                    : "등록한 성별과 같은 팟에 참가할 수 있어요. 인증 후에는 바꿀 수 없으니 신중하게 선택해 주세요."}
                </small>
              </fieldset>
              <label>
                계좌번호
                <input
                  name="account"
                  inputMode="numeric"
                  placeholder="예: 1234567890"
                  defaultValue={profile?.bankAccount ?? ""}
                  maxLength={24}
                  pattern="[0-9\- ]{6,24}"
                  required
                />
              </label>
              <button className="primary full" type="submit" disabled={busy}>
                {profile ? "변경 내용 저장" : "인증하고 시작하기"}
                <ArrowRight size={17} />
              </button>
            </form>
          )}
          {overlay === "create" && authUser && profile && (
            <form className="form" onSubmit={createSubmit}>
              <div className="inline-info">
                <ShieldCheck size={17} />
                {genderLabel(profile.gender)} 팟으로 자동 생성돼요.
              </div>
              <StationCombobox
                id="create-from"
                label="출발지"
                placeholder="정류장·역 이름을 입력해 주세요"
                value={createFrom}
                onChange={setCreateFrom}
                stations={stations}
              />
              <StationCombobox
                id="create-to"
                label="도착지"
                placeholder="정류장·역 이름을 입력해 주세요"
                value={createTo}
                onChange={setCreateTo}
                stations={stations}
              />
              <label>
                출발시간
                <input type="datetime-local" name="departure" defaultValue={dateInput(Date.now() + 30 * 60000)} min={dateInput(now)} required />
              </label>
              <div className="form-row">
                <label>
                  모집인원 (최대)
                  <select name="max" defaultValue="4">
                    <option value="2">2명</option>
                    <option value="3">3명</option>
                    <option value="4">4명</option>
                  </select>
                </label>
                <label>
                  참여최소인원
                  <select name="min" defaultValue="2">
                    <option value="2">2명</option>
                    <option value="3">3명</option>
                    <option value="4">4명</option>
                  </select>
                </label>
              </div>
              <label>
                택시 총 금액 (P)
                <input name="price" type="number" min="1" max="1000000" step="1" defaultValue="14000" required />
              </label>
              <p className="form-hint">
                택시 미터기에 찍히는 총 금액을 입력해 주세요. 인당예상가격은 참가 인원 수에 맞춰 자동으로 나눠 계산돼요(인원이
                바뀌면 다시 계산돼요). 인원에는 호스트인 나도 포함돼요.
              </p>
              <button className="primary full" type="submit" disabled={busy}>
                <Plus size={18} />
                팟 만들기
              </button>
            </form>
          )}
          {overlay === "charge" && profile && (
            <div className="charge-content">
              <div className="charge-balance">
                현재 잔액 <strong>{money(profile.mileageBalance)} P</strong>
              </div>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  setBusy(true);
                  setError("");
                  try {
                    const balance = await redeemCoupon(String(new FormData(f).get("coupon")));
                    setProfile((prev) => (prev ? { ...prev, mileageBalance: balance } : prev));
                    setNotice("50,000 P가 충전되었어요!");
                    f.reset();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  쿠폰 코드
                  <div className="input-button">
                    <input name="coupon" placeholder="피크닉" required />
                    <button className="primary" type="submit" disabled={busy}>
                      등록
                    </button>
                  </div>
                </label>
                <small>‘피크닉’을 입력하면 50,000 P! 여러 번 사용할 수 있어요.</small>
              </form>
              <div className="divider">계좌 송금 체험</div>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    const balance = await chargeMileage(Number(new FormData(e.currentTarget).get("amount")));
                    setProfile((prev) => (prev ? { ...prev, mileageBalance: balance } : prev));
                    setNotice("포인트가 충전되었어요.");
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  충전 금액 (P)
                  <input name="amount" type="number" min="1" max="1000000" step="1" defaultValue="10000" required />
                </label>
                <p className="form-hint">실제 송금 없이 확인 즉시 가상 포인트가 충전돼요.</p>
                <button className="primary full" type="submit" disabled={busy}>
                  확인하고 충전하기
                </button>
              </form>
            </div>
          )}
          {overlay === "guide" && (
            <div className="guide-content">
              <div className="info-panel">
                <Search />
                <div>
                  <h3>1. 같은 방향의 친구 찾기</h3>
                  <p>성북구 정류장·역을 선택해 팟을 찾거나 직접 만들어요. 호스트와 같은 성별만 참가할 수 있어요.</p>
                </div>
              </div>
              <div className="info-panel">
                <Users />
                <div>
                  <h3>2. 최소인원이 모이면 함께 동의</h3>
                  <p>호스트를 포함한 전원이 동의하면 확정돼요. 마일리지가 부족하면 먼저 충전해 주세요.</p>
                </div>
              </div>
              <div className="info-panel">
                <Clock3 />
                <div>
                  <h3>3. 출발시간이 됐는데 아직이라면?</h3>
                  <p>모두 30분 연장에 동의하면 더 기다려요. 한 명이라도 거절하면 팟이 폐지돼요.</p>
                </div>
              </div>
              <div className="info-panel">
                <CarTaxiFront />
                <div>
                  <h3>4. 확정되면 호스트가 택시 호출</h3>
                  <p>
                    <b>확정(전원 동의) 전에 택시를 부르면 안 돼요.</b> 아직 인원이 다 안 모였거나 연장 동의가 실패하면
                    팟이 폐지될 수 있어서, 그 전에 부른 택시는 헛걸음이 될 수 있어요. 팟이 확정된 뒤, 출발시간 또는 그
                    이후에 도착하도록 호스트가 택시를 호출해 주세요.
                  </p>
                </div>
              </div>
              <div className="info-panel">
                <Wallet />
                <div>
                  <h3>5. 도착 후 전원 확인하면 정산</h3>
                  <p>
                    참가자 전원이 도착을 확인하면 보관한 포인트 전액이 호스트에게 지급되고 모두에게 알림이 떠요. 확정
                    후에는 탈퇴나 노쇼 환불이 불가능해요.
                  </p>
                </div>
              </div>
            </div>
          )}
          {(overlay === "detail" || overlay === "extend") && selected && (
            <div className="detail-content">
              <div className="detail-status">
                <span className={`badge ${selected.status === "recruiting" ? "green" : "neutral"}`}>
                  {labels[selected.status]}
                </span>
                <span className="badge neutral">{genderLabel(selected.gender)} 팟</span>
              </div>
              <div className="detail-route">
                <strong>{stationName(selected.departureStationId)}</strong>
                <ArrowRight size={20} />
                <strong>{stationName(selected.arrivalStationId)}</strong>
              </div>
              <div className="detail-facts">
                <span>
                  <Clock3 size={16} />
                  {new Date(selected.departureTime).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}{" "}
                  {timeOf(selected.departureTime)} 출발
                </span>
                <span>
                  <Users size={16} />
                  {selected.participants.length}/{selected.maxParticipants}명 · 최소 {selected.minParticipants}명
                </span>
                <span>
                  <Wallet size={16} />
                  1인 <b>{money(selected.pricePerPerson)} P</b> (총 {money(selected.totalPrice)} P)
                </span>
              </div>
              <h3 className="participants-heading">
                함께 가는 친구들 <span>{selected.participants.length}</span>
              </h3>
              <ul className="participants">
                {selected.participants.map((m) => {
                  // 팟 단계별로 지금 의미 있는 투표가 다르다: 모집중=확정 동의, 확정=도착 확인, 종료=완료.
                  const done =
                    selected.status === "closed" ? true : selected.status === "confirmed" ? m.votedClose : m.votedConfirm;
                  const label =
                    selected.status === "closed" ? "정산 완료" : selected.status === "confirmed" ? (done ? "도착 확인" : "대기 중") : done ? "확정 동의" : "대기 중";
                  return (
                    <li key={m.uid}>
                      <span className="avatar mini">{m.name.slice(0, 1)}</span>
                      <span>
                        {m.name}
                        {m.uid === authUser?.uid ? " (나)" : ""}
                        <small>{m.uid === selected.hostUid ? "호스트" : "참가자"}</small>
                      </span>
                      <span className={done ? "vote-done" : "muted"}>
                        {label}
                        {done && <Check size={14} />}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {selected.status === "recruiting" && toMs(selected.departureTime) <= now && myMember ? (
                <div className="vote-panel">
                  <h3>출발시간이 되었어요</h3>
                  <p>모두 동의하면 출발시간을 30분 연장해요. 한 명이라도 거절하면 팟이 폐지돼요.</p>
                  <strong>{selected.participants.filter((m) => m.votedExtend).length}/{selected.participants.length}명 연장 동의</strong>
                  <div className="form-row">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => act(() => voteExtend(selected.id, false), "연장을 거절하여 팟이 폐지되었어요.")}
                    >
                      연장 거절
                    </button>
                    <button
                      className="primary"
                      disabled={busy || myMember.votedExtend}
                      onClick={() => act(() => voteExtend(selected.id, true), "연장 동의가 반영되었어요.")}
                    >
                      {myMember.votedExtend ? "다른 참가자 기다리는 중" : "30분 연장 동의"}
                    </button>
                  </div>
                </div>
              ) : selected.status === "recruiting" && myMember ? (
                <div className="vote-panel">
                  <h3>
                    {selected.participants.length >= selected.minParticipants ? "모두 동의하면 출발 확정!" : "함께 갈 친구를 기다려요"}
                  </h3>
                  <p>
                    {selected.participants.length >= selected.minParticipants
                      ? `${selected.participants.filter((m) => m.votedConfirm).length}/${selected.participants.length}명 동의 · 확정되면 1인 ${money(
                          selected.pricePerPerson
                        )} P를 보관해요.`
                      : `최소 ${selected.minParticipants}명이 모이면 확정 투표가 열려요.`}
                  </p>
                  {profile && profile.mileageBalance < selected.pricePerPerson && (
                    <div className="low-balance">
                      마일리지가 부족해요.{" "}
                      <button onClick={() => open("charge")}>
                        충전하기 <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                  <button
                    className="primary full"
                    disabled={
                      busy ||
                      myMember.votedConfirm ||
                      selected.participants.length < selected.minParticipants ||
                      !profile ||
                      profile.mileageBalance < selected.pricePerPerson
                    }
                    onClick={() => act(() => voteConfirm(selected.id), "확정 동의가 반영되었어요.")}
                  >
                    {myMember.votedConfirm ? "동의 완료 · 친구들을 기다려요" : "팟 결성에 동의하기"}
                  </button>
                  <p className="form-hint">확정 후에는 탈퇴할 수 없고, 불참해도 환불되지 않아요.</p>
                </div>
              ) : null}
              {selected.status === "recruiting" && !myMember && (
                <>
                  <button
                    className="primary full"
                    disabled={
                      busy ||
                      selected.participants.length >= selected.maxParticipants ||
                      toMs(selected.departureTime) <= now ||
                      (!!profile && selected.gender !== profile.gender)
                    }
                    onClick={() => (authUser ? act(() => joinPod(selected.id), "팟에 참가했어요!") : open("login"))}
                  >
                    {selected.participants.length >= selected.maxParticipants
                      ? "모집 마감"
                      : toMs(selected.departureTime) <= now
                      ? "출발시간 경과 · 연장 대기"
                      : profile && selected.gender !== profile.gender
                      ? "등록 성별과 같은 팟만 참가할 수 있어요"
                      : authUser
                      ? "이 팟에 참가하기"
                      : "로그인하고 참가하기"}
                  </button>
                  <p className="form-hint">참가만으로 포인트가 차감되지는 않아요.</p>
                </>
              )}
              {selected.status === "recruiting" && myMember && (
                <button
                  className="danger-link"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        selected.hostUid === authUser?.uid
                          ? "호스트가 나가면 팟이 폐지되고 모두 탈퇴돼요. 계속할까요?"
                          : "이 팟에서 나갈까요?"
                      )
                    )
                      act(() => leavePod(selected.id), "팟에서 나왔어요.");
                  }}
                >
                  {selected.hostUid === authUser?.uid ? "팟 폐지하고 나가기" : "팟에서 나가기"}
                </button>
              )}
              {selected.status === "confirmed" && myMember && (
                <div className="vote-panel">
                  <h3>
                    <ShieldCheck size={20} />
                    도착했나요?
                  </h3>
                  <p>
                    참가자 전원이 도착을 확인하면 보관된 {money(selected.escrowTotal)} P 전액이 호스트에게 지급되고
                    이용이 종료돼요.
                  </p>
                  <strong>
                    {selected.participants.filter((m) => m.votedClose).length}/{selected.participants.length}명 도착 확인
                  </strong>
                  <button
                    className="primary full"
                    disabled={busy || myMember.votedClose}
                    onClick={() => act(() => voteClose(selected.id), "도착 확인이 반영되었어요.")}
                  >
                    {myMember.votedClose ? "확인 완료 · 친구들을 기다려요" : "도착 확인하기"}
                  </button>
                </div>
              )}
              {!active(selected) && (
                <div className="inline-info">
                  {selected.status === "closed" ? "정산이 완료되어 호스트에게 포인트를 지급했어요." : "폐지된 팟이에요. 포인트는 차감되지 않았어요."}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/**
 * 정류장/역을 타이핑으로 검색해 고를 수 있는 입력창. 네이티브 <input list>+<datalist>를
 * 써서 별도 라이브러리 없이 브라우저 자동완성을 활용한다. 표시는 이름, 실제 선택값은
 * onChange로 넘기는 station id — 목록에 없는 텍스트를 입력하면 선택값은 빈 문자열이 된다.
 */
function StationCombobox({
  id,
  label,
  icon,
  placeholder,
  value,
  onChange,
  stations,
  wrapInSearchField,
}: {
  id: string;
  label: string;
  icon?: ReactNode;
  placeholder: string;
  value: string;
  onChange: (stationId: string) => void;
  stations: StationDoc[];
  wrapInSearchField?: boolean;
}) {
  const selectedName = stations.find((s) => s.id === value)?.name ?? "";
  const [text, setText] = useState(selectedName);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(selectedName), [selectedName]);

  const query = text.trim();
  const matches = query ? stations.filter((s) => s.name.includes(query)) : stations;

  function select(station: StationDoc) {
    setText(station.name);
    onChange(station.id);
    setOpen(false);
  }

  // 네이티브 <input list>+<datalist>는 모바일 브라우저(특히 안드로이드)에서 앱 디자인과
  // 안 맞는 시스템 목록으로 렌더링되고 화면을 뒤덮어버려서, 직접 그리는 드롭다운으로 바꿨다.
  const inputAndList = (
    <div className="combobox">
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          const typed = e.target.value;
          setText(typed);
          setOpen(true);
          const match = stations.find((s) => s.name === typed);
          onChange(match ? match.id : "");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Enter" && open && matches.length > 0) {
            // 폼 안에서 Enter가 그대로 제출되지 않도록, 첫 번째 후보를 선택한다.
            e.preventDefault();
            select(matches[0]);
          }
        }}
      />
      {open && (
        <ul className="combobox-list">
          {matches.length > 0 ? (
            matches.map((s) => (
              <li key={s.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => select(s)}>
                  {s.name}
                </button>
              </li>
            ))
          ) : (
            <li className="combobox-empty">일치하는 정류장·역이 없어요</li>
          )}
        </ul>
      )}
    </div>
  );

  if (wrapInSearchField) {
    return (
      <div className="search-field">
        <label htmlFor={id}>
          {icon}
          {label}
        </label>
        {inputAndList}
      </div>
    );
  }
  return (
    <label>
      {label}
      {inputAndList}
    </label>
  );
}

function PodCard({
  pod: p,
  now,
  isMine,
  stationName,
  onClick,
}: {
  pod: ClientPod;
  now: number;
  isMine: boolean;
  stationName: (id: string) => string;
  onClick: () => void;
}) {
  const full = p.participants.length >= p.maxParticipants;
  const departed = toMs(p.departureTime) <= now;
  const mins = Math.max(0, Math.ceil((toMs(p.departureTime) - now) / 60000));
  return (
    <button
      className={`pod-card ${full && p.status === "recruiting" ? "full-pod" : ""}`}
      onClick={onClick}
      aria-label={`${stationName(p.departureStationId)}에서 ${stationName(p.arrivalStationId)}, ${genderLabel(
        p.gender
      )} 팟, ${money(p.pricePerPerson)} 포인트, 상세 보기`}
    >
      <div className="card-top">
        <div>
          <span className={`badge ${p.status !== "recruiting" || full ? "neutral" : "green"}`}>
            {p.status !== "recruiting" ? labels[p.status] : full ? "모집 마감" : departed ? "연장 대기" : "모집 중"}
          </span>
          <span className="gender-tag">{genderLabel(p.gender)} 팟</span>
        </div>
        {isMine ? (
          <span className="joined-tag">{active(p) ? "참여 중" : "이용 이력"}</span>
        ) : (
          mins > 0 &&
          mins <= 20 &&
          p.status === "recruiting" && (
            <span className="soon">
              <span />
              출발 임박
            </span>
          )
        )}
      </div>
      <div className="card-route">
        <div>
          <i className="route-dot" />
          <strong>{stationName(p.departureStationId)}</strong>
        </div>
        <div>
          <MapPin size={15} />
          <strong>{stationName(p.arrivalStationId)}</strong>
        </div>
      </div>
      <div className="card-schedule">
        <Clock3 size={14} />
        <strong>{timeOf(p.departureTime)}</strong>
        <span>출발</span>
        <i />
        {p.status === "recruiting" ? (mins > 0 ? `${mins}분 후` : "연장 대기") : labels[p.status]}
      </div>
      <div className="card-bottom">
        <span className="card-people">
          <Users size={16} />
          <strong>{p.participants.length}</strong>
          <span>/{p.maxParticipants}명</span>
          {p.participants.length < p.maxParticipants && p.status === "recruiting" && (
            <small>{p.maxParticipants - p.participants.length}자리 남음</small>
          )}
        </span>
        <span className="card-price">
          <small>1인 예상</small>
          <strong>
            {money(p.pricePerPerson)}
            <em> P</em>
          </strong>
        </span>
      </div>
    </button>
  );
}

function Empty({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return (
    <div className="empty">
      <span>
        <Compass size={28} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="primary" onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
