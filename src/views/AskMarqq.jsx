import {  useEffect, useRef, useState  } from 'react';
import {  Send, Mic, Square, Paperclip, Loader2, X  } from 'lucide-react';
import { 
  consumeAskMarqqContext,
  loadStrategySectionsForAskMarqq,
 } from '../lib/askMarqqContext';
import {
  applyStrategySectionRevision,
  parseStrategyRevisionBlock,
  revisionPromptHint,
} from '../lib/applyStrategySectionRevision';
import { fetchAskMarqqChat, persistAskMarqqMessages, mergeSeedWithPersisted } from '../lib/askMarqqChat.js';
import ChatMarkdown from '../components/ChatMarkdown.jsx';
import {  askMarqqCompound  } from '../services/groqService';
import {   getActiveWorkspaceId  } from '../lib/brandContext';

const gtmChannels = [
  'executive-summary',
  'market-analysis',
  'target-customer',
  'product-strategy',
  'positioning-messaging',
  'pricing-monetization',
  'distribution-channels',
  'marketing-strategy',
  'sales-strategy',
  'customer-success-retention',
  'launch-plan',
  'operations-execution',
  'financial-plan',
  'measurement-optimization',
  'risks-contingencies',
  'timeline-roadmap',
  'general'
];

const TEXT_DOC_RE = /\.(txt|md|markdown|csv|json|tsv|log)$/i;
const MAX_DOC_CHARS = 12000;

function emptyWelcome(channel) {
  return [
    {
      id: `welcome-${channel}`,
      sender: 'Marqq',
      confidence: 'Ready',
      time: 'Just now',
      text: `Welcome to #${channel}. Ask any question about ${channel.replace(/-/g, ' ')} or request AI strategy updates.`,
      sources: 'GTM Strategy Brief & Active Workspace Data'
    }
  ];
}

function sectionMessages(channel, title, text) {
  return [
    {
      id: `section-${channel}`,
      sender: 'Marqq',
      confidence: 'Section context',
      time: 'Just now',
      text,
      sources: `GTM Strategy · ${title || channel}`,
    },
    {
      id: `ready-${channel}`,
      sender: 'Marqq',
      confidence: 'Ready',
      time: 'Just now',
      text: `You're in #${channel}. Ask follow-up questions or describe the changes you want in this section.`,
      sources: 'Ask Marqq',
    },
  ];
}

function loadNorthStarBrief() {
  try {
    const raw = sessionStorage.getItem('marqq_gtm_strategy');
    if (!raw) return '';
    const doc = JSON.parse(raw);
    const ga = doc?.goalAlignment || {};
    const parts = [
      ga.north_star_metric && `North Star: ${ga.north_star_metric}`,
      ga.quantified_target && `Target: ${ga.quantified_target}`,
      ga.timeline_target && `By: ${ga.timeline_target}`,
      ga.priority_90d && `Priority: ${ga.priority_90d}`,
      ga.channel_bet && `Channel bet: ${ga.channel_bet}`,
    ].filter(Boolean);
    return parts.join('\n');
  } catch {
    return '';
  }
}

function channelToSectionId(channel) {
  if (channel === 'customer-success-retention') return 'customer_success';
  return String(channel || '').replace(/-/g, '_');
}

function loadAskSidebarContext() {
  const company =
    localStorage.getItem('marqq_ob_companyName') ||
    'Workspace';
  const empty = {
    company,
    northStarMetric: '',
    quantifiedTarget: '',
    timelineTarget: '',
    priority90d: '',
    channelBet: '',
    nextSteps: [],
    sectionTargets: [],
    sections: [],
    hasStrategy: false,
  };
  try {
    const raw = sessionStorage.getItem('marqq_gtm_strategy');
    if (!raw) return empty;
    const doc = JSON.parse(raw);
    const ga = doc?.goalAlignment || {};
    return {
      company,
      northStarMetric: String(ga.north_star_metric || '').trim(),
      quantifiedTarget: String(ga.quantified_target || '').trim(),
      timelineTarget: String(ga.timeline_target || '').trim(),
      priority90d: String(ga.priority_90d || '').trim(),
      channelBet: String(ga.channel_bet || '').trim(),
      nextSteps: Array.isArray(doc.nextSteps)
        ? doc.nextSteps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 5)
        : [],
      sectionTargets: Array.isArray(ga.sectionTargets) ? ga.sectionTargets : [],
      sections: Array.isArray(doc.sections) ? doc.sections : [],
      hasStrategy: true,
    };
  } catch {
    return empty;
  }
}

