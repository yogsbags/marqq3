import React, { useState, useEffect } from 'react';
import Header from './components/common/Header.jsx';
import Sidebar from './components/common/Sidebar.jsx';
import ModalContainer from './components/common/ModalContainer.jsx';
import { ensureElevateWorkspace, isOnboardingComplete } from './lib/workspaceBootstrap.js';
import { supabase } from './lib/supabase.js';

import CommandCenter from './views/CommandCenter.jsx';
import AskMarqq from './views/AskMarqq.jsx';
import GtmWizard from './views/GtmWizard';
import AgentsHub from './views/AgentsHub.jsx';
import OutreachStudio from './views/OutreachStudio.jsx';
import CampaignsView from './views/CampaignsView.jsx';
import ContentStudio from './views/ContentStudio.jsx';
import SocialStudio from './views/SocialStudio.jsx';
import CreativeStudio from './views/CreativeStudio.jsx';
import PaidStudio from './views/PaidStudio.jsx';
import TaskBoard from './views/TaskBoard.jsx';
import ApprovalsQueue from './views/ApprovalsQueue.jsx';
import { SignInView, SignUpView, OnboardingView } from './views/AuthAndOnboarding.jsx';
import { IntegrationsView } from './views/IntegrationsView.jsx';
import {
  IdeasView,
  CalendarView,
  LeadMagnetsView,
  CrmView,
  VoicebotView,
  ExperimentsView,
  ReportingView,
  ReferralsView,
  OrchestrationView,
  EvaluationsView,
  KnowledgeView,
  FilesView,
  AdminView,
  HelpView,
  StrategyView,
  MarketView,
  AnalyticsView,
  AudiencesView,
  BrandView,
  LandingPagesView,
  BillingView,
  WorkflowsView,
  PricingView,
  SeoView,
  Customer360View,
  SimpleView
} from './views/OtherViews.jsx';
import { agentsFromOs, defaultUiAgents, loadAgentOs } from './lib/agents';

const AUTH_SCREENS = new Set(['login', 'signup']);
const PRE_APP_SCREENS = new Set(['login', 'signup', 'onboarding']);

