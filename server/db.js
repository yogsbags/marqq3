import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '../data/marqq-db.json');

// Initial seed data extracted directly from the Marqq mockup design
const initialData = {
  workspace: {
    name: 'Elevate',
    user: { name: 'Sarah Cole', email: 'hello@theelevate.co.in', role: 'CMO', avatar: 'SC' },
    creditBalance: '1,790',
    usage: [
      { label: 'Agent runs', value: '4,210 / 6,000', pct: '70%' },
      { label: 'Model tokens', value: '18.2M / 25M', pct: '73%' },
      { label: 'Seats', value: '14 / 20', pct: '70%' }
    ],
    invoices: [
      { period: 'July 2026', amount: '$4,800', status: 'Paid' },
      { period: 'June 2026', amount: '$4,800', status: 'Paid' },
      { period: 'May 2026', amount: '$4,200', status: 'Paid' }
    ]
  },
  kpis: [
    { label: 'Revenue influenced', value: '$3.4M', delta: '+8.2% vs last qtr', deltaColor: '#ff6a00' },
    { label: 'Pipeline generated', value: '$8.1M', delta: '+4.6%', deltaColor: '#ff6a00' },
    { label: 'Blended CAC', value: '$612', delta: '+18% ⚠', deltaColor: '#f4efe9' },
    { label: 'Blended ROAS', value: '3.8x', delta: '-0.2x', deltaColor: '#f4efe9' }
  ],
  changes: [
    { id: 1, tag: 'Risk', tagClass: 'tag tag-accent-2', text: 'Paid Search CAC increased 18% week-over-week, concentrated in two keyword groups.', source: 'Paid Media Agent · 40 min ago', action: 'Review' },
    { id: 2, tag: 'Opportunity', tagClass: 'tag tag-accent', text: 'LinkedIn ABM audience is generating high-quality accounts at 71% efficiency — above target.', source: 'Campaign Agent · 2h ago', action: 'Scale' },
    { id: 3, tag: 'Alert', tagClass: 'tag tag-outline', text: 'Organic traffic declined 6% for the "patient scheduling" topic cluster.', source: 'SEO Agent · 3h ago', action: 'Investigate' }
  ],
  priorities: [
    { id: 1, type: 'Approve', label: 'Budget reallocation for Q3 Pipeline Acceleration' },
    { id: 2, type: 'Review', label: 'Atlas launch creative — legal hold on hero claim' },
    { id: 3, type: 'Fix', label: 'Google Ads token expired — Zara sync failed' }
  ],
  campaigns: [
    { id: 'c1', name: 'Q3 Pipeline Acceleration', objective: 'Generate pipeline', channels: 'Paid Search, LinkedIn', status: 'Live', budget: '$180K', spend: '$121K', roas: '4.1x', owner: 'S. Cole', updated: '2h ago', conversions: '842', pacing: '67%', risk: 'Paid Search CAC is up 18% week-over-week while conversion volume holds steady — the increase is concentrated in two exact-match keyword groups. Marqq recommends shifting $12K from those groups into the LinkedIn ABM audience, which is under-pacing at 71% quality-adjusted efficiency.', channelList: [{ name: 'Paid Search', share: '48%' }, { name: 'LinkedIn Ads', share: '31%' }, { name: 'Email nurture', share: '21%' }] },
    { id: 'c2', name: 'Enterprise ABM — Healthcare', objective: 'Account engagement', channels: 'LinkedIn, Outbound', status: 'Live', budget: '$95K', spend: '$58K', roas: '3.2x', owner: 'R. Iyer', updated: '5h ago', conversions: '211', pacing: '61%', risk: 'Two target accounts show strong buying-signal spikes but no active sequence — Marqq suggests briefing the Outreach Agent today.', channelList: [{ name: 'LinkedIn Ads', share: '55%' }, { name: 'Outbound email', share: '45%' }] },
    { id: 'c3', name: 'Product Launch — Atlas', objective: 'Awareness', channels: 'Social, PR, Content', status: 'Needs approval', budget: '$140K', spend: '$9K', roas: '—', owner: 'M. Chen', updated: '1d ago', conversions: '—', pacing: '6%', risk: 'Launch creative is brand-compliant but the hero claim lacks a cited proof point — held for legal review before scheduling.', channelList: [{ name: 'Organic social', share: '40%' }, { name: 'PR', share: '35%' }, { name: 'Content', share: '25%' }] },
    { id: 'c4', name: 'SEO — Topic Cluster Refresh', objective: 'Organic visibility', channels: 'SEO, GEO', status: 'On track', budget: '$40K', spend: '$22K', roas: '5.6x', owner: 'D. Park', updated: '3h ago', conversions: '1,204 sessions', pacing: '55%', risk: 'No active risks. GEO answer-visibility for "clinical scheduling software" rose 9 points this week.', channelList: [{ name: 'Organic search', share: '70%' }, { name: 'AI answer engines', share: '30%' }] },
    { id: 'c5', name: 'Retention Nurture — Q3', objective: 'Reduce churn', channels: 'Email, In-app', status: 'Paused', budget: '$18K', spend: '$18K', roas: '2.4x', owner: 'S. Cole', updated: '2d ago', conversions: '96', pacing: '100%', risk: 'Sequence completed its planned run; awaiting Q4 refresh brief.', channelList: [{ name: 'Email', share: '80%' }, { name: 'In-app', share: '20%' }] },
    { id: 'c6', name: 'Winter Event Series', objective: 'Demand generation', channels: 'Email, Paid Social', status: 'Draft', budget: '$65K', spend: '$0', roas: '—', owner: 'M. Chen', updated: '4d ago', conversions: '—', pacing: '0%', risk: 'Strategy brief complete; awaiting budget approval to move to setup.', channelList: [{ name: 'Email', share: '50%' }, { name: 'Paid social', share: '50%' }] }
  ],
  agents: [
    { id: 'a1', name: 'Veena', role: 'Company Intel', type: 'Account research', avatarColor: '#3d8bff', status: 'Running', lastAction: 'Scanning 6 competitor sites for new pricing pages and messaging changes.', successRate: '96%', owner: 'M. Chen', purpose: 'Builds company profiles from market, competitor, and category signals and surfaces opportunities and threats to the Command Center.', tools: ['Web crawler', 'Firecrawl', 'Knowledge graph'], dataAccess: ['Public web', 'Competitor list'] },
    { id: 'a2', name: 'Dev', role: 'Performance', type: 'Paid media ROI', avatarColor: '#ff6a00', status: 'Needs approval', lastAction: 'Drafted a $12K budget reallocation for Q3 Pipeline Acceleration.', successRate: '91%', owner: 'S. Cole', purpose: 'Optimizes budget and targeting across paid channels from approved strategy briefs.', tools: ['Budget planner', 'Ad platform connectors'], dataAccess: ['Campaign data', 'Budget ledger'] },
    { id: 'a3', name: 'Riya', role: 'Content', type: 'Editorial pipeline', avatarColor: '#38b06b', status: 'Running', lastAction: 'Generating a first draft for "Reducing no-shows with automated scheduling."', successRate: '89%', owner: 'D. Park', purpose: 'Builds the content calendar and produces on-brand drafts across blog, social, and email from approved briefs.', tools: ['Brand voice model', 'SEO optimizer'], dataAccess: ['Brand center', 'Content calendar'] },
    { id: 'a4', name: 'Maya', role: 'SEO', type: 'Search intelligence', avatarColor: '#c74dd1', status: 'Completed', lastAction: 'Finished weekly rank + AI-answer visibility scan across 340 tracked keywords.', successRate: '98%', owner: 'D. Park', purpose: 'Loads the keyword database and tracks search rankings and AI-answer visibility, recommending content and technical fixes.', tools: ['Rank tracker', 'GEO citation scanner'], dataAccess: ['Search console', 'Public web'] },
    { id: 'a5', name: 'Arjun', role: 'Leads', type: 'B2B prospecting', avatarColor: '#d13a5c', status: 'Waiting', lastAction: 'Waiting on approval to sequence 14 newly-surged accounts.', successRate: '84%', owner: 'R. Iyer', purpose: 'Scans ICP signals to prospect accounts and drafts personalized outbound sequences from account intelligence and buying signals.', tools: ['Sequencer', 'CRM sync'], dataAccess: ['CRM', 'Intent data'] },
    { id: 'a6', name: 'Zara', role: 'Channels', type: 'Campaign strategy', avatarColor: '#4aa8a3', status: 'Failed', lastAction: 'Sync with Google Ads account failed — token expired.', successRate: '93%', owner: 'S. Cole', purpose: 'Synthesises the morning brief and monitors spend pacing across channels, proposing reallocations against goals.', tools: ['Pacing model', 'Ad platform connectors'], dataAccess: ['Ad accounts', 'Budget ledger'] },
    { id: 'a7', name: 'Isha', role: 'Market Research', type: 'ICP & audience', avatarColor: '#e0b13a', status: 'Running', lastAction: 'Mapped 3 new audience segments from last week’s intent data.', successRate: '90%', owner: 'M. Chen', purpose: 'Maps ICP and audience segments from market and intent signals to keep targeting current.', tools: ['Segmentation model', 'Intent data feed'], dataAccess: ['Market data', 'Intent data'] },
    { id: 'a8', name: 'Neel', role: 'Strategy', type: 'Positioning & GTM', avatarColor: '#5a6ee0', status: 'Needs approval', lastAction: 'Drafted the updated GTM strategy brief for the mid-market clinic segment.', successRate: '88%', owner: 'S. Cole', purpose: 'Drafts positioning and go-to-market strategy briefs from locked goals, offer, and audience.', tools: ['Strategy composer', 'Knowledge graph'], dataAccess: ['GTM workspace', 'Brand center'] },
    { id: 'a9', name: 'Tara', role: 'CRO & Offers', type: 'Conversion design', avatarColor: '#c74d8f', status: 'Running', lastAction: 'Audited the pricing page and flagged 2 friction points in the checkout flow.', successRate: '87%', owner: 'D. Park', purpose: 'Audits offer and page friction and proposes conversion-rate improvements.', tools: ['Funnel analyzer', 'Heatmap feed'], dataAccess: ['Analytics', 'Landing pages'] },
    { id: 'a10', name: 'Sam', role: 'Copy', type: 'Messaging & voice', avatarColor: '#39a6a3', status: 'Completed', lastAction: 'Reviewed messaging copy across 4 campaigns for brand-voice consistency.', successRate: '94%', owner: 'D. Park', purpose: 'Reviews messaging and copy across channels for voice, clarity, and brand consistency.', tools: ['Brand voice model', 'Style guide'], dataAccess: ['Brand center', 'Content calendar'] },
    { id: 'a11', name: 'Kiran', role: 'Social', type: 'Content calendar', avatarColor: '#8a5ce0', status: 'Running', lastAction: 'Built the 30-day social calendar across 3 channels.', successRate: '92%', owner: 'M. Chen', purpose: 'Builds and maintains the 30-day content calendar across social channels.', tools: ['Calendar planner', 'Social scheduler'], dataAccess: ['Social accounts', 'Content calendar'] },
    { id: 'a12', name: 'Priya', role: 'Intel', type: 'Competitive watch', avatarColor: '#e0575a', status: 'Running', lastAction: 'Tracked competitor moves — Vantage shipped a scheduling-AI feature this week.', successRate: '90%', owner: 'M. Chen', purpose: 'Tracks competitor moves and surfaces category threats and opportunities.', tools: ['Web crawler', 'Change detection'], dataAccess: ['Public web', 'Competitor list'] }
  ],
  agentLogs: {
    a2: [
      { id: 'l1', time: 'Today, 9:14 AM', observed: 'Paid Search CAC up 18% w/w, concentrated in 2 keyword groups; conversion rate flat.', action: 'Shift $12K budget from those groups into the LinkedIn ABM audience.', confidence: '87% confidence' },
      { id: 'l2', time: 'Yesterday, 4:02 PM', observed: 'LinkedIn ABM audience efficiency at 71%, above the 60% target for 6 straight days.', action: 'Recommend increasing LinkedIn daily budget cap by $500.', confidence: '91% confidence' },
      { id: 'l3', time: 'Jul 28, 11:20 AM', observed: 'Atlas launch creative missing a cited proof point for its primary claim.', action: 'Hold creative from scheduling; route to Brand Compliance Agent.', confidence: '95% confidence' }
    ],
    a5: [
      { id: 'l4', time: 'Today, 9:02 AM', observed: '14 accounts in the mid-market clinic ICP surged intent this week (pricing page + demo page visits).', action: 'Draft personalized email + LinkedIn sequences for all 14 and queue for approval.', confidence: '90% confidence' },
      { id: 'l5', time: 'Today, 8:40 AM', observed: 'Dr. Elena Martinez (Summit Ridge Medical Group) replied "This is interesting — can we set up a call next week?"', action: 'Draft a meeting-booking reply and notify Sales Ops via CRM handoff.', confidence: '96% confidence' },
      { id: 'l6', time: 'Yesterday, 11:15 AM', observed: 'LinkedIn connect + note sequence to Marcus Webb (Coastal Family Health) accepted.', action: 'Send Step 2 — value follow-up message on schedule.', confidence: '88% confidence' }
    ]
  },
  approvedActions: {},
  approvals: [
    { id: 'appr-0', type: 'Budget', title: 'Reallocate $12K from Paid Search to LinkedIn ABM', owner: 'Dev · Performance', risk: 'Medium risk', riskClass: 'tag tag-accent-2', preview: 'Estimated blended CAC impact: -9%. No guardrail metrics breached.', deadline: 'Today, 5:00 PM' },
    { id: 'appr-1', type: 'Content', title: 'Atlas launch social copy — 4 variants', owner: 'Riya · Content', risk: 'Low risk', riskClass: 'tag tag-outline', preview: 'Brand-compliant; one variant flagged for an uncited performance claim.', deadline: 'Tomorrow, 9:00 AM' },
    { id: 'appr-2', type: 'Outreach', title: 'Sequence 14 surged accounts — Meridian, Talbot, +12', owner: 'Arjun · Leads', risk: 'Low risk', riskClass: 'tag tag-outline', preview: 'Personalized 3-touch sequence drafted from recent buying signals.', deadline: 'Jul 31, 12:00 PM' }
  ],
  prospects: [
    { id: 'p1', name: 'Dr. Elena Martinez', title: 'VP Clinical Operations', company: 'Summit Ridge Medical Group', fit: 94, channels: ['email', 'linkedin', 'phone'], lastTouch: 'Never contacted' },
    { id: 'p2', name: 'Marcus Webb', title: 'Practice Manager', company: 'Coastal Family Health', fit: 89, channels: ['email', 'linkedin'], lastTouch: 'Never contacted' },
    { id: 'p3', name: 'Priya Chandra', title: 'VP Clinical Operations', company: 'Riverside Outpatient Partners', fit: 91, channels: ['email', 'phone'], lastTouch: 'Never contacted' },
    { id: 'p4', name: 'Tom Bradshaw', title: 'Practice Manager', company: 'Lakeside Clinic Network', fit: 82, channels: ['email', 'linkedin', 'phone'], lastTouch: 'Opened email · 2d ago' },
    { id: 'p5', name: 'Grace Okonkwo', title: 'VP Clinical Operations', company: 'Bellwood Care Network', fit: 87, channels: ['linkedin', 'phone'], lastTouch: 'Never contacted' }
  ],
  contentItems: [
    { id: 1, title: 'Reducing no-shows with automated scheduling', type: 'Blog', channel: 'Organic', status: 'In review', owner: 'D. Park', date: 'Aug 2' },
    { id: 2, title: 'Atlas launch announcement', type: 'Social', channel: 'LinkedIn', status: 'Needs approval', owner: 'M. Chen', date: 'Aug 4' },
    { id: 3, title: 'Q3 nurture — email 3 of 5', type: 'Email', channel: 'Email', status: 'Live', owner: 'S. Cole', date: 'Jul 30' },
    { id: 4, title: 'Clinical scheduling buyer’s guide', type: 'Lead magnet', channel: 'Landing page', status: 'Draft', owner: 'D. Park', date: 'Aug 9' },
    { id: 5, title: 'Patient intake: 5 automation wins', type: 'Blog', channel: 'Organic', status: 'Live', owner: 'D. Park', date: 'Jul 24' },
    { id: 6, title: 'ABM account brief — Meridian Health', type: 'Sales enablement', channel: 'Outbound', status: 'In review', owner: 'R. Iyer', date: 'Jul 31' }
  ],
  tasks: [
    { id: 't1', title: 'Review Atlas launch creative set', assignee: 'Riya', avatarColor: '#38b06b', avatarLetter: 'R', due: 'Today, 3:00p', priority: 'High', priorityClass: 'tag tag-accent-2', status: 'In progress' },
    { id: 't2', title: 'Approve Q3 budget reallocation', assignee: 'S. Cole', avatarColor: '#ff6a00', avatarLetter: 'S', due: 'Today, 5:00p', priority: 'High', priorityClass: 'tag tag-accent-2', status: 'Needs approval' },
    { id: 't3', title: 'Re-authenticate Google Ads token', assignee: 'Zara', avatarColor: '#4aa8a3', avatarLetter: 'Z', due: 'Tomorrow, 9:00a', priority: 'Medium', priorityClass: 'tag tag-outline', status: 'Waiting' },
    { id: 't4', title: 'Sequence 14 newly-surged accounts', assignee: 'Arjun', avatarColor: '#d13a5c', avatarLetter: 'A', due: 'Tomorrow, 11:00a', priority: 'Medium', priorityClass: 'tag tag-outline', status: 'Waiting' },
    { id: 't5', title: 'Publish SEO cluster pages', assignee: 'D. Park', avatarColor: '#c74dd1', avatarLetter: 'D', due: 'Aug 6', priority: 'Low', priorityClass: 'tag tag-neutral', status: 'Scheduled' },
    { id: 't6', title: 'Finalize invite list — Winter Event', assignee: 'M. Chen', avatarColor: '#3d8bff', avatarLetter: 'M', due: 'Aug 8', priority: 'Low', priorityClass: 'tag tag-neutral', status: 'Not started' }
  ]
};

// Simple file persistence setup
function ensureDb() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf8');
  }
}

function withAgentDefaults(data) {
  return {
    ...data,
    agent_os: data.agent_os ?? null,
    agent_deployments: Array.isArray(data.agent_deployments) ? data.agent_deployments : [],
    scheduled_automations: Array.isArray(data.scheduled_automations)
      ? data.scheduled_automations
      : [],
    automation_runs: Array.isArray(data.automation_runs) ? data.automation_runs : [],
  };
}

export function getDb() {
  ensureDb();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return withAgentDefaults(JSON.parse(raw));
  } catch (err) {
    return withAgentDefaults(initialData);
  }
}

export function updateDb(updater) {
  const current = getDb();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
