import type {
  ApiRequest,
  ApiResponse,
  MonthsaryAnswerItem,
  MonthsarySubmission,
  MonthsaryAnswersResponse
} from '../types';

let inMemorySubmissions: MonthsarySubmission[] = Array.isArray((globalThis as any).__ivraine_monthsary_submissions)
  ? (globalThis as any).__ivraine_monthsary_submissions
  : [];

export default async function handler(
  req: ApiRequest<any>,
  res: ApiResponse<MonthsaryAnswersResponse>
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  // GET: Fetch all Monthsary Quiz submissions
  if (req.method === 'GET') {
    let allSubmissions: MonthsarySubmission[] = [...inMemorySubmissions];

    if (sbUrl && sbKey) {
      try {
        const response = await fetch(
          `${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?action=eq.MONTHSARY_QUIZ_SUBMISSION&order=created_at.desc&limit=100`,
          {
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`
            }
          }
        );
        if (response.ok) {
          const rows = await response.json();
          if (Array.isArray(rows)) {
            for (const r of rows) {
              if (r.details) {
                try {
                  const parsed = JSON.parse(r.details);
                  if (parsed && parsed.id && Array.isArray(parsed.answers)) {
                    if (!allSubmissions.some(s => s.id === parsed.id)) {
                      allSubmissions.push(parsed);
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}
    }

    allSubmissions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    inMemorySubmissions = allSubmissions;
    (globalThis as any).__ivraine_monthsary_submissions = inMemorySubmissions;

    return res.status(200).json({
      status: 'ok',
      success: true,
      submissions: allSubmissions
    });
  }

  // POST: Record new Monthsary Quiz submission
  if (req.method === 'POST') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }

    const answers: MonthsaryAnswerItem[] = Array.isArray(body.answers) ? body.answers : [];
    if (answers.length === 0) {
      return res.status(400).json({
        status: 'error',
        success: false,
        error: 'No answers provided.'
      });
    }

    const user = typeof body.user === 'string' && body.user.trim() ? body.user.trim() : 'Loraine';
    const timestamp = typeof body.timestamp === 'string' ? body.timestamp : new Date().toISOString();
    const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : `ans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';
    const userAgent = (req.headers['user-agent'] as string) || '';

    const summaryParts = answers.map(a => `Q${a.questionId}: ${a.selectedKey}`);
    const summary = summaryParts.join(' • ');

    const newSubmission: MonthsarySubmission = {
      id,
      user,
      timestamp,
      answers,
      summary,
      ip,
      deviceId,
      userAgent
    };

    inMemorySubmissions = inMemorySubmissions.filter(s => s.id !== id);
    inMemorySubmissions.unshift(newSubmission);
    if (inMemorySubmissions.length > 500) inMemorySubmissions.length = 500;
    (globalThis as any).__ivraine_monthsary_submissions = inMemorySubmissions;

    // Save to Supabase
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
            section: 'Private Space',
            action: 'MONTHSARY_QUIZ_SUBMISSION',
            details: JSON.stringify(newSubmission),
            user_name: user,
            created_at: timestamp
          })
        });
      } catch {}
    }

    return res.status(200).json({
      status: 'ok',
      success: true,
      submission: newSubmission
    });
  }

  // DELETE: Delete a submission or clear all
  if (req.method === 'DELETE') {
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }

    const targetId = (req.query?.id as string) || body.id;

    if (!targetId) {
      return res.status(400).json({
        status: 'error',
        success: false,
        error: 'Missing submission id to delete.'
      });
    }

    if (targetId === 'all') {
      inMemorySubmissions = [];
      (globalThis as any).__ivraine_monthsary_submissions = inMemorySubmissions;

      if (sbUrl && sbKey) {
        try {
          await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?action=eq.MONTHSARY_QUIZ_SUBMISSION`, {
            method: 'DELETE',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`
            }
          });
        } catch {}
      }

      return res.status(200).json({
        status: 'ok',
        success: true,
        deletedId: 'all'
      });
    }

    // Delete specific submission
    inMemorySubmissions = inMemorySubmissions.filter(s => s.id !== targetId);
    (globalThis as any).__ivraine_monthsary_submissions = inMemorySubmissions;

    if (sbUrl && sbKey) {
      try {
        await fetch(
          `${sbUrl.replace(/\/+$/, '')}/rest/v1/ivraine_visitor_logs?action=eq.MONTHSARY_QUIZ_SUBMISSION&details=like.*${encodeURIComponent(targetId)}*`,
          {
            method: 'DELETE',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`
            }
          }
        );
      } catch {}
    }

    return res.status(200).json({
      status: 'ok',
      success: true,
      deletedId: targetId
    });
  }

  return res.status(405).json({
    status: 'error',
    success: false,
    error: 'Method not allowed'
  });
}
