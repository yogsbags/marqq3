/**
 * Marketing Calendar content drafts (Marqq2 content_drafts parity).
 * Separate from contentStudio.js (SEO → Blog runs).
 */
import { getSupabaseWriteClient } from '../lib/supabase.js';

const CONTENT_PLATFORMS = new Set([
  'linkedin',
  'instagram',
  'facebook',
  'facebook_instagram',
  'twitter',
  'x',
  'reddit',
  'youtube',
  'blog',
  'website_blog',
  'email',
]);

export function normalizeContentPlatform(platform) {
  const raw = String(platform || '').toLowerCase().trim();
  if (raw === 'blog' || raw === 'wordpress' || raw === 'website') return 'website_blog';
  if (raw === 'twitter') return 'x';
  if (raw === 'meta') return 'facebook';
  if (raw === 'email') return 'website_blog';
  return raw;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

export function mapScheduledRow(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const platform = String(row.platform || payload.platform || 'linkedin');
  return {
    id: row.id,
    platform,
    platformId:
      platform === 'facebook_instagram'
        ? 'facebook'
        : platform === 'website_blog'
          ? 'blog'
          : platform === 'x'
            ? 'twitter'
            : platform,
    title: row.title || payload.title || 'Scheduled post',
    post: row.post || payload.post || '',
    cta: row.cta || payload.cta || '',
    hashtags: row.hashtags || payload.hashtags || [],
    image_url: payload.image_url || payload.cdn_url || null,
    publish_at: row.publish_at,
    status: row.status,
    scheduledFor: row.publish_at,
    agentName: 'riya',
    sectionTitle: row.title || `${platform} organic post`,
    agentTarget: 'social_posts',
    scheduleMode: 'once',
    kind: 'content',
  };
}

export async function listScheduledContent(companyId) {
  if (!companyId || !isUuid(companyId)) {
    return { items: [], note: !companyId ? 'companyId required' : 'companyId must be a workspace UUID' };
  }
  const sb = getSupabaseWriteClient();
  if (!sb) return { items: [], note: 'Database not available' };

  const { data, error } = await sb
    .from('content_drafts')
    .select('id, company_id, platform, mode, status, title, post, cta, hashtags, payload, publish_at, created_at')
    .eq('company_id', companyId)
    .eq('status', 'scheduled')
    .order('publish_at', { ascending: true })
    .limit(200);

  if (error) {
    if (error.code === '42P01') return { items: [], note: 'content_drafts table missing' };
    throw new Error(error.message);
  }
  return { items: (data || []).map(mapScheduledRow), count: (data || []).length };
}

export async function distributeContent({
  companyId,
  action = 'draft',
  live = false,
  platform,
  publishAt,
  payload = {},
  connector = null,
} = {}) {
  if (!companyId || !isUuid(companyId)) {
    const err = new Error('companyId must be a workspace UUID');
    err.status = 400;
    throw err;
  }
  if (!platform || !CONTENT_PLATFORMS.has(String(platform).toLowerCase())) {
    const err = new Error(`platform must be one of: ${[...CONTENT_PLATFORMS].join(', ')}`);
    err.status = 400;
    throw err;
  }
  const canonicalPlatform = normalizeContentPlatform(platform);
  const requested = String(action || 'draft').toLowerCase();
  const effectiveAction = requested === 'publish' && live !== true ? 'draft' : requested;
  if (!['draft', 'approve', 'schedule', 'publish'].includes(effectiveAction)) {
    const err = new Error('action must be draft, approve, schedule, or publish');
    err.status = 400;
    throw err;
  }
  if (effectiveAction === 'schedule' && !publishAt) {
    const err = new Error('publishAt is required for schedule mode');
    err.status = 400;
    throw err;
  }

  const sb = getSupabaseWriteClient();
  if (!sb) {
    const err = new Error('Database not available');
    err.status = 503;
    throw err;
  }

  const title = typeof payload?.title === 'string' ? payload.title : null;
  const post =
    typeof payload?.post === 'string'
      ? payload.post
      : typeof payload?.body === 'string'
        ? payload.body
        : null;
  const cta = typeof payload?.cta === 'string' ? payload.cta : null;
  const hashtags = Array.isArray(payload?.hashtags) ? payload.hashtags : [];
  const status =
    effectiveAction === 'schedule'
      ? 'scheduled'
      : ['approve', 'publish'].includes(effectiveAction)
        ? 'approved'
        : 'draft';
  const publish_at = effectiveAction === 'schedule' ? new Date(publishAt).toISOString() : null;

  const insertRow = {
    company_id: companyId,
    platform: canonicalPlatform,
    mode: effectiveAction === 'publish' ? 'draft' : effectiveAction,
    status: effectiveAction === 'publish' ? 'draft' : status,
    title,
    post,
    cta,
    hashtags,
    payload: payload || {},
    publish_at,
    approved_at: ['approve', 'schedule'].includes(effectiveAction) ? new Date().toISOString() : null,
  };

  let { data, error } = await sb
    .from('content_drafts')
    .insert(insertRow)
    .select('id, status, publish_at')
    .single();

  // Older schemas may reject optional columns nested in payload-only fields — retry minimal row
  if (error && /column|schema cache/i.test(error.message || '')) {
    ({ data, error } = await sb
      .from('content_drafts')
      .insert({
        company_id: companyId,
        platform: canonicalPlatform,
        mode: insertRow.mode,
        status: insertRow.status,
        title,
        post,
        payload: payload || {},
        publish_at,
      })
      .select('id, status, publish_at')
      .single());
  }

  if (error) {
    if (error.code === '42P01') {
      const err = new Error('content_drafts table not found — run Marqq2 content-drafts.sql in Supabase');
      err.status = 503;
      throw err;
    }
    const err = new Error(error.message);
    err.status = 500;
    throw err;
  }

  const platformLabel =
    canonicalPlatform === 'linkedin'
      ? 'LinkedIn'
      : canonicalPlatform === 'instagram'
        ? 'Instagram'
        : canonicalPlatform === 'facebook' || canonicalPlatform === 'facebook_instagram'
          ? 'Facebook'
          : canonicalPlatform === 'x'
            ? 'X'
            : canonicalPlatform === 'reddit'
              ? 'Reddit'
              : canonicalPlatform === 'youtube'
                ? 'YouTube'
                : 'Content';

  const summary =
    effectiveAction === 'schedule'
      ? `${platformLabel} draft scheduled for ${new Date(publishAt).toLocaleString()}`
      : effectiveAction === 'approve'
        ? `${platformLabel} draft approved`
        : effectiveAction === 'publish'
          ? `${platformLabel} saved as draft (live publish requires connectors)`
          : `${platformLabel} draft saved (ID: ${data?.id?.slice(0, 8) ?? '—'})`;

  return { id: data?.id, summary, platform: canonicalPlatform, publish_at, status: data?.status };
}

export async function rescheduleContent(id, companyId, publishAt) {
  if (!companyId || !isUuid(companyId)) {
    const err = new Error('companyId must be a workspace UUID');
    err.status = 400;
    throw err;
  }
  const next = new Date(publishAt);
  if (Number.isNaN(next.getTime())) {
    const err = new Error('publishAt must be a valid date');
    err.status = 400;
    throw err;
  }
  const sb = getSupabaseWriteClient();
  if (!sb) {
    const err = new Error('Database not available');
    err.status = 503;
    throw err;
  }
  const { data, error } = await sb
    .from('content_drafts')
    .update({ status: 'scheduled', mode: 'schedule', publish_at: next.toISOString(), last_error: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) {
    const err = new Error(error.message);
    err.status = 404;
    throw err;
  }
  return data;
}

export async function cancelScheduledContent(id, companyId) {
  if (!companyId || !isUuid(companyId)) {
    const err = new Error('companyId must be a workspace UUID');
    err.status = 400;
    throw err;
  }
  const sb = getSupabaseWriteClient();
  if (!sb) {
    const err = new Error('Database not available');
    err.status = 503;
    throw err;
  }
  const { data, error } = await sb
    .from('content_drafts')
    .update({ status: 'draft', mode: 'draft', publish_at: null, last_error: null })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'scheduled')
    .select('id, status, publish_at')
    .single();
  if (error) {
    const err = new Error(error.message);
    err.status = 404;
    throw err;
  }
  return data;
}
