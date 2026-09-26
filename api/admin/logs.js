export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let logs = [];
  if (sbUrl && sbKey) {
    try {
      const response = await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?select=*&order=created_at.desc&limit=300`, {
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
            const devMatch = (row.details || '').match(/\[Device:\s*([a-zA-Z0-9_\-]+)\]/);
            return {
              id: row.id,
              ip: row.ip || '127.0.0.1',
              section: row.section || 'Scrapbook',
              action: row.action || 'Visit',
              details: row.details || '',
              user: row.user_name || 'Visitor',
              userAgent: row.user_agent || '',
              deviceId: row.device_id || (devMatch ? devMatch[1] : ''),
              dodgeCount: row.dodge_count || 0,
              latitude: typeof row.latitude === 'number' ? row.latitude : null,
              longitude: typeof row.longitude === 'number' ? row.longitude : null,
              fullAddress: row.full_address || '',
              city: row.city || '',
              country: row.country || '',
              timestamp: row.created_at || new Date().toISOString()
            };
          });
        }
      }
    } catch {}
  }

  // Merge with memory cache
  const memoryLogs = Array.isArray(globalThis.__ivraine_logs) ? globalThis.__ivraine_logs : [];
  const existingIds = new Set(logs.map(l => l.id || `${l.ip}_${l.action}_${l.timestamp}`));
  for (const mem of memoryLogs) {
    const key = mem.id || `${mem.ip}_${mem.action}_${mem.timestamp}`;
    if (!existingIds.has(key)) {
      logs.unshift(mem);
      existingIds.add(key);
    }
  }

  logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Deduplicate location logs so each device has at most 1 location pin!
  const seenLocationDevices = new Set();
  const dedupedLogs = [];

  for (const log of logs) {
    const hasLocation = log.latitude != null && log.longitude != null;
    if (!hasLocation) {
      dedupedLogs.push(log);
      continue;
    }

    const devId = log.deviceId || ((log.details || '').match(/\[Device:\s*([a-zA-Z0-9_\-]+)\]/)?.[1]) || '';
    let devKey = devId ? `device_${devId}` : '';
    if (!devKey) {
      const user = (log.user || '').toLowerCase();
      const ip = (log.ip || '').toLowerCase();
      if (user.includes('loraine') || ip.includes('saved') || ip.includes('live') || ip.includes('client')) {
        devKey = 'device_loraine_phone';
      } else {
        const ua = (log.userAgent || '').toLowerCase();
        const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
        devKey = `device_${log.ip || 'ip'}_${isMobile ? 'mobile' : 'desktop'}`;
      }
    }

    if (!seenLocationDevices.has(devKey)) {
      seenLocationDevices.add(devKey);
      dedupedLogs.push(log);
    }
  }

  logs = dedupedLogs;

  const uniqueIps = new Set(logs.map(l => l.ip)).size;
  const scrapbookVisits = logs.filter(l => l.section === 'Scrapbook').length;
  const spaceVisits = logs.filter(l => l.section === 'Private Space').length;
  const proposalLog = logs.find(l => l.action.toLowerCase().includes('yes'));

  return res.status(200).json({
    status: 'ok',
    logs,
    stats: {
      totalVisits: logs.length,
      uniqueIps,
      scrapbookVisits,
      spaceVisits,
      proposalAccepted: !!proposalLog,
      proposalAcceptedAt: proposalLog ? proposalLog.timestamp : null,
      totalDodges: logs.reduce((sum, l) => sum + (l.dodgeCount || 0), 0),
      recentIps: Array.from(new Set(logs.slice(0, 25).map(l => l.ip)))
    }
  });
}
