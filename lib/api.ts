export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5003";

const TOKEN_KEY = "accessToken";

export class ApiError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

type ApiOptions = Omit<RequestInit, "body"> & {
  json?: unknown;
  skipAuth?: boolean;
  body?: BodyInit | null;
};

function redirectToLogin() {
  clearToken();
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.replace("/login");
}

function canRecoverSession(path: string, skipAuth?: boolean) {
  if (skipAuth) return false;
  return path !== "/auth/login" && path !== "/auth/refresh" && path !== "/auth/logout";
}

let inflightRefresh: Promise<boolean> | null = null;

async function recoverSession(): Promise<boolean> {
  if (!inflightRefresh) {
    inflightRefresh = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return false;
        const payload = (await res.json()) as { accessToken?: string };
        if (!payload.accessToken) return false;
        setToken(payload.accessToken);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const payload = (await res.json()) as {
        error?: { code?: string; message?: string };
      };
      throw new ApiError(
        payload.error?.code ?? "REQUEST_FAILED",
        payload.error?.message ?? res.statusText
      );
    }
    throw new ApiError("REQUEST_FAILED", res.statusText || "Request gagal");
  }

  if (res.status === 204) return undefined as T;
  if (!isJson) return (await res.text()) as T;
  return (await res.json()) as T;
}

async function send<T>(
  path: string,
  init: RequestInit,
  skipAuth?: boolean,
  retry = true
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!skipAuth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (res.status === 401 && canRecoverSession(path, skipAuth)) {
    if (retry && (await recoverSession())) {
      return send<T>(path, init, skipAuth, false);
    }
    redirectToLogin();
  }

  return parseResponse<T>(res);
}

export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { json, skipAuth, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return send<T>(
    path,
    {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    },
    skipAuth
  );
}

export async function apiFormData<T = unknown>(
  path: string,
  formData: FormData,
  method: "POST" | "PATCH" = "POST"
): Promise<T> {
  return send<T>(path, { method, body: formData });
}

export async function downloadCsv(
  path: string,
  filename = "report.csv",
  retried = false
): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { credentials: "include", headers });
  if (res.status === 401) {
    if (!retried && (await recoverSession())) {
      return downloadCsv(path, filename, true);
    }
    redirectToLogin();
    return;
  }
  if (!res.ok) {
    await parseResponse(res);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadExportCsv(
  query: Record<string, string>
): Promise<void> {
  const params = new URLSearchParams(query);
  return downloadCsv(`/api/reports/export.csv?${params.toString()}`, "report.csv");
}
