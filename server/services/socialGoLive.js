/**
 * Social organic go-live — Marqq2 outcome-go-live subset.
 * LinkedIn · Instagram · Facebook · X/Twitter · YouTube
 * User/agent click only — never auto-publishes.
 */

import { executeComposioAction } from './composio.js';

export const SOCIAL_KIND_CONNECTORS = {
  linkedin: ['linkedin'],
  instagram: ['instagram'],
  facebook: ['facebook'],
  twitter: ['twitter'],
  x: ['twitter'],
  youtube: ['youtube'],
  social: ['linkedin', 'instagram', 'facebook', 'twitter', 'youtube'],
};

function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function pickPayloadText(payload = {}) {
  return (
    asString(payload.post) ||
    asString(payload.body) ||
    asString(payload.commentary) ||
    asString(payload.text) ||
    asString(payload.message) ||
    asString(payload.caption) ||
    asString(payload.html) ||
    ''
  );
}

function extractUrl(result) {
  const r = result?.result || result?.data || result || {};
  return (
    r.url ||
    r.link ||
    r.permalink ||
    r.webViewLink ||
    r.post_url ||
    r.shareUrl ||
    r.publishedUrl ||
    (r.id && String(r.id).includes('http') ? r.id : null) ||
    null
  );
}

async function runTool(slug, args, companyId, toolkitHint = null) {
  const result = await executeComposioAction(slug, args, companyId, toolkitHint);
  if (result?.error) {
    return { ok: false, error: result.error, tool: slug, raw: result };
  }
  return {
    ok: true,
    tool: slug,
    url: extractUrl(result),
    result: result?.result || result?.data || result,
  };
}

async function connectorActive(companyId, connectorId) {
  try {
    const { resolveConnectedAccountId } = await import('./composio.js');
    const toolkit =
      connectorId === 'twitter'
        ? 'twitter'
        : connectorId === 'google_drive'
          ? 'googledrive'
          : connectorId;
    await resolveConnectedAccountId(toolkit, companyId);
    return true;
  } catch {
    return false;
  }
}

async function connectedSet(companyId) {
  const ids = Object.keys(SOCIAL_KIND_CONNECTORS).filter((k) => k !== 'social' && k !== 'x');
  const set = new Set();
  for (const id of ids) {
    if (await connectorActive(companyId, id)) set.add(id);
  }
  return set;
}

function chooseConnector(kind, connected, preferred) {
  const candidates = SOCIAL_KIND_CONNECTORS[kind] || [];
  if (preferred && candidates.includes(preferred) && connected.has(preferred)) return preferred;
  return candidates.find((id) => connected.has(id)) || null;
}

export async function goLiveLinkedIn(payload, companyId) {
  const text = pickPayloadText(payload);
  if (!text) return { ok: false, error: 'Post text is empty' };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => String(h).replace(/^#/, '')).filter(Boolean)
    : [];
  const cta = asString(payload.cta);
  const full = [text, hashtags.length ? hashtags.map((h) => `#${h}`).join(' ') : '', cta]
    .filter(Boolean)
    .join('\n\n');

  let res = await runTool(
    'LINKEDIN_CREATE_LINKED_IN_POST',
    { commentary: full, text: full, visibility: 'PUBLIC' },
    companyId,
    'linkedin'
  );
  if (!res.ok) {
    res = await runTool(
      'LINKEDIN_CREATE_TEXT_POST',
      { text: full, visibility: 'PUBLIC' },
      companyId,
      'linkedin'
    );
  }
  return res;
}

export async function goLiveFacebook(payload, companyId) {
  const message = pickPayloadText(payload);
  if (!message) return { ok: false, error: 'Post text is empty' };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => `#${String(h).replace(/^#/, '')}`).join(' ')
    : '';
  const full = [message, hashtags, asString(payload.cta)].filter(Boolean).join('\n\n');
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);
  const videoUrl = asString(payload.video_url || payload.videoUrl || payload.video);
  const pageId = asString(payload.page_id || payload.pageId) || undefined;

  if (videoUrl) {
    const video = await runTool(
      'FACEBOOK_CREATE_VIDEO_POST',
      {
        description: full,
        message: full,
        title: asString(payload.title || payload.headline) || undefined,
        file_url: videoUrl,
        video_url: videoUrl,
        url: videoUrl,
        page_id: pageId,
      },
      companyId,
      'facebook'
    );
    if (video.ok) return { ...video, tool: 'FACEBOOK_CREATE_VIDEO_POST' };
    if (!imageUrl) return video;
  }

  if (imageUrl) {
    const photo = await runTool(
      'FACEBOOK_CREATE_PHOTO_POST',
      { message: full, url: imageUrl, image_url: imageUrl, caption: full, page_id: pageId },
      companyId,
      'facebook'
    );
    if (photo.ok) return photo;
    const photoAlt = await runTool(
      'FACEBOOK_CREATE_POST',
      {
        message: full,
        message_text: full,
        url: imageUrl,
        link: imageUrl,
        image_url: imageUrl,
        page_id: pageId,
      },
      companyId,
      'facebook'
    );
    if (photoAlt.ok) return photoAlt;
  }

  return runTool(
    'FACEBOOK_CREATE_POST',
    { message: full, message_text: full, page_id: pageId },
    companyId,
    'facebook'
  );
}

