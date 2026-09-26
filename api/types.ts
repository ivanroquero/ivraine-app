import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Standard Vercel Serverless / Node HTTP Request interface with typed body and query.
 */
export interface ApiRequest<TBody = any, TQuery = any> extends IncomingMessage {
  query?: TQuery;
  body?: TBody;
  cookies?: Record<string, string>;
  headers: IncomingMessage['headers'] & {
    'x-forwarded-for'?: string;
    'x-real-ip'?: string;
    'x-vercel-ip-latitude'?: string;
    'x-vercel-ip-longitude'?: string;
    'x-vercel-ip-city'?: string;
    'x-vercel-ip-country'?: string;
    'user-agent'?: string;
  };
}

/**
 * Standard Vercel Serverless / Node HTTP Response interface with chainable status and json helpers.
 */
export interface ApiResponse<TData = any> extends ServerResponse {
  status(statusCode: number): this;
  json(data: TData): void;
  send(body: any): void;
  end(): this;
}

export type ApiHandler<TReq = any, TRes = any> = (
  req: ApiRequest<TReq>,
  res: ApiResponse<TRes>
) => Promise<any> | any;

export type AppSection = 'Scrapbook' | 'Private Space' | 'Admin';

// -----------------------------------------------------------------------------
// Activity Log Entry Interface (Used across API & Admin)
// -----------------------------------------------------------------------------
export interface TrackLogEntry {
  id: string;
  ip: string;
  section: AppSection;
  action: string;
  details: string;
  user_name: string;
  user: string;
  user_agent: string;
  userAgent: string;
  deviceId: string;
  dodge_count: number;
  dodgeCount: number;
  latitude: number | null;
  longitude: number | null;
  full_address: string;
  fullAddress: string;
  city: string;
  country: string;
  created_at: string;
  timestamp: string;
}

// -----------------------------------------------------------------------------
// Endpoint 1: /api/date-location
// -----------------------------------------------------------------------------
export interface DateLocationRequestBody {
  deviceId?: string;
  user?: string;
  source?: AppSection | string;
  action?: string;
  removePin?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  gpsSource?: string | null;
  fullAddress?: string;
  city?: string;
  country?: string;
}

export interface DateLocationSuccessResponse {
  status: 'ok';
  success: true;
  latitude: number;
  longitude: number;
  fullAddress: string;
  city: string;
  country: string;
  log: TrackLogEntry;
}

export interface DateLocationRemoveResponse {
  status: 'ok';
  success: true;
  removed: true;
  deviceId: string;
}

export interface DateLocationErrorResponse {
  error: string;
}

export type DateLocationResponse =
  | DateLocationSuccessResponse
  | DateLocationRemoveResponse
  | DateLocationErrorResponse;

// -----------------------------------------------------------------------------
// Endpoint 2: /api/ip
// -----------------------------------------------------------------------------
export interface IpResponse {
  status: 'ok';
  ip: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  fullAddress: string;
}

// -----------------------------------------------------------------------------
// Endpoint 3: /api/track
// -----------------------------------------------------------------------------
export interface TrackRequestBody {
  section?: AppSection | string;
  action?: string;
  details?: string;
  user?: string;
  userName?: string;
  userAgent?: string;
  deviceId?: string;
  dodgeCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  gpsSource?: string | null;
  fullAddress?: string;
  full_address?: string;
  city?: string;
  country?: string;
}

export interface TrackSuccessResponse {
  status: 'ok';
  recorded: true;
  ip: string;
  section: AppSection;
  action: string;
  latitude: number | null;
  longitude: number | null;
  fullAddress: string;
  log: TrackLogEntry;
}

export interface TrackErrorResponse {
  error: string;
}

export type TrackResponse = TrackSuccessResponse | TrackErrorResponse;

// -----------------------------------------------------------------------------
// Endpoint 4: /api/admin/logs
// -----------------------------------------------------------------------------
export interface AdminLogItem {
  id: string;
  ip: string;
  section: AppSection;
  action: string;
  details: string;
  user: string;
  userAgent: string;
  deviceId: string;
  dodgeCount: number;
  latitude: number | null;
  longitude: number | null;
  fullAddress: string;
  city: string;
  country: string;
  timestamp: string;
}

export interface AdminStatsData {
  totalVisits: number;
  uniqueIps: number;
  scrapbookVisits: number;
  spaceVisits: number;
  proposalAccepted: boolean;
  proposalAcceptedAt: string | null;
  totalDodges: number;
  recentIps: string[];
}

export interface AdminLogsResponse {
  status: 'ok';
  logs: AdminLogItem[];
  stats: AdminStatsData;
  currentIp?: string;
}

// -----------------------------------------------------------------------------
// Endpoint 5: /api/admin/clear-logs
// -----------------------------------------------------------------------------
export interface AdminClearLogsResponse {
  status: 'ok';
  success: true;
}
