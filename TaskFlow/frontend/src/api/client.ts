import { useAuth } from "../state/auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export type ApiError = { error: string; fields?: Record<string, string> };

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers ?? {})
    }
  });

  if (res.status === 204) return undefined as T;

  const data = (await res.json()) as any;
  if (!res.ok) throw data as ApiError;
  return data as T;
}

export function useApi() {
  const { token } = useAuth();
  return {
    get: <T,>(path: string) => apiFetch<T>(path, { method: "GET", token }),
    post: <T,>(path: string, body: unknown) =>
      apiFetch<T>(path, { method: "POST", body: JSON.stringify(body), token }),
    patch: <T,>(path: string, body: unknown) =>
      apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),
    del: <T,>(path: string) => apiFetch<T>(path, { method: "DELETE", token })
  };
}
