import { useState, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from './client';

/**
 * Auth migrated to an HttpOnly + SameSite=Strict + Secure cookie set by the
 * server. JS can no longer read or write the access token, so there is no
 * tokenStore here — every request just has to opt in to cookies via
 * `credentials: 'include'`. One-time cleanup of the legacy localStorage key
 * runs on AuthProvider mount.
 */

function apiUrl(): string {
  // In Vite dev the Vite proxy forwards /api/* to the server (see vite.config).
  // In prod the Express process serves both the SPA and /api/trpc.
  return '/api/trpc';
}

export function TrpcProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: apiUrl(),
          transformer: superjson,
          fetch(url, options) {
            // Forward the auth cookie on every request. With SameSite=Strict
            // browsers only attach it to same-site requests, which is what
            // we want.
            return fetch(url, { ...options, credentials: 'include' });
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
