import React, { useEffect, useState } from "react";

/**
 * Brand DNA–style working loader (orb + shimmer + steps + progress).
 * Used in onboarding Brand DNA fetch and GTM strategy section drafting.
 */
export function BrandStyleLoader({
  title = "Working…",
  website = "",
  steps: stepsProp,
  messages: messagesProp,
}) {
  const [activeStep, setActiveStep] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(4);

  const steps = stepsProp || [
    { icon: "🌐", label: "Fetching website", detail: website || "your site" },
    { icon: "🎨", label: "Extracting colors & fonts", detail: "from CSS & theme-color" },
    { icon: "✦", label: "Reading brand signals", detail: "title · meta · H1" },
    { icon: "🖼️", label: "Locating logo", detail: "favicon & apple-touch-icon" },
    { icon: "🤖", label: "Synthesizing with AI", detail: "Llama 3.3 70B via Groq" },
  ];

  const messages = messagesProp || [
    `Visiting ${website || "your website"}…`,
    "Scanning CSS for brand colors…",
    "Reading meta description & H1…",
    "Resolving favicon & logo…",
    "Running AI Brand DNA synthesis…",
    "Extracting tone of voice…",
    "Generating brand tagline…",
    "Almost there — finalizing…",
  ];

  useEffect(() => {
    const delays = [900, 1800, 2600, 3500, 4400];
    const timers = delays.map((d, i) => setTimeout(() => setActiveStep(i + 1), d));
    const pTimer = setInterval(() => setProgress((p) => Math.min(p + 1.4, 96)), 100);
    const mTimer = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 1400);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(pTimer);
      clearInterval(mTimer);
    };
  }, [messages.length]);

  useEffect(() => {
    const id = "bda-keyframes";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      @keyframes bda-spin  { to { transform: rotate(360deg); } }
      @keyframes bda-spin2 { to { transform: rotate(-360deg); } }
      @keyframes bda-pulse-glow {
        0%,100% { box-shadow: 0 0 0 0 rgba(255,101,33,0.5), 0 0 32px 8px rgba(255,101,33,0.18); }
        50%      { box-shadow: 0 0 0 12px rgba(255,101,33,0), 0 0 48px 16px rgba(255,101,33,0.28); }
      }
      @keyframes bda-shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position: 400px 0; }
      }
      @keyframes bda-fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      @keyframes bda-tick   { from { transform:scale(0) rotate(-45deg); opacity:0; } to { transform:scale(1) rotate(0); opacity:1; } }
    `;
    document.head.appendChild(s);
  }, []);

  return (
    <div
      style={{
        margin: "8px 0 16px",
        borderRadius: "14px",
        border: "1px solid rgba(255,101,33,0.18)",
        background: "linear-gradient(160deg, rgba(255,101,33,0.06) 0%, rgba(0,0,0,0) 60%)",
        padding: "28px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.025) 50%, transparent 100%)",
          backgroundSize: "800px 100%",
          animation: "bda-shimmer 2.4s linear infinite",
        }}
      />

      <div style={{ position: "relative", width: 72, height: 72, marginBottom: 20 }}>
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: "1.5px dashed rgba(255,101,33,0.35)",
            animation: "bda-spin 4s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: "50%",
            border: "1.5px solid transparent",
            borderTopColor: "rgba(255,101,33,0.7)",
            borderRightColor: "rgba(255,101,33,0.3)",
            animation: "bda-spin 1.8s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 10,
            borderRadius: "50%",
            border: "1px solid transparent",
            borderBottomColor: "rgba(255,154,107,0.5)",
            animation: "bda-spin2 2.6s linear infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 40% 38%, rgba(255,130,60,0.28), rgba(20,10,5,0.95))",
            animation: "bda-pulse-glow 2s ease-in-out infinite",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
          }}
        >
          ✦
        </div>
      </div>

      <div
        style={{
          fontWeight: 800,
          fontSize: 15,
          color: "#fff",
          marginBottom: 4,
          letterSpacing: "-0.01em",
          textAlign: "center",
        }}
      >
        {title}
      </div>

      <div
        key={msgIdx}
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.45)",
          marginBottom: 20,
          animation: "bda-fadein 0.35s ease both",
          textAlign: "center",
        }}
      >
        {messages[msgIdx % messages.length]}
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 280,
          height: 3,
          borderRadius: 99,
          background: "rgba(255,255,255,0.08)",
          marginBottom: 22,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress}%`,
            borderRadius: 99,
            background: "linear-gradient(90deg, #ff6521, #ff9a6b)",
            transition: "width 0.22s ease",
            boxShadow: "0 0 8px rgba(255,101,33,0.6)",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 300 }}>
        {steps.map((step, i) => {
          const done = activeStep > i;
          const active = activeStep === i;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                opacity: done ? 1 : active ? 0.9 : 0.3,
                transition: "opacity 0.4s ease",
              }}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: done
                    ? "linear-gradient(135deg,#ff6521,#ff9a6b)"
                    : active
                      ? "rgba(255,101,33,0.15)"
                      : "rgba(255,255,255,0.06)",
                  border: done
                    ? "none"
                    : active
                      ? "1px solid rgba(255,101,33,0.5)"
                      : "1px solid rgba(255,255,255,0.1)",
                  transition: "all 0.3s ease",
                }}
              >
                {done ? (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#fff",
                      fontWeight: 700,
                      animation: "bda-tick 0.25s ease both",
                    }}
                  >
                    ✓
                  </span>
                ) : active ? (
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#ff6521",
                      animation: "bda-pulse-glow 0.9s ease-in-out infinite",
                    }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: done ? 600 : 500,
                    color: done ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {step.icon} {step.label}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 1 }}>
                  {step.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function gtmSectionDraftLoaderCopy(sectionTitle) {
  const name = sectionTitle || "strategy section";
  return {
    title: `Drafting ${name}`,
    steps: [
      { icon: "🎯", label: "Reading locked Goals", detail: "outcome · timeline · North Star" },
      { icon: "📐", label: "Building metric system", detail: "CAC ceilings · leading indicators" },
      { icon: "✦", label: `Drafting ${name}`, detail: "recommendation · plays · subsections" },
      { icon: "🔗", label: "Aligning prior sections", detail: "stay consistent with approvals" },
      { icon: "🤖", label: "Synthesizing with AI", detail: "Llama 3.3 70B via Groq" },
    ],
    messages: [
      `Drafting ${name}…`,
      "Locking North Star and timeline…",
      "Sizing budget and channel bets…",
      "Writing actionable plays…",
      "Adding section targets and owners…",
      "Checking consistency with approved drafts…",
      "Almost there — finalizing…",
    ],
  };
}