function resolveAuthedScreen() {
  if (!isOnboardingComplete()) return 'onboarding';
  const saved = localStorage.getItem('marqq_active_screen');
  if (saved && !PRE_APP_SCREENS.has(saved)) return saved;
  return 'command';
}

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  // Default to login so Railway / fresh browsers never open the app shell first
  const [activeScreen, setActiveScreenState] = useState('login');

  useEffect(() => {
    ensureElevateWorkspace();

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const next = data?.session || null;
      setSession(next);
      if (!next) {
        setActiveScreenState('login');
        localStorage.setItem('marqq_active_screen', 'login');
      } else {
        const screen = resolveAuthedScreen();
        setActiveScreenState(screen);
        localStorage.setItem('marqq_active_screen', screen);
      }
      setAuthReady(true);
    }).catch(() => {
      if (!mounted) return;
      setSession(null);
      setActiveScreenState('login');
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setActiveScreenState('login');
        localStorage.setItem('marqq_active_screen', 'login');
        return;
      }
      // After successful sign-in / sign-up, leave auth screens
      if (event === 'SIGNED_IN') {
        const screen = resolveAuthedScreen();
        setActiveScreenState(screen);
        localStorage.setItem('marqq_active_screen', screen);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const setActiveScreen = (screen) => {
    const target = String(screen || 'login');

    // Unauthenticated: only login / signup
    if (!session && !AUTH_SCREENS.has(target)) {
      setActiveScreenState('login');
      localStorage.setItem('marqq_active_screen', 'login');
      return;
    }

    // Authenticated but onboarding incomplete: stay in onboarding (or allow login/signup)
    if (
      session &&
      !isOnboardingComplete() &&
      !PRE_APP_SCREENS.has(target)
    ) {
      setActiveScreenState('onboarding');
      localStorage.setItem('marqq_active_screen', 'onboarding');
      return;
    }

    setActiveScreenState(target);
    localStorage.setItem('marqq_active_screen', target);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    setSession(null);
    setActiveScreenState('login');
    localStorage.setItem('marqq_active_screen', 'login');
  };

  const [activeModal, setActiveModal] = useState(null);

  // State initialized with mockup default values
  const [kpis, setKpis] = useState([]);
  const [changes, setChanges] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [agents, setAgents] = useState(() => {
    try {
      return agentsFromOs(loadAgentOs());
    } catch {
      return defaultUiAgents();
    }
  });
  const [agentLogs, setAgentLogs] = useState({});
  const [approvals, setApprovals] = useState([]);
  const [approvedActions, setApprovedActions] = useState({});
  const [prospects, setProspects] = useState([]);
  const [contentItems, setContentItems] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Refresh agents from session OS when opening Agents Hub / Command Center
  useEffect(() => {
    if (activeScreen !== 'agents' && activeScreen !== 'command') return;
    try {
      const fromOs = agentsFromOs(loadAgentOs());
      if (fromOs?.length) setAgents(fromOs);
    } catch {
      /* keep current */
    }
  }, [activeScreen]);

  // Fetch initial data from REST API backend
  useEffect(() => {
    async function loadData() {
      const safeFetchJson = async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return {};
          return await res.json();
        } catch (e) {
          return {};
        }
      };

      try {
        const [dashRes, analyticsRes, campRes, agRes, appRes, prosRes, taskRes] = await Promise.all([
          safeFetchJson('/api/dashboard'),
          safeFetchJson('/api/analytics/dashboard?period=30d&companyId=marqq-ws-1'),
          safeFetchJson('/api/campaigns'),
          safeFetchJson('/api/agents'),
          safeFetchJson('/api/approvals'),
          safeFetchJson('/api/outreach/prospects'),
          safeFetchJson('/api/tasks')
        ]);

        if (analyticsRes?.kpis?.length) {
          setKpis(analyticsRes.kpis);
        } else if (dashRes && dashRes.kpis) {
          setKpis(dashRes.kpis);
        }
        if (dashRes && dashRes.changes) setChanges(dashRes.changes);
        if (dashRes && dashRes.priorities) setPriorities(dashRes.priorities);
        if (campRes && campRes.campaigns) setCampaigns(campRes.campaigns);
        const osAgents = agentsFromOs(loadAgentOs());
        if (osAgents?.length && loadAgentOs()?.agent_roster) {
          setAgents(osAgents);
        } else if (agRes && agRes.agents && agRes.agents.length > 0) {
          setAgents(agRes.agents);
        } else {
          setAgents(defaultUiAgents());
        }
        if (agRes && agRes.agentLogs) setAgentLogs(agRes.agentLogs);
        if (appRes && appRes.approvals) setApprovals(appRes.approvals);
        if (prosRes && prosRes.prospects) setProspects(prosRes.prospects);
        if (taskRes && taskRes.tasks) setTasks(taskRes.tasks);
      } catch (err) {
        // Silent fallback
      }
    }
    loadData();
  }, []);

  // Handlers
  const handleDecideAction = (key, decision) => {
    setApprovedActions(prev => ({ ...prev, [key]: decision }));
  };

  const handleUndoAction = (key) => {
    setApprovedActions(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleCreateCampaign = (newCamp) => {
    const created = {
      id: `c${Date.now()}`,
      name: newCamp.name || 'Untitled Campaign',
      objective: newCamp.objective || 'Pipeline',
      status: 'Active',
      budget: newCamp.budget || '$50,000',
      spend: '$0',
      roas: '0.0x',
      owner: 'Sarah Cole',
      updated: 'Just now',
      pacing: '0%'
    };
    setCampaigns(prev => [created, ...prev]);

    // Async sync with API backend
    try {
      fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(created)
      });
    } catch (e) { }
  };

  const handleUpdateTaskStatus = (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) { }
  };

  // Full-screen Auth & Onboarding Views
  if (!authReady) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 22 }}>
          MARQQ<span style={{ color: 'var(--color-accent)' }}>.</span>
        </div>
      </div>
    );
  }

  // Unauthenticated: only login / signup (signup must win over the !session catch-all)
  if (!session) {
    if (activeScreen === 'signup') {
      return <SignUpView setActiveScreen={setActiveScreen} />;
    }
    return <SignInView setActiveScreen={setActiveScreen} />;
  }

  if (activeScreen === 'login') {
    return <SignInView setActiveScreen={setActiveScreen} />;
  }

  if (activeScreen === 'signup') {
    return <SignUpView setActiveScreen={setActiveScreen} />;
  }

  if (activeScreen === 'onboarding' || !isOnboardingComplete()) {
    return <OnboardingView setActiveScreen={setActiveScreen} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', overflow: 'hidden' }}>
      {/* Left Sidebar Navigation */}
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        onOpenModal={(modal) => setActiveModal(modal)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          creditBalance="1,790"
          pendingApprovalsCount={3 - Object.keys(approvedActions).length}
          onOpenModal={(modal) => setActiveModal(modal)}
          onLogout={handleLogout}
        />

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 60px' }}>
          {activeScreen === 'command' && (
            <CommandCenter
              agents={agents}
              setActiveScreen={setActiveScreen}
            />
          )}

          {activeScreen === 'chat' && (
            <AskMarqq
              setActiveScreen={setActiveScreen}
            />
          )}

          {activeScreen === 'gtmwizard' && (
            <GtmWizard setActiveScreen={setActiveScreen} />
          )}

          {activeScreen === 'agents' && (
            <AgentsHub
              agents={agents}
              agentLogs={agentLogs}
              approvedActions={approvedActions}
              onDecideAction={handleDecideAction}
              onUndoAction={handleUndoAction}
              setActiveScreen={setActiveScreen}
            />
          )}

          {activeScreen === 'outreach' && (
            <OutreachStudio setActiveScreen={setActiveScreen} prospects={prospects} />
          )}

          {activeScreen === 'campaigns' && (
            <CampaignsView
              campaigns={campaigns}
              onOpenModal={(modal) => setActiveModal(modal)}
            />
          )}

          {activeScreen === 'content' && (
            <ContentStudio setActiveScreen={setActiveScreen} />
          )}

          {activeScreen === 'tasks' && (
            <TaskBoard
              tasks={tasks}
              onUpdateTaskStatus={handleUpdateTaskStatus}
            />
          )}

          {activeScreen === 'approvals' && (
            <ApprovalsQueue
              approvals={approvals}
              approvedActions={approvedActions}
              onDecideAction={handleDecideAction}
              onUndoAction={handleUndoAction}
            />
          )}

          {/* Full-featured implementations of all remaining views */}
          {activeScreen === 'ideas' && <IdeasView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'calendar' && <CalendarView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'leadmagnets' && <LeadMagnetsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'crm' && <CrmView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'paid' && <PaidStudio setActiveScreen={setActiveScreen} />}
          {activeScreen === 'social' && <SocialStudio setActiveScreen={setActiveScreen} />}
          {activeScreen === 'voicebot' && <VoicebotView />}
          {activeScreen === 'experiments' && <ExperimentsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'reporting' && <ReportingView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'referrals' && <ReferralsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'orchestration' && <OrchestrationView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'evaluations' && <EvaluationsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'knowledge' && <KnowledgeView />}
          {activeScreen === 'files' && <FilesView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'integrations' && <IntegrationsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'admin' && <AdminView />}
          {activeScreen === 'help' && <HelpView setActiveScreen={setActiveScreen} />}

          {activeScreen === 'strategy' && <StrategyView setActiveModal={setActiveModal} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'market' && <MarketView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'analytics' && <AnalyticsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'audiences' && <AudiencesView setActiveModal={setActiveModal} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'brand' && <BrandView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'landingpages' && <LandingPagesView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'billing' && <BillingView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'workflows' && <WorkflowsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'pricing' && <PricingView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'seo' && <SeoView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'creative' && <CreativeStudio setActiveScreen={setActiveScreen} />}
          {activeScreen === 'customer360' && <Customer360View setActiveScreen={setActiveScreen} />}
        </main>
      </div>

      {/* Global Modals */}
      <ModalContainer
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        onCreateCampaign={handleCreateCampaign}
        onCreateWorkspace={(name) => alert(`Workspace "${name}" created!`)}
      />
    </div>
  );
}
