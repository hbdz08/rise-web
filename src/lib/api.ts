export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; message: string };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResponse<T>> {
  const res = await fetch(input, {
    // Ensure session cookie is included (and Set-Cookie is honored) in all API calls.
    credentials: init?.credentials ?? "include",
    ...init,
  });
  const json = (await res.json()) as ApiResponse<T>;
  return json;
}
