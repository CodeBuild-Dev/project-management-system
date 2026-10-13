export type ClientStatus = 'prospect' | 'active' | 'archived';

/** Default billing model the client is normally engaged on. */
export type PricingModel = 'hourly' | 'fixed';

/** Where the client came from. */
export type ClientSource =
  | 'fiverr'
  | 'upwork'
  | 'linkedin'
  | 'direct'
  | 'referral'
  | 'other';

export interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  notes: string | null;
  status: ClientStatus;
  /** ISO 4217 currency code (USD, EUR, GBP, …). */
  currency: string;
  /** Default hourly rate in minor units (cents). 0 = unset. */
  defaultHourlyRate: number;
  /** Default pricing model used to seed new projects for this client. */
  defaultPricingModel: PricingModel;
  /** Where this client came from — useful for funnel attribution. */
  source: ClientSource;
  color: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CreateClientInput {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  currency?: string;
  defaultHourlyRate?: number;
  defaultPricingModel?: PricingModel;
  source?: ClientSource;
  color?: string;
  avatarUrl?: string | null;
}

export interface UpdateClientInput {
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  notes?: string | null;
  status?: ClientStatus;
  currency?: string;
  defaultHourlyRate?: number;
  defaultPricingModel?: PricingModel;
  source?: ClientSource;
  color?: string;
  avatarUrl?: string | null;
}
