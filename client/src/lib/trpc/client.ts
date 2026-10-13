import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@projectmgmt/server';

/**
 * Typed tRPC React client. Consume as:
 *   const { data } = trpc.auth.me.useQuery();
 *
 * The `AppRouter` type flows in from @projectmgmt/server via the client
 * package's devDep, giving end-to-end type safety without a build step.
 */
export const trpc = createTRPCReact<AppRouter>();
