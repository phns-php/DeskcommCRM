"use client";

import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

export function useAdminUserPassword(userId: string) {
  return useMutation({
    mutationFn: (password: string) =>
      apiClient.post<{ data: { updated: true } }>(
        `/api/v1/admin/users/${userId}/password`,
        { password },
      ),
  });
}
