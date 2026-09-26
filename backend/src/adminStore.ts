import { randomUUID } from 'node:crypto';

export interface VisitorLog {
  id: string;
  ip: string;
  section: 'Scrapbook' | 'Private Space' | 'Admin';
  action: string;
  details?: string;
  user?: string;
  userAgent?: string;
  dodgeCount?: number;
  latitude?: number | null;
  longitude?: number | null;
  fullAddress?: string;
  city?: string;
  country?: string;
  timestamp: string;
}

export interface AdminStats {
  totalVisits: number;
  uniqueIps: number;
  scrapbookVisits: number;
  spaceVisits: number;
  proposalAccepted: boolean;
  proposalAcceptedAt: string | null;
  totalDodges: number;
  recentIps: string[];
}

export class AdminStore {
  private logs: VisitorLog[] = [];
  private readonly maxLogs = 1000;
  private proposalAccepted = false;
  private proposalAcceptedAt: string | null = null;
  private totalDodges = 0;

  record(log: {
    ip: string;
    section: 'Scrapbook' | 'Private Space' | 'Admin';
    action: string;
    details?: string;
    user?: string;
    userAgent?: string;
    dodgeCount?: number;
    latitude?: number | null;
    longitude?: number | null;
    fullAddress?: string;
    city?: string;
    country?: string;
  }): VisitorLog {
    const entry: VisitorLog = {
      id: randomUUID(),
      ip: log.ip || '127.0.0.1',
      section: log.section || 'Scrapbook',
      action: log.action || 'Visit',
      details: log.details || '',
      user: log.user || 'Visitor',
      userAgent: log.userAgent || '',
      dodgeCount: Number(log.dodgeCount) || 0,
      latitude: typeof log.latitude === 'number' ? log.latitude : null,
      longitude: typeof log.longitude === 'number' ? log.longitude : null,
      fullAddress: log.fullAddress || '',
      city: log.city || '',
      country: log.country || '',
      timestamp: new Date().toISOString()
    };

    const actionLower = entry.action.toLowerCase();
    if (actionLower.includes('yes') || actionLower.includes('date with me: yes') || actionLower.includes('accepted')) {
      this.proposalAccepted = true;
      this.proposalAcceptedAt = entry.timestamp;
    }
    if (typeof entry.dodgeCount === 'number' && entry.dodgeCount > 0) {
      this.totalDodges += entry.dodgeCount;
    }

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.length = this.maxLogs;
    }
    return entry;
  }

  getLogs(): VisitorLog[] {
    return [...this.logs];
  }

  getStats(): AdminStats {
    const uniqueIps = new Set(this.logs.map(l => l.ip)).size;
    const scrapbookVisits = this.logs.filter(l => l.section === 'Scrapbook').length;
    const spaceVisits = this.logs.filter(l => l.section === 'Private Space').length;

    return {
      totalVisits: this.logs.length,
      uniqueIps,
      scrapbookVisits,
      spaceVisits,
      proposalAccepted: this.proposalAccepted,
      proposalAcceptedAt: this.proposalAcceptedAt,
      totalDodges: this.totalDodges,
      recentIps: Array.from(new Set(this.logs.slice(0, 25).map(l => l.ip)))
    };
  }

  setProposalAccepted(accepted: boolean) {
    this.proposalAccepted = accepted;
    this.proposalAcceptedAt = accepted ? new Date().toISOString() : null;
  }

  clear() {
    this.logs = [];
    this.totalDodges = 0;
  }
}

export const adminStore = new AdminStore();

export function extractClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers['x-forwarded-for'];
  let candidate = '';

  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    candidate = forwarded.split(',')[0].trim();
  } else if (Array.isArray(forwarded) && forwarded.length > 0 && typeof forwarded[0] === 'string') {
    candidate = forwarded[0].trim();
  }

  if (!candidate) {
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim().length > 0) {
      candidate = realIp.trim();
    }
  }

  if (!candidate) {
    candidate = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  if (candidate.startsWith('::ffff:')) {
    candidate = candidate.slice(7);
  }
  if (candidate === '::1') {
    candidate = '127.0.0.1';
  }

  return candidate || '127.0.0.1';
}