export async function goLiveTwitter(payload, companyId) {
  const text = pickPayloadText(payload);
  if (!text) return { ok: false, error: 'Post text is empty' };
  const hashtags = Array.isArray(payload.hashtags)
    ? payload.hashtags.map((h) => `#${String(h).replace(/^#/, '')}`).join(' ')
    : '';
  const full = [text, hashtags, asString(payload.cta)].filter(Boolean).join('\n\n').slice(0, 280);
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);

  const args = { text: full, tweet_text: full, status: full };
  if (imageUrl) {
    args.media_url = imageUrl;
    args.image_url = imageUrl;
  }

  let res = await runTool('TWITTER_CREATION_OF_A_POST', args, companyId, 'twitter');
  if (!res.ok) res = await runTool('TWITTER_CREATE_TWEET', args, companyId, 'twitter');
  if (!res.ok) res = await runTool('X_CREATE_TWEET', args, companyId, 'twitter');
  return res;
}

export async function goLiveYoutube(payload, companyId) {
  const title = asString(payload.title || payload.headline);
  const description = pickPayloadText(payload);
  const videoUrl = asString(payload.video_url || payload.videoUrl || payload.url || payload.video);
  if (!title) return { ok: false, error: 'YouTube publishing needs a video title' };
  if (!videoUrl && !payload.video_file && !payload.file) {
    return { ok: false, error: 'YouTube publishing needs a video URL or uploaded file' };
  }
  const args = {
    title,
    description,
    video_url: videoUrl || undefined,
    videoUrl: videoUrl || undefined,
    privacy_status: asString(payload.privacy_status || payload.privacyStatus, 'private'),
    category_id: asString(payload.category_id || payload.categoryId) || undefined,
    tags: Array.isArray(payload.tags) ? payload.tags : undefined,
  };
  let result = await runTool('YOUTUBE_UPLOAD_VIDEO', args, companyId, 'youtube');
  if (!result.ok) result = await runTool('YOUTUBE_MULTIPART_UPLOAD_VIDEO', args, companyId, 'youtube');
  return result;
}

