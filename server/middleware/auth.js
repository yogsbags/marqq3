import { supabaseAdmin, supabase } from '../lib/supabase.js';

export async function resolveBearerUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const client = supabaseAdmin || supabase;
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/** Attach req.user + req.authUserId when Bearer present; 401 if missing. */
export async function requireAuth(req, res, next) {
  const user = await resolveBearerUser(req);
  if (!user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  req.authUserId = user.id;
  return next();
}

/** Soft auth: attach user if present, never 401. */
export async function optionalAuth(req, res, next) {
  const user = await resolveBearerUser(req);
  if (user?.id) {
    req.user = user;
    req.authUserId = user.id;
  }
  return next();
}

export async function assertWorkspaceMember(userId, workspaceId) {
  if (!supabaseAdmin || !userId || !workspaceId) return false;
  const { data, error } = await supabaseAdmin
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('[auth] membership check failed:', error.message);
    return false;
  }
  return Boolean(data);
}

/** Require auth + membership when :id or body/query workspaceId is present. */
export async function requireWorkspaceMember(req, res, next) {
  const user = await resolveBearerUser(req);
  if (!user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = user;
  req.authUserId = user.id;

  const workspaceId =
    req.params?.id ||
    req.params?.workspaceId ||
    req.body?.workspaceId ||
    req.query?.workspaceId ||
    null;

  if (workspaceId && supabaseAdmin) {
    const ok = await assertWorkspaceMember(user.id, workspaceId);
    if (!ok) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }
  }
  return next();
}
