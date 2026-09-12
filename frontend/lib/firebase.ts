import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);

// 실제 로그인 세션을 새로고침 후에도 복원해야 하므로(체험판과 달리) 앱 시작 시 즉시 초기화한다.
const app = firebaseConfigured ? (getApps()[0] ?? initializeApp(config)) : undefined;
const auth = app ? getAuth(app) : undefined;
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

/** 로그인 상태 변화를 구독한다. 앱 시작 시 세션이 남아있으면 자동으로 콜백이 호출된다. */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function googleLogin(): Promise<User> {
  if (!auth) throw new Error("Firebase 설정 후 Google 로그인을 사용할 수 있어요.");
  return (await signInWithPopup(auth, provider)).user;
}

export async function googleLogout(): Promise<void> {
  if (auth) await signOut(auth);
}

/** API 호출용 Firebase ID 토큰. 로그인되어 있지 않으면 null. */
export async function getIdToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken();
}
