/**
 * A stored credential for a third-party tool used on a project (e.g. the
 * client's WordPress admin login, Stripe dashboard, hosting panel, CRM).
 * The password is encrypted at rest; the API returns it only on an
 * explicit reveal request via `getById`.
 */
export interface BoardCredential {
  id: string;
  boardId: string;
  label: string;
  username: string | null;
  url: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** Same as BoardCredential but with the decrypted password attached. */
export interface BoardCredentialReveal extends BoardCredential {
  password: string;
}

export interface CreateBoardCredentialInput {
  boardId: string;
  label: string;
  username?: string | null;
  url?: string | null;
  notes?: string | null;
  /** Plaintext password — server seals it before storing. */
  password: string;
}

export interface UpdateBoardCredentialInput {
  label?: string;
  username?: string | null;
  url?: string | null;
  notes?: string | null;
  /** When omitted, the existing sealed secret is left alone. */
  password?: string;
}
