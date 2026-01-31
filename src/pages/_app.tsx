import type { AppProps } from "next/app";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

import "@/styles/semi.css";
import "@/styles/globals.css";

import { clearAdminAuthFromStorage, writeAdminAuthToStorage } from "@/lib/auth";

const AdminLayout = dynamic(() => import("@/components/admin/AdminLayout"), { ssr: false });

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  const isAdminRoute = useMemo(
    () => router.pathname.startsWith("/admin") && router.pathname !== "/admin/login",
    [router.pathname],
  );

  const isBrowser = typeof window !== "undefined";
  const [adminReady, setAdminReady] = useState(!isAdminRoute);

  useEffect(() => {
    if (!isAdminRoute) return;
    if (!isBrowser) return;
    setAdminReady(false);

    void (async () => {
      try {
        const res = await fetch("/api/admin/auth/me", { credentials: "include" });
        const json = (await res.json()) as
          | { ok: true; data: { username: string; role: "HR_ADMIN" | "HR_OPERATOR" } }
          | { ok: false; message: string };

        if (!json.ok) {
          clearAdminAuthFromStorage(localStorage);
          const next = encodeURIComponent(router.asPath);
          router.replace(`/admin/login?next=${next}`);
          return;
        }

        // Cache for UI display only. Authorization is cookie-based.
        writeAdminAuthToStorage(localStorage, {
          username: json.data.username,
          role: json.data.role,
          issuedAt: Date.now(),
        });
        setAdminReady(true);
      } catch {
        clearAdminAuthFromStorage(localStorage);
        const next = encodeURIComponent(router.asPath);
        router.replace(`/admin/login?next=${next}`);
      }
    })();
  }, [isAdminRoute, isBrowser, router]);

  const page = <Component {...pageProps} />;

  if (!isAdminRoute) return page;
  if (!isBrowser) return null;
  if (!adminReady) return null;
  return <AdminLayout>{page}</AdminLayout>;
}
