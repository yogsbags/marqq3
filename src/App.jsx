import React, { useState, useEffect } from 'react';
import Header from './components/common/Header.jsx';
import Sidebar from './components/common/Sidebar.jsx';
import ModalContainer from './components/common/ModalContainer.jsx';
import { ensureElevateWorkspace, isOnboardingComplete } from './lib/workspaceBootstrap.js';

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

export default function App() {
  const [activeScreen, setActiveScreenState] = useState(() => {
    const { startOnboarding } = ensureElevateWorkspace();
    if (startOnboarding || !isOnboardingComplete()) return 'onboarding';
    return localStorage.getItem('marqq_active_screen') || 'command';
  });

  const setActiveScreen = (screen) => {
    // First-time users must finish onboarding before entering the app
    if (!isOnboardingComplete() && screen !== 'onboarding' && screen !== 'login' && screen !== 'signup') {
      setActiveScreenState('onboarding');
      localStorage.setItem('marqq_active_screen', 'onboarding');
      return;
    }
    setActiveScreenState(screen);
    localStorage.setItem('marqq_active_screen', screen);
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
  if (activeScreen === 'login') {
    return <SignInView setActiveScreen={setActiveScreen} />;
  }

  if (activeScreen === 'signup') {
    return <SignUpView setActiveScreen={setActiveScreen} />;
  }

  if (activeScreen === 'onboarding') {
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
          onLogout={() => setActiveScreen('login')}
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
          {activeScreen === 'calendar' && <CalendarView />}
          {activeScreen === 'leadmagnets' && <LeadMagnetsView />}
          {activeScreen === 'crm' && <CrmView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'paid' && <PaidStudio setActiveScreen={setActiveScreen} />}
          {activeScreen === 'social' && <SocialStudio setActiveScreen={setActiveScreen} />}
          {activeScreen === 'voicebot' && <VoicebotView />}
          {activeScreen === 'experiments' && <ExperimentsView />}
          {activeScreen === 'reporting' && <ReportingView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'referrals' && <ReferralsView />}
          {activeScreen === 'orchestration' && <OrchestrationView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'evaluations' && <EvaluationsView />}
          {activeScreen === 'knowledge' && <KnowledgeView />}
          {activeScreen === 'files' && <FilesView />}
          {activeScreen === 'integrations' && <IntegrationsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'admin' && <AdminView />}
          {activeScreen === 'help' && <HelpView />}

          {activeScreen === 'strategy' && <StrategyView setActiveModal={setActiveModal} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'market' && <MarketView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'analytics' && <AnalyticsView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'audiences' && <AudiencesView setActiveModal={setActiveModal} setActiveScreen={setActiveScreen} />}
          {activeScreen === 'brand' && <BrandView setActiveScreen={setActiveScreen} />}
          {activeScreen === 'landingpages' && <LandingPagesView />}
          {activeScreen === 'billing' && <BillingView />}
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