function connectorStatusLabel(c) {
  const status = String(c.status || '').toLowerCase();
  if (c.connected || status === 'active' || status === 'connected' || status === 'success') {
    return { label: 'Connected', tone: 'ok' };
  }
  if (status === 'error' || status === 'failed') return { label: 'Error', tone: 'err' };
  return { label: 'Not connected', tone: 'muted' };
}

function buildSystemPrompt(channel, sectionCtx, northStar) {
  const sectionLabel = channel.replace(/-/g, ' ');
  return `You are Marqq, a senior GTM strategy copilot inside the Marqq platform.

You are chatting in channel #${channel} (${sectionLabel}).

${northStar ? `Company goal system:\n${northStar}\n` : ''}
${sectionCtx
    ? `Current strategy section (authoritative context — use this to answer):\n---\n${sectionCtx}\n---`
    : 'No strategy section is loaded for this channel yet. Answer from general GTM best practice and say what is missing.'}

Rules:
- Answer the user's question directly. If they ask to explain, explain the section clearly in plain language.
- ${revisionPromptHint(channel)}
- Stay grounded in the section context and North Star; do not invent unrelated metrics or markets.
- You have built-in web search. Use it when the user asks about market facts, competitors, the company website, or anything that needs current public information. Prefer evidence from search over guesses.
- When the user attaches documents or voice notes, use that content as primary evidence for this channel.
- Prefer short structured answers (headings/bullets/markdown tables) when helpful. Avoid filler and fake confidence scores.
- Do not refuse ordinary strategy questions. Do not claim you cannot see the section when context is provided above.`;
}

function toChatHistory(messages) {
  return messages
    .filter((m) => {
      if (m.sender === 'You') return true;
      if (m.sender !== 'Marqq') return false;
      if (m.confidence === 'Section context' || m.confidence === 'Ready') return false;
      if (m.confidence === 'Thinking' || m.confidence === 'Attachment') return false;
      return Boolean(m.text?.trim());
    })
    .slice(-10)
    .map((m) => ({
      role: m.sender === 'You' ? 'user' : 'assistant',
      content: m.text,
    }));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file text'));
    reader.readAsText(file);
  });
}

function formatAttachmentsForPrompt(attachments) {
  if (!attachments?.length) return '';
  const parts = attachments.map((a) => {
    if (a.excerpt) {
      return `### ${a.name}\n${a.excerpt}`;
    }
    return `### ${a.name}\n(Binary upload stored in knowledge base${a.fileId ? ` · id ${a.fileId}` : ''}. Summarize/use by filename; ask user to paste text if needed.)`;
  });
  return `\n\n[Attached documents for this channel]\n${parts.join('\n\n')}`;
}