export async function goLiveInstagram(payload, companyId) {
  const caption = pickPayloadText(payload);
  const imageUrl =
    asString(payload.image_url) ||
    asString(payload.cdn_url) ||
    asString(payload.media_url) ||
    asString(payload.image);
  const videoUrl = asString(payload.video_url || payload.videoUrl || payload.video);
  if (!imageUrl && !videoUrl) {
    return {
      ok: false,
      error:
        'Instagram publish needs an image_url or video_url. Attach a Creative Studio asset URL first.',
      tool: 'INSTAGRAM_POST_IG_USER_MEDIA',
    };
  }
  const create = await runTool(
    'INSTAGRAM_POST_IG_USER_MEDIA',
    {
      image_url: imageUrl || undefined,
      video_url: videoUrl || undefined,
      caption: caption || undefined,
      media_type: videoUrl ? 'REELS' : 'IMAGE',
    },
    companyId,
    'instagram'
  );
  if (!create.ok) {
    const alt = await runTool(
      'INSTAGRAM_CREATE_POST',
      {
        image_url: imageUrl || undefined,
        video_url: videoUrl || undefined,
        caption,
        media_type: videoUrl ? 'REELS' : 'IMAGE',
      },
      companyId,
      'instagram'
    );
    if (!alt.ok) return create;
    return alt;
  }
  const creationId =
    create.result?.id || create.result?.creation_id || create.result?.container_id || null;
  if (creationId) {
    const pub = await runTool(
      'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
      { creation_id: creationId, media_container_id: creationId },
      companyId,
      'instagram'
    );
    if (pub.ok) {
      return {
        ...pub,
        tool: 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH',
        media_type: videoUrl ? 'REELS' : 'IMAGE',
      };
    }
  }
  return create;
}

/**
 * @param {{ kind: string, workspaceId?: string, companyId?: string, preferredConnector?: string, payload?: object, delivery?: 'draft'|'live' }} opts
 */
export async function executeSocialGoLive(opts = {}) {
  const kind = String(opts.kind || '').toLowerCase();
  if (!SOCIAL_KIND_CONNECTORS[kind]) {
    return { ok: false, error: `Unknown social kind: ${kind}` };
  }
  const companyId = String(opts.companyId || opts.workspaceId || 'marqq-ws-1').trim();
  if (!companyId) return { ok: false, error: 'companyId / workspaceId required' };

  const delivery = String(opts.delivery || 'live').toLowerCase() === 'draft' ? 'draft' : 'live';
  const payload = opts.payload && typeof opts.payload === 'object' ? opts.payload : {};
  const connected = await connectedSet(companyId);
  const connector = chooseConnector(kind, connected, opts.preferredConnector);

  if (!connector) {
    return {
      ok: false,
      error: `Connect ${SOCIAL_KIND_CONNECTORS[kind].join(' or ')} under Integrations first`,
      missing: SOCIAL_KIND_CONNECTORS[kind].filter((id) => !connected.has(id)),
      connected: [...connected],
    };
  }

  if (delivery === 'draft') {
    return {
      ok: true,
      status: 'draft',
      kind,
      connector,
      prepared: true,
      note: 'Draft only — flip delivery=live to publish via Composio',
      preview: {
        text: pickPayloadText(payload).slice(0, 280),
        image_url: payload.image_url || payload.media_url || null,
        video_url: payload.video_url || null,
        title: payload.title || null,
      },
    };
  }

  let result;
  switch (kind) {
    case 'linkedin':
      result = await goLiveLinkedIn(payload, companyId);
      break;
    case 'facebook':
      result = await goLiveFacebook(payload, companyId);
      break;
    case 'instagram':
      result = await goLiveInstagram(payload, companyId);
      break;
    case 'twitter':
    case 'x':
      result = await goLiveTwitter(payload, companyId);
      break;
    case 'youtube':
      result = await goLiveYoutube(payload, companyId);
      break;
    case 'social':
      if (connector === 'linkedin') result = await goLiveLinkedIn(payload, companyId);
      else if (connector === 'facebook') result = await goLiveFacebook(payload, companyId);
      else if (connector === 'twitter') result = await goLiveTwitter(payload, companyId);
      else if (connector === 'youtube') result = await goLiveYoutube(payload, companyId);
      else result = await goLiveInstagram(payload, companyId);
      break;
    default:
      result = { ok: false, error: `Unsupported kind: ${kind}` };
  }

  return {
    ...result,
    kind,
    connector,
    status: result.ok ? 'live' : 'error',
  };
}

export async function getSocialPublishReadiness(companyId = 'marqq-ws-1') {
  const connected = await connectedSet(companyId);
  const platforms = ['linkedin', 'instagram', 'facebook', 'twitter', 'youtube'];
  return {
    companyId,
    platforms: platforms.map((id) => ({
      id,
      connected: connected.has(id),
      status: connected.has(id) ? 'active' : 'not_connected',
    })),
  };
}
