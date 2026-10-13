/**
 * Compile-time feature flags. Solo-freelance-mode is the default — flip
 * COLLABORATION_ENABLED to `true` to bring the multi-user UI back (member
 * management in Admin, invite wizard, assignee picker on tasks, @mention
 * autocomplete in updates, Members tab in ManageWorkspaceDialog).
 *
 * The underlying backend still supports collaboration; this only gates the
 * UI surface area so a solo user isn't distracted by features they won't use.
 */
export const COLLABORATION_ENABLED = false;
