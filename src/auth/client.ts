/** Talks to the AudEx sign-in endpoints. Every message here is written for a non-technical reader. */

export interface Me { id: string; username: string; displayName: string; email: string; phone: string | null }
export interface Session { token: string; expiresAt: string; user: Me }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
  /** status 0 = the server could not be reached at all */
  get offline() { return this.status === 0; }
}

export interface HttpResponse { ok: boolean; status: number; json(): Promise<unknown>; text?(): Promise<string> }
export type Fetch = (url: string, init?: RequestInit) => Promise<HttpResponse>;

const FALLBACK: Record<number, string> = {
  400: "Something in the form is not right. Please check it and try again.",
  401: "Please sign in.",
  403: "That was not allowed.",
  409: "That has already been done.",
  429: "Too many attempts. Please wait a few minutes and try again.",
};
const OFFLINE = "Could not reach the server. Please check your internet connection and try again.";

export function createAuthApi(base: string, f: Fetch = (u, i) => fetch(u, i), token: () => string | null = () => null) {
  async function call<T>(method: string, path: string, body?: unknown, withToken = false): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const t = withToken ? token() : null;
    if (t) headers["Authorization"] = `Bearer ${t}`;
    let res: HttpResponse;
    try { res = await f(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new ApiError(0, OFFLINE); }
    let data: unknown = null;
    try { data = res.status === 204 ? null : await res.json(); } catch { /* empty or not JSON */ }
    if (!res.ok) {
      const msg = typeof (data as { message?: unknown })?.message === "string" ? (data as { message: string }).message : "";
      throw new ApiError(res.status, msg || FALLBACK[res.status] || "Something went wrong on the server. Please try again in a moment.");
    }
    return data as T;
  }
  type Msg = { message: string };
  return {
    status: () => call<{ setupRequired: boolean }>("GET", "/api/auth/status"),
    setup: (b: { code: string; username: string; email: string; displayName: string; password: string }) => call<Session>("POST", "/api/auth/setup", b),
    login: (username: string, password: string) => call<Session>("POST", "/api/auth/login", { username, password }),
    logout: () => call<null>("POST", "/api/auth/logout", undefined, true),
    logoutAll: () => call<null>("POST", "/api/auth/logout-all", undefined, true),
    forgotUsername: (email: string) => call<Msg>("POST", "/api/auth/forgot-username", { email }),
    forgotPassword: (identifier: string) => call<Msg>("POST", "/api/auth/forgot-password", { identifier }),
    resetPassword: (resetToken: string, password: string) => call<Msg>("POST", "/api/auth/reset-password", { token: resetToken, password }),
    me: () => call<Me>("GET", "/api/me", undefined, true),
    updateMe: (b: { displayName: string; email: string; phone: string; currentPassword?: string }) => call<Me>("PATCH", "/api/me", b, true),
    changePassword: (currentPassword: string, newPassword: string) => call<null>("POST", "/api/me/password", { currentPassword, newPassword }, true),
  };
}
export type AuthApi = ReturnType<typeof createAuthApi>;
