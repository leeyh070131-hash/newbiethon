import type { Auth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = Object.values(config).every(Boolean);

let client: { auth: Auth; provider: GoogleAuthProvider; signIn: typeof signInWithPopup; signOut: typeof signOut } | undefined;
let preparing: Promise<void> | undefined;

// 로그인 창을 열 때만 SDK를 가져옵니다. 버튼 클릭 전에 준비하여 Safari의 팝업 차단을 피합니다.
export function prepareGoogleLogin(): Promise<void> {
  if (!firebaseConfigured) return Promise.reject(new Error("Firebase 설정이 필요해요."));
  return preparing ??= Promise.all([import("firebase/app"), import("firebase/auth")]).then(([appSdk, authSdk]) => {
    const app = appSdk.getApps()[0] ?? appSdk.initializeApp(config);
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    client = { auth: authSdk.getAuth(app), provider, signIn: authSdk.signInWithPopup, signOut: authSdk.signOut };
  }).catch(error => { preparing = undefined; throw error; });
}

export async function googleLogin() {
  if (!firebaseConfigured) throw new Error("Firebase 설정 후 Google 로그인을 사용할 수 있어요.");
  if (!client) throw new Error("로그인 준비가 끝나면 다시 시도해 주세요.");
  return (await client.signIn(client.auth, client.provider)).user;
}

export async function googleLogout() {
  if (client) await client.signOut(client.auth);
}
