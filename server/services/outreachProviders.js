/**
 * Instantly / HeyReach / WhatsApp outreach providers (Marqq2-aligned MVP).
 * Instantly + WhatsApp via Composio tools; HeyReach via public API key from Composio account.
 */

import { executeComposioAction, getConnectedAccountApiKey } from './composio.js';

function instantlyDefaultSchedule(timezone = 'Asia/Kolkata') {
  return {
    schedules: [
      {
        name: 'Business hours',
        timing: { from: '09:00', to: '17:00' },
        days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: false },
        timezone,
      },
    ],
  };
}

function instantlyBuildSequences(emails) {
  const steps = (Array.isArray(emails) ? emails : [])
    .filter((e) => e && (e.subject || e.body))
    .map((e, i) => ({
      type: 'email',
      delay: i === 0 ? 0 : Number(e.delay_days ?? e.delay ?? 3),
      variants: [
        {
          subject: String(e.subject || 'Quick question'),
          body: String(e.body || ''),
        },
      ],
    }));
  return steps.length ? [{ steps }] : null;
}

async function instantlyListSenderAccounts(companyId) {
  const res = await executeComposioAction(
    'INSTANTLY_LIST_ACCOUNTS',
    { limit: 25, status: 1 },
    companyId,
    'instantly'
  );
  if (res.error) return { error: res.error, accounts: [] };
  const raw = res.result?.items || res.result?.accounts || res.result?.data || res.result || [];
  const accounts = (Array.isArray(raw) ? raw : [])
    .map((a) => ({
      email: a.email || a.username || a.address || null,
      status: a.status ?? null,
      raw: a,
    }))
    .filter((a) => a.email);
  return { accounts, error: null };
}

/**
 * Create Instantly campaign + add lead. Activate only when delivery === 'live'.
 */
export async function launchInstantlyCampaign(companyId, {
  name = 'Marqq Outreach',
  subject,
  body,
  leads = [],
  activate = false,
  daily_limit = 50,
  timezone = 'Asia/Kolkata',
} = {}) {
  const sequences = instantlyBuildSequences([{ subject, body, delay_days: 0 }]);
  if (!sequences) throw new Error('subject/body required for Instantly');

  const { accounts: senderAccounts, error: accountsError } = await instantlyListSenderAccounts(companyId);
  if (accountsError) console.warn('[instantly] list accounts:', accountsError);
  const emailList = senderAccounts[0]?.email ? [senderAccounts[0].email] : [];

  const campaignRes = await executeComposioAction(
    'INSTANTLY_CREATE_CAMPAIGN',
    {
      name: String(name).slice(0, 100),
      sequences,
      campaign_schedule: instantlyDefaultSchedule(timezone),
      daily_limit: Number(daily_limit) || 50,
      stop_on_reply: true,
      open_tracking: true,
      link_tracking: true,
      ...(emailList.length ? { email_list: emailList } : {}),
    },
    companyId,
    'instantly'
  );
  if (campaignRes.error) throw new Error(`Instantly campaign failed: ${campaignRes.error}`);

  const campaignId =
    campaignRes.result?.id ||
    campaignRes.result?.campaign_id ||
    campaignRes.result?.data?.id ||
    null;

  const validLeads = (Array.isArray(leads) ? leads : [])
    .map((l) => ({
      email: l.email || l.email_norm,
      first_name: l.first_name || String(l.full_name || '').split(' ')[0] || '',
      last_name: l.last_name || String(l.full_name || '').split(' ').slice(1).join(' ') || '',
      company_name: l.company_name || l.company || '',
      personalization: l.personalization || '',
    }))
    .filter((l) => l.email);

  let leadsAdded = 0;
  if (campaignId && validLeads.length) {
    const bulkRes = await executeComposioAction(
      'INSTANTLY_ADD_LEADS_BULK',
      {
        campaign_id: campaignId,
        leads: validLeads,
        skip_if_in_campaign: true,
        skip_if_in_workspace: false,
        verify: false,
      },
      companyId,
      'instantly'
    );
    if (bulkRes.error) {
      for (const lead of validLeads) {
        const lr = await executeComposioAction(
          'INSTANTLY_CREATE_LEAD',
          { campaign_id: campaignId, ...lead },
          companyId,
          'instantly'
        );
        if (!lr.error) leadsAdded += 1;
      }
    } else {
      leadsAdded = validLeads.length;
    }
  }

  let activated = false;
  if (activate && campaignId) {
    const act = await executeComposioAction(
      'INSTANTLY_ACTIVATE_CAMPAIGN',
      { id: campaignId },
      companyId,
      'instantly'
    );
    if (act.error) throw new Error(`Instantly activate failed: ${act.error}`);
    activated = true;
  }

  return {
    provider: 'instantly',
    status: activated ? 'live' : 'draft',
    campaign_id: campaignId,
    leads_added: leadsAdded,
    sender: emailList[0] || null,
    activated,
  };
}

