import { router } from './trpc.js';
import { healthRouter } from './routers/health.js';
import { authRouter } from './routers/auth.js';
import { workspaceRouter } from './routers/workspace.js';
import { boardRouter } from './routers/board.js';
import { taskGroupRouter } from './routers/task-group.js';
import { taskRouter } from './routers/task.js';
import { taskUpdateRouter } from './routers/task-update.js';
import { membershipRouter } from './routers/membership.js';
import { userRouter } from './routers/user.js';
import { activityRouter } from './routers/activity.js';
import { notificationRouter } from './routers/notification.js';
import { searchRouter } from './routers/search.js';
import { systemRouter } from './routers/system.js';
import { automationRouter } from './routers/automation.js';
import { clientRouter } from './routers/client.js';
import { timeEntryRouter } from './routers/time-entry.js';
import { expenseRouter } from './routers/expense.js';
import { reportsRouter } from './routers/reports.js';
import { boardCredentialRouter } from './routers/board-credential.js';

/**
 * Root tRPC router. Domain services land under namespaces matching the entity.
 */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  workspace: workspaceRouter,
  board: boardRouter,
  boardCredential: boardCredentialRouter,
  group: taskGroupRouter,
  task: taskRouter,
  taskUpdate: taskUpdateRouter,
  member: membershipRouter,
  user: userRouter,
  activity: activityRouter,
  notification: notificationRouter,
  search: searchRouter,
  system: systemRouter,
  automation: automationRouter,
  /** Plural namespace — `client` collides with a tRPC-internal property on the root router. */
  clients: clientRouter,
  timeEntries: timeEntryRouter,
  expenses: expenseRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
