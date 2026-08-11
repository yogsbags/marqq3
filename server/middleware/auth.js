import { getSupabaseAdminClient, getSupabaseAnonClient } from '../lib/supabase.js';

export async function resolveBearerUser(req) {
  const header = String(req.headers.authorization || '');
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const client = getSupabaseAdminClient() || getSupabaseAnonClient();
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
  const supabaseAdmin = getSupabaseAdminClient();
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
    req.body?.companyId ||
    req.body?.workspace_id ||
    req.query?.workspaceId ||
    req.query?.companyId ||
    req.query?.workspace_id ||
    null;

  if (workspaceId && getSupabaseAdminClient()) {
    const ok = await assertWorkspaceMember(user.id, workspaceId);
    if (!ok) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }
  }
  return next();
}

/** Require membership for a deployment route, resolving workspace from the
 * deployment row when the client only supplies /:id. */
export async function requireDeploymentMember(req, res, next) {
  const user = await resolveBearerUser(req);
  if (!user?.id) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  req.authUserId = user.id;
  const workspaceId = req.body?.workspaceId || req.body?.companyId || req.query?.workspaceId || null;
  let resolved = workspaceId;
  const admin = getSupabaseAdminClient();
  if (!resolved && admin && req.params?.id) {
    const { data } = await admin.from('agent_deployments').select('workspace_id').eq('id', req.params.id).maybeSingle();
    resolved = data?.workspace_id || null;
  }
  if (resolved && admin && !(await assertWorkspaceMember(user.id, resolved))) {
    return res.status(403).json({ error: 'You are not a member of this workspace' });
  }
  if (!resolved && admin) return res.status(400).json({ error: 'workspaceId required' });
  return next();
}

/** Require membership for an approval decision, resolving workspace by ID. */
export async function requireApprovalMember(req, res, next) {
  const user = await resolveBearerUser(req);
  if (!user?.id) return res.status(401).json({ error: 'Authentication required' });
  req.user = user;
  req.authUserId = user.id;
  const admin = getSupabaseAdminClient();
  let workspaceId = req.body?.workspaceId || null;
  if (!workspaceId && admin && req.body?.id) {
    const { data } = await admin.from('draft_approvals').select('workspace_id').eq('id', req.body.id).maybeSingle();
    workspaceId = data?.workspace_id || null;
  }
  if (workspaceId && admin && !(await assertWorkspaceMember(user.id, workspaceId))) {
    return res.status(403).json({ error: 'You are not a member of this workspace' });
  }
  if (!workspaceId && admin) return res.status(404).json({ error: 'Approval not found' });
  return next();
}
