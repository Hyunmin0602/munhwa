export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status === 401) {
    // redirect to login
    const callback = typeof window !== "undefined" ? window.location.pathname : "/";
    window.location.href = `/login?callbackUrl=${encodeURIComponent(callback)}`;
    throw new Error("Unauthorized");
  }

  if (res.status >= 500) {
    // one retry
    const retry = await fetch(input, init);
    return retry;
  }
  return res;
}