async function heyreachRequest(companyId, path, body) {
  let apiKey = process.env.HEYREACH_API_KEY || '';
  let accountId = null;
  if (!apiKey) {
    const keyRes = await getConnectedAccountApiKey('heyreach', companyId);
    if (keyRes.error || !keyRes.api_key) {
      throw new Error(keyRes.error || 'HeyReach API key not available — reconnect under Integrations');
    }
    apiKey = keyRes.api_key;
    accountId = keyRes.account_id;
  }
  const res = await fetch(`https://api.heyreach.io/api/public${path}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HeyReach ${path}: ${res.status} — ${data?.message || text || 'error'}`);
  }
  return { data, accountId };
}

/**
 * HeyReach LinkedIn campaign. Only creates+starts when activate=true (live).
 * Draft mode returns a prepared plan without calling StartCampaign APIs that send.
 */
export async function launchHeyReachCampaign(companyId, {
  campaign_name = 'Marqq LinkedIn Outreach',
  leads = [],
  message = '',
  activate = false,
  timezone = 'Asia/Kolkata',
} = {}) {
  const validLeads = (Array.isArray(leads) ? leads : []).filter((l) => l.linkedin_url);
  if (!validLeads.length) throw new Error('No leads with linkedin_url');

  if (!activate) {
    return {
      provider: 'heyreach',
      status: 'draft',
      prepared: true,
      leads: validLeads.length,
      note: 'Draft mode — HeyReach campaign is not started until delivery=live',
      preview_message: String(message || '').slice(0, 200),
    };
  }

  const safeName = String(campaign_name || 'Marqq LinkedIn').trim().slice(0, 50);
  const note = String(message || 'Hi {firstName}, would love to connect.').slice(0, 300);

  const { data: accountData } = await heyreachRequest(companyId, '/li_account/GetAll', {});
  const accounts = Array.isArray(accountData?.items)
    ? accountData.items
    : Array.isArray(accountData?.data)
      ? accountData.data
      : [];
  const linkedInAccountIds = accounts
    .filter((a) => a?.authIsValid === true || a?.isValid === true || a?.isValidNavigator === true)
    .map((a) => Number(a.id || a.accountId))
    .filter(Number.isFinite);
  if (!linkedInAccountIds.length) {
    throw new Error('No authenticated HeyReach LinkedIn sender — reconnect a sender in HeyReach');
  }

  const { data: listData } = await heyreachRequest(companyId, '/list/CreateEmptyList', {
    name: `${safeName} · leads`.slice(0, 100),
    listType: 'USER_LIST',
  });
  const listId = listData?.id || listData?.listId || listData?.data?.id;
  if (!listId) throw new Error('HeyReach did not return a list ID');

  await heyreachRequest(companyId, '/list/AddLeadsToListV2', {
    listId: Number(listId),
    leads: validLeads.map((lead) => ({
      profileUrl: lead.linkedin_url,
      firstName: lead.first_name || String(lead.full_name || '').split(' ')[0] || '',
      lastName: lead.last_name || String(lead.full_name || '').split(' ').slice(1).join(' ') || '',
      email: lead.email || '',
      companyName: lead.company || '',
      position: lead.title || '',
      customUserFields: [
        { name: 'note', value: note },
        { name: 'firstMessage', value: note },
        { name: 'followupMessage', value: 'Just following up in case this is relevant.' },
      ],
    })),
  });

  const sequence = {
    nodeType: 'CONNECTION_REQUEST',
    actionDelay: 24,
    actionDelayUnit: 'HOUR',
    payload: {
      messages: ['{note}'],
      fallbackMessage: 'Hi {firstName}, I would love to connect.',
    },
    unconditionalNode: { nodeType: 'END', actionDelay: 3, actionDelayUnit: 'HOUR' },
  };

  const { data: campaignData } = await heyreachRequest(companyId, '/campaign/Create', {
    name: safeName,
    linkedInUserListId: Number(listId),
    linkedInAccountIds,
    excludeContactedFromOtherCampaigns: true,
    excludeHasOtherAccConversations: true,
    schedule: {
      dailyStartTime: '09:00:00',
      dailyEndTime: '17:00:00',
      timeZoneId: timezone,
      enabledMonday: true,
      enabledTuesday: true,
      enabledWednesday: true,
      enabledThursday: true,
      enabledFriday: true,
      enabledSaturday: false,
      enabledSunday: false,
    },
    sequence,
  });
  const campaignId =
    campaignData?.campaignId || campaignData?.id || campaignData?.data?.campaignId || null;
  if (!campaignId) throw new Error('HeyReach did not return a campaign ID');

  await heyreachRequest(companyId, '/campaign/StartCampaign', { campaignId: Number(campaignId) });

  return {
    provider: 'heyreach',
    status: 'live',
    campaign_id: campaignId,
    list_id: listId,
    leads: validLeads.length,
    activated: true,
  };
}

function normalizeWaPhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function applyWaVars(source, lead) {
  return String(source || '')
    .replaceAll('{{first_name}}', lead.first_name || lead.full_name?.split(' ')?.[0] || '')
    .replaceAll('{{company}}', lead.company || lead.company_name || '')
    .replaceAll(
      '{{full_name}}',
      lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim()
    );
}

export async function resolveWhatsAppPhoneNumberId(companyId) {
  const phoneRes = await executeComposioAction(
    'WHATSAPP_GET_PHONE_NUMBERS',
    { limit: 25 },
    companyId,
    'whatsapp'
  );
  if (phoneRes.error) throw new Error(`WhatsApp phone lookup failed: ${phoneRes.error}`);
  const phoneNumber = phoneRes.result?.data?.[0] || phoneRes.result?.phone_numbers?.[0];
  const phoneNumberId = phoneNumber?.id;
  if (!phoneNumberId) throw new Error('No active WhatsApp Business phone number found');
  return {
    phone_number_id: phoneNumberId,
    display_phone_number: phoneNumber?.display_phone_number || null,
    raw: phoneNumber,
  };
}

/** List approved/available message templates (may be empty until Meta approval). */
export async function listWhatsAppTemplates(companyId, { limit = 50 } = {}) {
  const res = await executeComposioAction(
    'WHATSAPP_GET_MESSAGE_TEMPLATES',
    { limit },
    companyId,
    'whatsapp'
  );
  if (res.error) return { error: res.error, templates: [] };
  const raw = res.result?.data || res.result?.templates || res.result?.message_templates || res.result || [];
  const templates = (Array.isArray(raw) ? raw : [])
    .map((t) => ({
      id: t.id || null,
      name: t.name || null,
      language: t.language || t.language_code || (typeof t.language === 'object' ? t.language?.code : null) || 'en_US',
      status: t.status || null,
      category: t.category || null,
      components: t.components || null,
    }))
    .filter((t) => t.name);
  return { templates, phone: null };
}

