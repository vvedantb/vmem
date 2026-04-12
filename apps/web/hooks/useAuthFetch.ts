"use client";

import { useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

export function useAuthFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers });
    },
    [getToken],
  );
}
