/**
 * Channel-native outcome previews (Marqq2 parity, inline styles for Marqq-test).
 * Makes drafts feel published: IG/FB/LI/X/YT/TikTok frames, browser, email, WhatsApp.
 */
import React from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ThumbsUp,
  Repeat2,
  Share2,
  Lock,
  ArrowLeft,
  Phone,
  Video,
  Smile,
  Paperclip,
  CheckCheck,
  Globe,
  RefreshCw,
} from 'lucide-react';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function platformKey(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('linkedin') || p === 'li') return 'linkedin';
  if (p.includes('instagram') || p === 'ig' || p === 'insta' || p.includes('reel')) return 'instagram';
  if (p.includes('facebook') || p === 'fb') return 'facebook';
  if (p.includes('twitter') || p === 'x') return 'x';
  if (p.includes('tiktok')) return 'tiktok';
  if (p.includes('youtube') || p.includes('short')) return 'youtube';
  return 'linkedin';
}

function handleFrom(name) {
  return String(name || 'brand').toLowerCase().replace(/\s+/g, '');
}

const shell = {
  overflow: 'hidden',
  borderRadius: 16,
  border: '1px solid #e4e4e7',
  background: '#fff',
  color: '#18181b',
  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
  margin: '0 auto',
  width: '100%',
};

