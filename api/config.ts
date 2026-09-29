import type {
  ApiRequest,
  ApiResponse,
  AppConfig,
  AppConfigResponse,
  ProposalVisibility,
  DefaultEntryDestination,
  MonthsaryConfig
} from './types';

export const DEFAULT_MONTHSARY_CONFIG: MonthsaryConfig = {
  enabled: true,
  buttonVisibility: 'visible',
  letterTitle: 'Happy 1st Monthsary, My Love ♡',
  letterGreeting: 'Dearest Loraine,',
  letterBody: `Happy 1st Monthsary, my beautiful love! ✨

Can you believe it has already been 30 incredible days since September 2, 2026? Every single moment with you has felt like a dream I never want to wake up from. From our late-night conversations to the simple laughs that brighten my whole world, having you in my life is the greatest blessing I could ever ask for.

Thank you for your warmth, your pure heart, your gentle patience, and for loving me the way you do. You have turned ordinary days into unforgettable memories, and you make every single second worth cherishing.

This is only the very first page of our forever story. No matter what comes our way, I promise to hold your hand tighter, choose you every single day, and love you more than yesterday but less than tomorrow.

Happy 1st Month to us, my baby! Here is to a lifetime of love, laughter, and endless adventures with you.`,
  letterSignoff: 'Forever & Always Yours,\nIvan ♡',
  musicEnabled: true,
  vows: [
    'Promise to always make you smile even on the hardest days.',
    'Promise to listen to your stories with my whole heart.',
    'Promise to choose you and only you, today and for all our tomorrows.'
  ]
};

const DEFAULT_CONFIG: AppConfig = {
  proposalVisibility: 'visible',
  defaultEntry: 'scrapbook',
  monthsary: DEFAULT_MONTHSARY_CONFIG,
  updatedAt: new Date().toISOString(),
  updatedBy: 'System'
};

export default async function handler(
  req: ApiRequest<Partial<AppConfig>>,
  res: ApiResponse<AppConfigResponse>
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  const forwarded = req.headers['x-forwarded-for'];
  let ip = '127.0.0.1';
  if (typeof forwarded === 'string' && forwarded.trim()) {
    ip = forwarded.split(',')[0].trim();
  } else if (req.headers['x-real-ip']) {
    ip = String(req.headers['x-real-ip']).trim();
  } else if (req.socket?.remoteAddress) {
    ip = req.socket.remoteAddress;
  }
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';

  let inMemoryConfig: AppConfig = (globalThis as any).__ivraine_app_config || { ...DEFAULT_CONFIG };

  // GET: Fetch current global configuration
  if (req.method === 'GET') {
    if (sbUrl && sbKey) {
      try {
        const response = await fetch(
          `${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?action=eq.APP_CONFIG_UPDATE&order=created_at.desc&limit=1`,
          {
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`
            }
          }
        );
        if (response.ok) {
          const rows = await response.json();
          if (Array.isArray(rows) && rows.length > 0 && rows[0].details) {
            try {
              const parsed = JSON.parse(rows[0].details);
              if (parsed && typeof parsed === 'object') {
                inMemoryConfig = {
                  proposalVisibility: ['visible', 'hidden', 'removed'].includes(parsed.proposalVisibility)
                    ? parsed.proposalVisibility
                    : inMemoryConfig.proposalVisibility,
                  defaultEntry: ['scrapbook', 'space'].includes(parsed.defaultEntry)
                    ? parsed.defaultEntry
                    : inMemoryConfig.defaultEntry,
                  monthsary: parsed.monthsary && typeof parsed.monthsary === 'object'
                    ? { ...DEFAULT_MONTHSARY_CONFIG, ...parsed.monthsary }
                    : inMemoryConfig.monthsary || DEFAULT_MONTHSARY_CONFIG,
                  updatedAt: rows[0].created_at || inMemoryConfig.updatedAt,
                  updatedBy: rows[0].user_name || inMemoryConfig.updatedBy
                };
                (globalThis as any).__ivraine_app_config = inMemoryConfig;
              }
            } catch {}
          }
        }
      } catch {}
    }

    return res.status(200).json({
      status: 'ok',
      success: true,
      config: inMemoryConfig
    });
  }

  // POST: Update global configuration
  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }

    const nextVisibility: ProposalVisibility = ['visible', 'hidden', 'removed'].includes(body.proposalVisibility as string)
      ? (body.proposalVisibility as ProposalVisibility)
      : inMemoryConfig.proposalVisibility;

    const nextDefaultEntry: DefaultEntryDestination = ['scrapbook', 'space'].includes(body.defaultEntry as string)
      ? (body.defaultEntry as DefaultEntryDestination)
      : inMemoryConfig.defaultEntry;

    const nextMonthsary: MonthsaryConfig = body.monthsary && typeof body.monthsary === 'object'
      ? {
          ...DEFAULT_MONTHSARY_CONFIG,
          ...(inMemoryConfig.monthsary || {}),
          ...body.monthsary,
          updatedAt: new Date().toISOString(),
          updatedBy: body.updatedBy || 'Admin'
        }
      : inMemoryConfig.monthsary || DEFAULT_MONTHSARY_CONFIG;

    const updatedConfig: AppConfig = {
      proposalVisibility: nextVisibility,
      defaultEntry: nextDefaultEntry,
      monthsary: nextMonthsary,
      updatedAt: new Date().toISOString(),
      updatedBy: body.updatedBy || 'Admin'
    };

    (globalThis as any).__ivraine_app_config = updatedConfig;

    if (sbUrl && sbKey) {
      try {
        await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({
            ip,
            section: 'Admin',
            action: 'APP_CONFIG_UPDATE',
            details: JSON.stringify(updatedConfig),
            user_name: updatedConfig.updatedBy || 'Admin',
            created_at: updatedConfig.updatedAt
          })
        });
      } catch {}
    }

    return res.status(200).json({
      status: 'ok',
      success: true,
      config: updatedConfig
    });
  }

  return res.status(405).json({
    status: 'error',
    config: inMemoryConfig,
    error: 'Method not allowed'
  });
}