export default function AskMarqq({ setActiveScreen }) {
  const [activeChannel, setActiveChannel] = useState('executive-summary');
  const [chatInput, setChatInput] = useState('');
  const [messagesByChannel, setMessagesByChannel] = useState({});
  const [sectionContextByChannel, setSectionContextByChannel] = useState({});
  const [attachmentsByChannel, setAttachmentsByChannel] = useState({});
  const [asking, setAsking] = useState(false);
  const [applyingRevisionId, setApplyingRevisionId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [voiceWorking, setVoiceWorking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [northStarBrief] = useState(() => loadNorthStarBrief());
  const [sidebar] = useState(() => loadAskSidebarContext());
  const [connectors, setConnectors] = useState([]);
  const [tasks, setTasks] = useState([]);
  const messagesScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const seeds = loadStrategySectionsForAskMarqq();
    const focus = consumeAskMarqqContext();

    const nextContext = {};
    const nextMessages = {};

    for (const seed of seeds) {
      if (!gtmChannels.includes(seed.channel)) continue;
      nextContext[seed.channel] = seed.text;
      nextMessages[seed.channel] = sectionMessages(seed.channel, seed.title, seed.text);
    }

    if (focus?.text) {
      const channel = gtmChannels.includes(focus.channel) ? focus.channel : 'general';
      nextContext[channel] = focus.text;
      nextMessages[channel] = sectionMessages(channel, focus.title, focus.text);
      setActiveChannel(channel);
    } else if (seeds[0]?.channel && gtmChannels.includes(seeds[0].channel)) {
      setActiveChannel(seeds[0].channel);
    }

    setSectionContextByChannel(nextContext);
    setMessagesByChannel(nextMessages);

    // Hydrate durable chat history (survives logout/login)
    (async () => {
      const channels = Object.keys(nextMessages);
      if (!channels.length && focus?.channel) channels.push(focus.channel);
      if (!channels.length) channels.push('executive-summary', 'general');
      const unique = [...new Set(channels)];
      const updates = {};
      await Promise.all(
        unique.map(async (ch) => {
          const loaded = await fetchAskMarqqChat(ch);
          if (!loaded.ok || !loaded.messages?.length) return;
          updates[ch] = mergeSeedWithPersisted(nextMessages[ch] || emptyWelcome(ch), loaded.messages);
        })
      );
      if (cancelled || !Object.keys(updates).length) return;
      setMessagesByChannel((prev) => ({ ...prev, ...updates }));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [intRes, taskRes] = await Promise.all([
          fetch(`/api/integrations?companyId=${encodeURIComponent(getActiveWorkspaceId())}`).then((r) => r.json()).catch(() => ({})),
          fetch('/api/tasks').then((r) => r.json()).catch(() => ({})),
        ]);
        if (cancelled) return;
        const list = Array.isArray(intRes?.connectors)
          ? intRes.connectors
          : Array.isArray(intRes)
            ? intRes
            : [];
        setConnectors(
          list
            .map((c) => ({
              id: c.id || c.connectorId,
              name: c.name || c.label || c.id,
              connected: Boolean(c.connected),
              status: c.status || 'not_connected',
            }))
            .filter((c) => c.id)
            .slice(0, 6)
        );
        const taskList = Array.isArray(taskRes?.tasks)
          ? taskRes.tasks
          : Array.isArray(taskRes)
            ? taskRes
            : [];
        setTasks(
          taskList
            .filter((t) => {
              const s = String(t.status || '').toLowerCase();
              return s !== 'done' && s !== 'completed';
            })
            .slice(0, 4)
        );
      } catch {
        /* keep empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentMessages =
    messagesByChannel[activeChannel] || emptyWelcome(activeChannel);
  const pendingAttachments = attachmentsByChannel[activeChannel] || [];

  const activeSectionId = channelToSectionId(activeChannel);
  const activeSectionTarget = (sidebar.sectionTargets || []).find(
    (t) => String(t.sectionId || t.id || '') === activeSectionId
  );
  const activeSectionMeta = (sidebar.sections || []).find(
    (s) => String(s.id || '') === activeSectionId
  );
  const sidebarNextSteps =
    sidebar.nextSteps?.length
      ? sidebar.nextSteps
      : tasks.length
        ? []
        : sidebar.hasStrategy
          ? []
          : ['Generate a GTM strategy to populate this panel'];

  const lastMessage = currentMessages[currentMessages.length - 1];

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [activeChannel, currentMessages.length, asking, lastMessage?.id, lastMessage?.text]);

  const startVoiceRecording = async () => {
    if (!('MediaRecorder' in window)) {
      setComposerError('Voice recording not supported in this browser.');
      return;
    }
    setComposerError('');
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => stream.getTracks().forEach((t) => t.stop());
      mr.start(250);
      setRecording(true);
    } catch (err) {
      setComposerError(err.message || 'Microphone permission denied');
    }
  };

  const stopVoiceRecording = async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    setRecording(false);
    setVoiceWorking(true);
    setComposerError('');
    try {
      await new Promise((r) => {
        mr.addEventListener('stop', r, { once: true });
        mr.stop();
      });
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      if (!blob.size) throw new Error('No audio captured');
      const base64 = await fileToBase64(blob);
      const res = await fetch('/api/voicebot/stt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: getActiveWorkspaceId(),
          audioBase64: base64,
          mimeType: blob.type || 'audio/webm',
          language: 'en',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Transcription failed');
      const text = String(json?.transcript || '').trim();
      if (!text) throw new Error('No speech detected — try speaking a bit longer.');
      setChatInput((prev) => (prev ? `${prev.trim()} ${text}` : text));
    } catch (err) {
      setComposerError(err.message || 'Voice capture failed');
    } finally {
      setVoiceWorking(false);
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    }
  };

  const handleDocUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setComposerError('');
    const channel = activeChannel;
    const created = [];

    try {
      for (const file of files) {
        const isText = TEXT_DOC_RE.test(file.name) || (file.type || '').startsWith('text/');
        let excerpt = '';
        if (isText) {
          const raw = await readFileText(file);
          excerpt = raw.slice(0, MAX_DOC_CHARS);
          if (raw.length > MAX_DOC_CHARS) excerpt += '\n…(truncated)';
        }

        let fileId = null;
        try {
          const base64 = await fileToBase64(file);
          const res = await fetch('/api/brand-dna/knowledge-base', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId: getActiveWorkspaceId(),
              files: [
                {
                  name: file.name,
                  mime: file.type || 'application/octet-stream',
                  size: file.size,
                  base64,
                  category: 'ask_marqq_chat',
                  transcript: excerpt || undefined,
                },
              ],
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (res.ok && Array.isArray(json.files) && json.files[0]?.id) {
            fileId = json.files[0].id;
          }
        } catch {
          /* local-only attachment still usable for text */
        }

        created.push({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          excerpt,
          fileId,
        });
      }

      setAttachmentsByChannel((prev) => ({
        ...prev,
        [channel]: [...(prev[channel] || []), ...created],
      }));

      // System-style note in the channel thread
      setMessagesByChannel((prev) => ({
        ...prev,
        [channel]: [
          ...(prev[channel] || emptyWelcome(channel)),
          {
            id: Date.now(),
            sender: 'Marqq',
            confidence: 'Attachment',
            time: 'Just now',
            text: `Attached for #${channel}: ${created.map((c) => c.name).join(', ')}. Ask a question or say how to use ${created.length === 1 ? 'it' : 'them'} in this section.`,
            sources: 'Ask Marqq uploads',
          },
        ],
      }));
    } catch (err) {
      setComposerError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id) => {
    setAttachmentsByChannel((prev) => ({
      ...prev,
      [activeChannel]: (prev[activeChannel] || []).filter((a) => a.id !== id),
    }));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if ((!chatInput.trim() && !pendingAttachments.length) || asking) return;

    const channel = activeChannel;
    const attachments = attachmentsByChannel[channel] || [];
    const promptText =
      (chatInput.trim() ||
        (attachments.length
          ? `Review the attached document${attachments.length > 1 ? 's' : ''} for #${channel} and summarize implications for this strategy section.`
          : '')) + formatAttachmentsForPrompt(attachments);
    const displayText =
      chatInput.trim() ||
      (attachments.length ? `Shared ${attachments.map((a) => a.name).join(', ')}` : '');

    const sectionCtx = sectionContextByChannel[channel] || '';
    const prior = messagesByChannel[channel] || currentMessages;

    const userMsg = {
      id: Date.now(),
      sender: 'You',
      time: 'Just now',
      text: displayText,
      attachments: attachments.map((a) => a.name),
    };
    const thinkingId = Date.now() + 1;
    const thinkingMsg = {
      id: thinkingId,
      sender: 'Marqq',
      confidence: 'Thinking',
      time: 'Just now',
      text: 'Searching and drafting a reply…',
      sources: sectionCtx ? 'GTM Strategy · compound-mini' : 'Ask Marqq · compound-mini',
    };

    setChatInput('');
    setComposerError('');
    setAsking(true);
    setAttachmentsByChannel((prev) => ({ ...prev, [channel]: [] }));
    setMessagesByChannel((prev) => ({
      ...prev,
      [channel]: [...(prev[channel] || prior), userMsg, thinkingMsg],
    }));

    try {
      const history = toChatHistory([
        ...prior,
        { ...userMsg, text: promptText },
      ]);
      const result = await askMarqqCompound(
        history,
        buildSystemPrompt(channel, sectionCtx, northStarBrief)
      );

      const rawText =
        (result?.content && String(result.content).trim()) ||
        (sectionCtx
          ? `I could not reach the model just now. Based on the loaded #${channel} section, ask again in a moment — or tell me whether you want an explanation, a rewrite, or a specific change.`
          : `I could not reach the model just now. Try again in a moment.`);

      const parsed = parseStrategyRevisionBlock(rawText);
      const text = parsed.displayText || rawText;

      const sourceBits = [
        sectionCtx ? `GTM Strategy · #${channel}` : null,
        attachments.length ? 'Uploaded docs' : null,
        result?.usedSearch ? 'Web search' : null,
        parsed.revision ? 'Revision ready' : null,
        'groq/compound-mini',
      ].filter(Boolean);

      const assistantMsg = {
        id: Date.now() + 2,
        sender: 'Marqq',
        confidence: parsed.revision
          ? 'Revision draft'
          : result?.usedSearch
            ? 'Web + strategy'
            : sectionCtx
              ? 'Grounded'
              : 'General',
        time: 'Just now',
        text,
        sources: sourceBits.join(' · '),
        revision: parsed.revision || null,
        revisionApplied: false,
        sectionId: channelToSectionId(channel),
      };

      setMessagesByChannel((prev) => ({
        ...prev,
        [channel]: (prev[channel] || [])
          .filter((m) => m.id !== thinkingId)
          .concat(assistantMsg),
      }));

      void persistAskMarqqMessages(channel, [userMsg, assistantMsg]);
    } catch {
      const errMsg = {
        id: Date.now() + 2,
        sender: 'Marqq',
        confidence: 'Error',
        time: 'Just now',
        text: 'Something went wrong generating a reply. Please try again.',
        sources: 'Ask Marqq',
      };
      setMessagesByChannel((prev) => ({
        ...prev,
        [channel]: (prev[channel] || [])
          .filter((m) => m.id !== thinkingId)
          .concat(errMsg),
      }));
      void persistAskMarqqMessages(channel, [userMsg, errMsg]);
    } finally {
      setAsking(false);
    }
  };

  const handleApplyRevision = async (message) => {
    if (!message?.revision || message.revisionApplied || applyingRevisionId) return;
    const channel = activeChannel;
    const sectionId = message.sectionId || channelToSectionId(channel);
    setApplyingRevisionId(message.id);
    setComposerError('');
    try {
      const result = await applyStrategySectionRevision({
        sectionId,
        revision: message.revision,
      });
      if (!result.ok) {
        setComposerError(result.error || 'Failed to apply revision');
        return;
      }

      if (result.channelText) {
        setSectionContextByChannel((prev) => ({
          ...prev,
          [channel]: result.channelText,
        }));
      }

      setMessagesByChannel((prev) => {
        const list = [...(prev[channel] || [])];
        const idx = list.findIndex((m) => m.id === message.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], revisionApplied: true, confidence: 'Locked for agents' };
        }
        const lockNote = {
          id: Date.now() + 3,
          sender: 'Marqq',
          confidence: 'Locked',
          time: 'Just now',
          text: `Applied and re-locked **${activeSectionMeta?.title || sectionId.replace(/_/g, ' ')}** into the GTM strategy. Agent deployments for this section were refreshed with the new draft copy (draft mode only — nothing published).`,
          sources: 'Strategy lock · Agent OS',
        };
        list.push(lockNote);
        void persistAskMarqqMessages(channel, [
          list[idx] || { ...message, revisionApplied: true },
          lockNote,
        ]);
        return { ...prev, [channel]: list };
      });
    } catch (err) {
      setComposerError(err?.message || 'Failed to apply revision');
    } finally {
      setApplyingRevisionId(null);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', border: '2px solid var(--color-divider)', background: 'var(--color-bg)', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{ width: '220px', borderRight: '2px solid var(--color-divider)', padding: '14px 10px', overflowY: 'auto', flex: 'none', background: 'var(--color-surface)' }}>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '12px', fontWeight: 800, paddingLeft: '6px' }}>
          CHANNELS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {gtmChannels.map(channel => {
            const isSelected = activeChannel === channel;
            return (
              <div
                key={channel}
                onClick={() => {
                  setActiveChannel(channel);
                  // Lazy-hydrate this channel if we only have seeds
                  void (async () => {
                    const existing = messagesByChannel[channel] || [];
                    const hasDurable = existing.some(
                      (m) => m.persisted || (m.sender === 'You') || (m.sender === 'Marqq' && !['Ready', 'Section context', 'Thinking'].includes(m.confidence))
                    );
                    if (hasDurable) return;
                    const loaded = await fetchAskMarqqChat(channel);
                    if (!loaded.ok || !loaded.messages?.length) return;
                    setMessagesByChannel((prev) => ({
                      ...prev,
                      [channel]: mergeSeedWithPersisted(prev[channel] || emptyWelcome(channel), loaded.messages),
                    }));
                  })();
                }}
                style={{
                  padding: '7px 10px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  borderRadius: '0px',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: isSelected ? 800 : 400,
                  color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
                  background: isSelected ? 'rgba(255, 106, 0, 0.1)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                #{channel}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: '320px', background: 'var(--color-bg)' }}>
        <div style={{ padding: '16px 20px 14px', borderBottom: '2px solid var(--color-divider)', fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '16px', lineHeight: 1.35, color: 'var(--color-text)', overflow: 'visible' }}>
          #{activeChannel}
          {sectionContextByChannel[activeChannel] ? (
            <span className="text-muted" style={{ fontWeight: 500, fontSize: 12, marginLeft: 10, lineHeight: 1.4 }}>
              Strategy section loaded
            </span>
          ) : null}
        </div>

        <div
          ref={messagesScrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          {currentMessages.map(m => (
            <div key={m.id} style={{ maxWidth: '680px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '13px' }}>
                  {m.sender}
                </span>
                {m.confidence && (
                  <span className="tag tag-accent" style={{ fontSize: '10px', padding: '2px 6px' }}>
                    {m.confidence}
                  </span>
                )}
                <span className="text-muted" style={{ fontSize: '11px' }}>{m.time}</span>
              </div>

              <div className="card" style={{ gap: '10px', padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-divider)' }}>
                <ChatMarkdown text={m.text} />
                {Array.isArray(m.attachments) && m.attachments.length ? (
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                    Files: {m.attachments.join(', ')}
                  </div>
                ) : null}
                {m.sources ? (
                <div className="card-meta" style={{ fontSize: '11px', color: 'color-mix(in srgb, var(--color-text) 50%, transparent)' }}>
                  Sources: {m.sources}
                </div>
                ) : null}
                {m.revision && !m.revisionApplied ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(applyingRevisionId)}
                      onClick={() => handleApplyRevision(m)}
                    >
                      {applyingRevisionId === m.id ? 'Applying…' : 'Apply to strategy & re-lock'}
                    </button>
                    <span className="text-muted" style={{ fontSize: 11, alignSelf: 'center' }}>
                      Updates this section for agents (drafts only)
                    </span>
                  </div>
                ) : null}
                {m.revisionApplied ? (
                  <div style={{ fontSize: 11, color: 'var(--color-accent)', marginTop: 6, fontWeight: 700 }}>
                    Applied · locked for agents
                  </div>
                ) : null}
                {m.hasAction && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setActiveScreen && setActiveScreen(m.actionScreen || 'approvals')}
                    >
                      {m.actionLabel}
                    </button>
                    <button type="button" className="btn btn-secondary">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '12px 20px 16px', borderTop: '2px solid var(--color-divider)', background: 'var(--color-surface)' }}>
          {pendingAttachments.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {pendingAttachments.map((a) => (
                <span
                  key={a.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    padding: '4px 8px',
                    border: '1px solid var(--color-divider)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                  }}
                >
                  {a.name}
                  <button
                    type="button"
                    onClick={() => removeAttachment(a.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
                    aria-label={`Remove ${a.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {composerError ? (
            <div style={{ fontSize: 12, color: 'var(--color-accent)', marginBottom: 8 }}>{composerError}</div>
          ) : null}
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt,.md,.csv,.json,.pptx,.ppt,.png,.jpg,.jpeg,.webp"
              style={{ display: 'none' }}
              onChange={(e) => handleDocUpload(e.target.files)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={asking || uploading}
              title={`Upload docs for #${activeChannel}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Paperclip size={14} />}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={asking || voiceWorking}
              title={recording ? 'Stop recording' : `Voice note for #${activeChannel}`}
              onClick={() => (recording ? stopVoiceRecording() : startVoiceRecording())}
              style={recording ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
            >
              {voiceWorking ? (
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              ) : recording ? (
                <Square size={14} />
              ) : (
                <Mic size={14} />
              )}
            </button>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder={
                recording
                  ? 'Recording… click stop when done'
                  : `Ask Marqq anything about #${activeChannel}…`
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={asking || recording}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={asking || recording || (!chatInput.trim() && !pendingAttachments.length)}
            >
              <Send size={14} />
            </button>
          </form>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
            Voice and uploads apply to #{activeChannel} only.
          </div>
        </div>
      </div>

      <div style={{ width: '240px', borderLeft: '2px solid var(--color-divider)', padding: '14px', overflowY: 'auto', flex: 'none', display: 'flex', flexDirection: 'column', gap: '18px', background: 'var(--color-surface)' }}>
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '8px', fontWeight: 800 }}>
            NORTH STAR
          </div>
          <div className="card" style={{ padding: '12px' }}>
            {sidebar.hasStrategy && (sidebar.northStarMetric || sidebar.quantifiedTarget) ? (
              <>
                <div className="card-title" style={{ fontSize: 14, lineHeight: 1.35 }}>
                  {sidebar.northStarMetric || sidebar.quantifiedTarget}
                </div>
                <div className="card-meta" style={{ marginTop: 4, lineHeight: 1.4 }}>
                  {[
                    sidebar.quantifiedTarget && sidebar.northStarMetric ? sidebar.quantifiedTarget : null,
                    sidebar.timelineTarget ? `by ${sidebar.timelineTarget}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || sidebar.company}
                </div>
                {sidebar.priority90d ? (
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                    {sidebar.priority90d}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="card-title" style={{ fontSize: 14 }}>{sidebar.company}</div>
                <div className="card-meta" style={{ marginTop: 4 }}>
                  No strategy North Star yet — finish the GTM Wizard.
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '8px', fontWeight: 800 }}>
            THIS CHANNEL
          </div>
          <div className="card" style={{ padding: '12px' }}>
            <div className="card-title" style={{ fontSize: 13 }}>
              #{activeChannel}
            </div>
            {activeSectionMeta?.title ? (
              <div className="card-meta" style={{ marginTop: 4 }}>{activeSectionMeta.title}</div>
            ) : null}
            {activeSectionTarget?.metric ? (
              <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
                Leading metric: {activeSectionTarget.metric}
              </div>
            ) : sectionContextByChannel[activeChannel] ? (
              <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                Strategy section loaded in chat.
              </div>
            ) : (
              <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                No section text loaded for this channel yet.
              </div>
            )}
            {activeSectionTarget?.owner ? (
              <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
                Owner: {activeSectionTarget.owner}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '8px', fontWeight: 800 }}>
            CONNECTORS
          </div>
          {connectors.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {connectors.map((c) => {
                const st = connectorStatusLabel(c);
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '12px' }}>{c.name}</span>
                    <span
                      className={st.tone === 'ok' ? 'tag tag-accent' : st.tone === 'err' ? 'tag tag-accent-2' : 'tag tag-neutral'}
                      style={{ fontSize: '10px' }}
                    >
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
              No connectors linked yet.
              <button
                type="button"
                className="btn btn-ghost"
                style={{ display: 'block', marginTop: 6, padding: 0, fontSize: 12 }}
                onClick={() => setActiveScreen && setActiveScreen('integrations')}
              >
                Open Integrations →
              </button>
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: '8px', fontWeight: 800 }}>
            NEXT STEPS
          </div>
          {tasks.length ? (
            tasks.map((t) => (
              <div key={t.id || t.title} style={{ fontSize: '12px', marginBottom: '8px', lineHeight: 1.4 }}>
                {t.title || t.name || 'Task'}
                {t.status ? (
                  <span className="text-muted"> — {String(t.status).toLowerCase()}</span>
                ) : null}
              </div>
            ))
          ) : sidebarNextSteps.length ? (
            sidebarNextSteps.map((step) => (
              <div key={step} style={{ fontSize: '12px', marginBottom: '8px', lineHeight: 1.4 }}>
                {step}
              </div>
            ))
          ) : (
            <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
              No open tasks. Strategy next steps will appear here after generation.
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={() => setActiveScreen && setActiveScreen('knowledge')}
          style={{ marginTop: 'auto', fontSize: '12px' }}
        >
          Open Brand Knowledge Base
        </button>
      </div>
    </div>
  );
}