/** Social / creative channel chrome */
export function SocialPostPreview({
  platform,
  authorName = 'Your Brand',
  authorHandle,
  post = '',
  hook,
  hashtags = [],
  cta,
  imageUrl,
  videoUrl,
  style,
}) {
  const key = platformKey(platform);
  // Caption from Social Studio already includes hook as line 1 — don't double it in preview.
  const body = String(post || '').trim();
  const hookLine = String(hook || '').trim();
  const bodyStartsWithHook =
    hookLine &&
    body.toLowerCase().replace(/\s+/g, ' ').startsWith(hookLine.toLowerCase().replace(/\s+/g, ' '));
  const text = bodyStartsWithHook
    ? body
    : [hookLine, body].filter(Boolean).join('\n\n');
  const tags = (hashtags || []).map((t) => (String(t).startsWith('#') ? t : `#${t}`));
  const handle = authorHandle || handleFrom(authorName);

  if (key === 'instagram' || key === 'tiktok') {
    const vertical = Boolean(videoUrl) || key === 'tiktok';
    return (
      <div style={{ ...shell, maxWidth: 420, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              padding: 2,
              background: key === 'tiktok' ? 'linear-gradient(135deg,#25F4EE,#FE2C55)' : 'linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {initials(authorName)}
            </div>
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{handle}</div>
          <span style={{ fontSize: 10, color: '#71717a' }}>{key === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
          <MoreHorizontal size={16} color="#71717a" />
        </div>
        <div
          style={{
            background: '#09090b',
            aspectRatio: vertical ? '9 / 16' : '1 / 1',
            maxHeight: vertical ? 480 : undefined,
          }}
        >
          {videoUrl ? (
            <video src={videoUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : imageUrl ? (
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ height: '100%', minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#a1a1aa', fontSize: 13, whiteSpace: 'pre-wrap', textAlign: 'center' }}>
              {text || 'Caption / media will appear here'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 12px', color: '#18181b' }}>
          <Heart size={22} />
          <MessageCircle size={22} />
          <Send size={22} />
          <Bookmark size={22} style={{ marginLeft: 'auto' }} />
        </div>
        <div style={{ padding: '0 12px 14px', fontSize: 13, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 600 }}>{handle}</span>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{text}</span>
          {tags.length ? <div style={{ color: '#00376b', marginTop: 4 }}>{tags.join(' ')}</div> : null}
          {cta ? <div style={{ marginTop: 6, fontWeight: 600 }}>{cta}</div> : null}
        </div>
      </div>
    );
  }

  if (key === 'facebook') {
    return (
      <div style={{ ...shell, maxWidth: 520, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#1877F2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
            {initials(authorName)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{authorName}</div>
            <div style={{ fontSize: 11, color: '#71717a' }}>Just now · Public</div>
          </div>
          <MoreHorizontal size={16} color="#71717a" />
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: 15, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
          {text}
          {tags.length ? <span style={{ color: '#1877F2' }}> {tags.join(' ')}</span> : null}
        </div>
        {videoUrl ? (
          <video src={videoUrl} controls playsInline style={{ width: '100%', maxHeight: 420, background: '#000' }} />
        ) : imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 320, objectFit: 'cover' }} />
        ) : null}
        {cta ? <div style={{ borderTop: '1px solid #f4f4f5', padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#1877F2' }}>{cta}</div> : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid #f4f4f5' }}>
          {['Like', 'Comment', 'Share'].map((label) => (
            <div key={label} style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#52525b' }}>{label}</div>
          ))}
        </div>
      </div>
    );
  }

  if (key === 'x') {
    return (
      <div style={{ ...shell, maxWidth: 480, background: '#000', color: '#f4f4f5', borderColor: '#27272a', ...style }}>
        <div style={{ display: 'flex', gap: 12, padding: '12px 16px' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
            {initials(authorName)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <strong>{authorName}</strong>
              <span style={{ color: '#71717a' }}>@{handle}</span>
              <span style={{ color: '#52525b' }}>· now</span>
              <MoreHorizontal size={14} color="#71717a" style={{ marginLeft: 'auto' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 15, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
              {text}
              {tags.length ? <span style={{ color: '#38bdf8' }}> {tags.join(' ')}</span> : null}
            </div>
            {cta ? <div style={{ marginTop: 4, color: '#38bdf8', fontWeight: 600, fontSize: 13 }}>{cta}</div> : null}
            {videoUrl ? (
              <video src={videoUrl} controls playsInline style={{ marginTop: 10, width: '100%', borderRadius: 16, border: '1px solid #27272a' }} />
            ) : imageUrl ? (
              <img src={imageUrl} alt="" style={{ marginTop: 10, width: '100%', borderRadius: 16, border: '1px solid #27272a', aspectRatio: '16/9', objectFit: 'cover' }} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingRight: 24, color: '#71717a' }}>
              <MessageCircle size={16} />
              <Repeat2 size={16} />
              <Heart size={16} />
              <Share2 size={16} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (key === 'youtube') {
    return (
      <div style={{ ...shell, maxWidth: 560, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f4f4f5' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FF0000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>▶</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{authorName}</div>
            <div style={{ fontSize: 11, color: '#71717a' }}>YouTube · Shorts / video preview</div>
          </div>
        </div>
        <div style={{ aspectRatio: videoUrl && String(platform).includes('short') ? '9/16' : '16/9', maxHeight: 420, background: '#000', margin: '0 auto', width: '100%' }}>
          {videoUrl ? (
            <video src={videoUrl} controls style={{ width: '100%', height: '100%' }} />
          ) : imageUrl ? (
            <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ height: '100%', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
              Video asset required
            </div>
          )}
        </div>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{hook || 'YouTube video title'}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#52525b', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{text || 'Description will appear here'}</div>
        </div>
      </div>
    );
  }

  // LinkedIn default
  return (
    <div style={{ ...shell, maxWidth: 560, ...style }}>
      <div style={{ display: 'flex', gap: 12, padding: '16px 16px 0' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#0A66C2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
          {initials(authorName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{authorName}</div>
          <div style={{ fontSize: 12, color: '#71717a' }}>{authorHandle || 'Marketing · Your company'}</div>
          <div style={{ fontSize: 11, color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: 4 }}>
            Just now · <Globe size={12} />
          </div>
        </div>
        <MoreHorizontal size={16} color="#71717a" />
      </div>
      <div style={{ padding: '12px 16px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {text}
        {tags.length ? <div style={{ marginTop: 8, color: '#0A66C2' }}>{tags.join(' ')}</div> : null}
        {cta ? <div style={{ marginTop: 8, fontWeight: 600 }}>{cta}</div> : null}
      </div>
      {videoUrl ? (
        <video src={videoUrl} controls playsInline style={{ width: '100%', maxHeight: 360, background: '#000' }} />
      ) : imageUrl ? (
        <img src={imageUrl} alt="" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderTop: '1px solid #f4f4f5', borderBottom: '1px solid #f4f4f5' }} />
      ) : null}
      <div style={{ display: 'flex', borderTop: '1px solid #f4f4f5' }}>
        {[
          { Icon: ThumbsUp, label: 'Like' },
          { Icon: MessageCircle, label: 'Comment' },
          { Icon: Repeat2, label: 'Repost' },
          { Icon: Share2, label: 'Send' },
        ].map(({ Icon, label }) => (
          <div key={label} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', fontSize: 12, fontWeight: 600, color: '#52525b' }}>
            <Icon size={14} /> {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmailClientPreview({
  from = '',
  to = '',
  subject = '',
  body = '',
  previewText,
  style,
}) {
  const row = (label, value) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderBottom: '1px solid #e4e4e7', padding: '8px 16px', minHeight: 40 }}>
      <span style={{ width: 56, fontSize: 11, fontWeight: 600, color: '#71717a' }}>{label}</span>
      <span style={{ flex: 1, fontSize: 13, color: value ? '#18181b' : '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value || '—'}
      </span>
    </div>
  );
  return (
    <div style={{ ...shell, maxWidth: 640, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e4e4e7', background: '#fafafa' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#71717a' }}>New Message</span>
      </div>
      {row('From', from)}
      {row('To', to)}
      {row('Subject', subject)}
      {previewText ? (
        <div style={{ borderBottom: '1px solid #e4e4e7', padding: '6px 16px', fontSize: 11, color: '#a1a1aa', fontStyle: 'italic' }}>
          Preview: {previewText}
        </div>
      ) : null}
      <div style={{ padding: 16, minHeight: 180, fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#18181b' }}>
        {body || '—'}
      </div>
    </div>
  );
}

export function WhatsAppDmPreview({ contactName, message, style }) {
  return (
    <div
      style={{
        ...shell,
        maxWidth: 380,
        borderRadius: 28,
        borderColor: '#3f3f46',
        background: '#0b141a',
        color: '#e9edef',
        minHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#1f2c34' }}>
        <ArrowLeft size={18} color="#d4d4d8" />
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#00a884', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
          {initials(contactName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contactName || 'Prospect'}</div>
          <div style={{ fontSize: 11, color: '#a1a1aa' }}>online</div>
        </div>
        <Video size={18} color="#d4d4d8" />
        <Phone size={18} color="#d4d4d8" />
      </div>
      <div
        style={{
          flex: 1,
          padding: '16px 12px',
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div style={{ marginLeft: 'auto', maxWidth: '85%', borderRadius: 16, borderTopRightRadius: 4, background: '#005c4b', padding: '8px 12px', fontSize: 14, lineHeight: 1.4, boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message || '—'}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: 'rgba(233,237,239,0.7)' }}>
            <span>now</span>
            <CheckCheck size={14} color="#7dd3fc" />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: '#1f2c34' }}>
        <Smile size={18} color="#a1a1aa" />
        <div style={{ flex: 1, borderRadius: 999, background: '#2a3942', padding: '8px 16px', fontSize: 12, color: '#a1a1aa' }}>Message</div>
        <Paperclip size={18} color="#a1a1aa" />
      </div>
    </div>
  );
}

export function InlineBrowserPreview({
  urlLabel = 'yoursite.com',
  title,
  html,
  children,
  height = 520,
  style,
}) {
  const path = title
    ? `/${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    : '';
  const host = String(urlLabel || 'yoursite.com').replace(/^https?:\/\//, '');
  return (
    <div style={{ ...shell, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #e4e4e7', background: '#f4f4f5' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, margin: '0 8px', borderRadius: 8, border: '1px solid #e4e4e7', background: '#fff', padding: '6px 10px', minWidth: 0 }}>
          <Lock size={12} color="#059669" />
          <span style={{ fontSize: 11, color: '#52525b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            https://{host}{path}
          </span>
          <RefreshCw size={12} color="#a1a1aa" style={{ marginLeft: 'auto', flexShrink: 0 }} />
        </div>
      </div>
      {html ? (
        <iframe
          srcDoc={html}
          title={title || 'Page preview'}
          sandbox="allow-same-origin"
          style={{ width: '100%', height, border: 0, background: '#fff' }}
        />
      ) : (
        <div style={{ maxHeight: height, overflow: 'auto', background: '#fff', color: '#18181b' }}>{children}</div>
      )}
    </div>
  );
}

export function BlogArticleBrowserPreview({ title, metaDescription, html, urlLabel, sections = [] }) {
  return (
    <InlineBrowserPreview urlLabel={urlLabel || 'blog.yoursite.com'} title={title} html={html}>
      {!html ? (
        <article style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px' }}>
          {title ? <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: 0 }}>{title}</h1> : null}
          {metaDescription ? <p style={{ marginTop: 16, color: '#52525b', lineHeight: 1.6 }}>{metaDescription}</p> : null}
          <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 28 }}>
            {sections.map((section, i) => (
              <section key={i}>
                {section.heading ? <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>{section.heading}</h2> : null}
                {section.content ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#3f3f46' }}>{section.content}</p> : null}
              </section>
            ))}
          </div>
        </article>
      ) : null}
    </InlineBrowserPreview>
  );
}

export function LandingPageBrowserPreview({ title, html, urlLabel, sections = [] }) {
  return (
    <InlineBrowserPreview urlLabel={urlLabel || 'www.yoursite.com'} title={title} html={html}>
      {!html ? (
        <div>
          <div style={{ padding: '56px 24px', textAlign: 'center', background: 'linear-gradient(180deg,#fff7ed,#fff)' }}>
            <h1 style={{ fontSize: 36, margin: 0 }}>{title || 'Landing page'}</h1>
          </div>
          {sections.map((section, i) => (
            <section key={i} style={{ padding: '32px 24px', borderTop: '1px solid #f4f4f5', maxWidth: 720, margin: '0 auto' }}>
              {section.heading || section.label ? <h2 style={{ margin: '0 0 10px' }}>{section.heading || section.label}</h2> : null}
              {section.content ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: '#3f3f46' }}>{section.content}</p> : null}
              {section.cta ? (
                <button type="button" style={{ marginTop: 16, border: 0, borderRadius: 8, background: '#18181b', color: '#fff', padding: '10px 16px', fontWeight: 600 }}>
                  {section.cta}
                </button>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </InlineBrowserPreview>
  );
}

export { platformKey };