/**
 * WhatsApp send via Composio.
 * - Free-form text: WHATSAPP_SEND_MESSAGE (24h session window)
 * - Template: WHATSAPP_SEND_TEMPLATE_MESSAGE (cold outreach)
 * Only sends when activate=true.
 */
export async function launchWhatsAppSend(companyId, {
  text,
  template_name = null,
  language_code = 'en_US',
  template_components = null,
  leads = [],
  activate = false,
  campaign_name = 'Marqq WhatsApp',
} = {}) {
  const templateName = String(template_name || '').trim() || null;
  const validLeads = (Array.isArray(leads) ? leads : [])
    .map((lead) => ({
      ...lead,
      to_number: normalizeWaPhone(lead.to_number || lead.phone || lead.phone_e164 || lead.mobile),
    }))
    .filter((lead) => lead.to_number);

  if (!validLeads.length) throw new Error('No leads with phone numbers');
  if (!templateName && !String(text || '').trim()) {
    throw new Error('WhatsApp text or template_name required');
  }

  if (!activate) {
    return {
      provider: 'whatsapp',
      status: 'draft',
      prepared: true,
      leads: validLeads.length,
      template_name: templateName,
      language_code: templateName ? language_code : null,
      note: templateName
        ? 'Draft mode — template will send when delivery=live'
        : 'Draft mode — WhatsApp messages are not sent until delivery=live',
      preview: templateName ? `[template:${templateName}]` : String(text).slice(0, 200),
    };
  }

  const phone = await resolveWhatsAppPhoneNumberId(companyId);
  const phoneNumberId = phone.phone_number_id;

  const results = [];
  let sentCount = 0;
  let failedCount = 0;
  for (const lead of validLeads) {
    const actionSlug = templateName ? 'WHATSAPP_SEND_TEMPLATE_MESSAGE' : 'WHATSAPP_SEND_MESSAGE';
    const payload = templateName
      ? {
          phone_number_id: phoneNumberId,
          to_number: lead.to_number,
          template_name: templateName,
          language_code: language_code || 'en_US',
          ...(template_components ? { components: template_components } : {}),
        }
      : {
          phone_number_id: phoneNumberId,
          to_number: lead.to_number,
          text: applyWaVars(text, lead),
        };

    const res = await executeComposioAction(actionSlug, payload, companyId, 'whatsapp');
    const messageId =
      res.result?.messages?.[0]?.id ||
      res.result?.message_id ||
      res.result?.messages?.[0]?.message_id ||
      null;
    if (res.error) {
      failedCount += 1;
      results.push({
        to_number: lead.to_number,
        full_name: lead.full_name || null,
        status: 'failed',
        error: res.error,
        mode: templateName ? 'template' : 'text',
      });
    } else {
      sentCount += 1;
      results.push({
        to_number: lead.to_number,
        full_name: lead.full_name || null,
        status: 'sent',
        delivery_status: 'sent',
        message_id: messageId,
        mode: templateName ? 'template' : 'text',
        template_name: templateName,
      });
    }
  }

  return {
    provider: 'whatsapp',
    status: failedCount && !sentCount ? 'error' : sentCount && failedCount ? 'partial' : 'live',
    campaign_name,
    phone_number_id: phoneNumberId,
    sender_number: phone.display_phone_number,
    template_name: templateName,
    language_code: templateName ? language_code : null,
    sent_count: sentCount,
    failed_count: failedCount,
    results,
    inbound_webhook_hint:
      'Point Meta WhatsApp webhook to PUBLIC_BASE_URL/api/webhooks/whatsapp (verify token: WHATSAPP_WEBHOOK_VERIFY_TOKEN)',
  };
}

/** Channel → preferred connector(s) for readiness UI */
export const OUTREACH_CHANNEL_CONNECTORS = {
  email: { anyOf: ['instantly', 'gmail'], preferred: 'instantly' },
  linkedin: { anyOf: ['heyreach'], preferred: 'heyreach' },
  whatsapp: { anyOf: ['whatsapp'], preferred: 'whatsapp' },
};
