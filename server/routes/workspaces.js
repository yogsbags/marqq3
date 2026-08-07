/**
 * Workspace CRUD — reuses Marqq2 `workspaces` + `workspace_members` tables.
 */
import express from 'express';
import { getSupabaseAdminClient } from '../lib/supabase.js';
import { requireAuth, requireWorkspaceMember } from '../middleware/auth.js';
import { useSupabasePersistence } from '../lib/persistence.js';

const router = express.Router();

function dbOr503(res) {
  const supabaseAdmin = getSupabaseAdminClient();
  if (!useSupabasePersistence() || !supabaseAdmin) {
    res.status(503).json({
      error: 'Workspace API requires SUPABASE_SERVICE_ROLE_KEY (USE_SUPABASE_PERSISTENCE)',
    });
    return null;
  }
  return supabaseAdmin;
}

router.use(requireAuth);

/** GET /api/workspaces — list + auto-provision default for new users */
router.get('/', async (req, res) => {
  const db = dbOr503(res);
  if (!db) return;
  const userId = req.authUserId;
  try {
    let { data, error } = await db
      .from('workspace_members')
      .select('role, workspace:workspaces(id, name, website_url, created_at)')
      .eq('user_id', userId);
    if (error) throw error;

    if (!data || data.length === 0) {
      const { data: ws, error: wsErr } = await db
        .from('workspaces')
        .insert({ name: 'My workspace', owner_id: userId })
        .select()
        .single();
      if (wsErr) throw wsErr;
      const { error: memErr } = await db.from('workspace_members').insert({
        workspace_id: ws.id,
        user_id: userId,
        role: 'owner',
      });
      if (memErr) throw memErr;
      return res.json({ workspaces: [{ ...ws, role: 'owner' }] });
    }

    const workspaces = data
      .filter((row) => row.workspace)
      .map((row) => ({ ...row.workspace, role: row.role }));
    return res.json({ workspaces });
  } catch (err) {
    console.error('[workspaces] list', err);
    return res.status(500).json({ error: err.message || 'Failed to list workspaces' });
  }
});

/** POST /api/workspaces — create + owner membership */
router.post('/', async (req, res) => {
  const db = dbOr503(res);
  if (!db) return;
  const userId = req.authUserId;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { data: ws, error: wsErr } = await db
      .from('workspaces')
      .insert({
        name,
        owner_id: userId,
        website_url: req.body?.website_url || req.body?.websiteUrl || null,
      })
      .select()
      .single();
    if (wsErr) throw wsErr;
    const { error: memErr } = await db.from('workspace_members').insert({
      workspace_id: ws.id,
      user_id: userId,
      role: 'owner',
    });
    if (memErr) throw memErr;
    return res.json({ workspace: { ...ws, role: 'owner' } });
  } catch (err) {
    console.error('[workspaces] create', err);
    return res.status(500).json({ error: err.message || 'Failed to create workspace' });
  }
});

/** PATCH /api/workspaces/:id */
router.patch('/:id', requireWorkspaceMember, async (req, res) => {
  const db = dbOr503(res);
  if (!db) return;
  const { id } = req.params;
  const updates = {};
  if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body?.website_url !== undefined) updates.website_url = req.body.website_url;
  if (req.body?.websiteUrl !== undefined) updates.website_url = req.body.websiteUrl;
  try {
    const { data, error } = await db.from('workspaces').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return res.json({ workspace: data });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update workspace' });
  }
});

/** DELETE /api/workspaces/:id — owner only */
router.delete('/:id', requireWorkspaceMember, async (req, res) => {
  const db = dbOr503(res);
  if (!db) return;
  const { id } = req.params;
  const userId = req.authUserId;
  try {
    const { data: mem } = await db
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (mem?.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete this workspace' });
    }
    const { error } = await db.from('workspaces').delete().eq('id', id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete workspace' });
  }
});

export default router;
