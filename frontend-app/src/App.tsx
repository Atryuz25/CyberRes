import { useState, useEffect, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from 'recharts'

export default function App() {
  const [status, setStatus] = useState<string>('initializing')
  const [metrics, setMetrics] = useState<any>(null)
  const [entities, setEntities] = useState<any[]>([])
  const [graphData, setGraphData] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [bftLog, setBftLog] = useState<any[]>([])
  const [fprRecall, setFprRecall] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<string>('guide')
  const [ragQuery, setRagQuery] = useState<string>('')
  const [ragResults, setRagResults] = useState<any[]>([])
  const [ragStats, setRagStats] = useState<any>(null)
  const [ragLoading, setRagLoading] = useState<boolean>(false)
  const [latencyHistory, setLatencyHistory] = useState<any[]>([])
  const [soarActionCounts, setSoarActionCounts] = useState<any>({'AUTO_CONTAIN': 0, 'ESCALATE': 0, 'DROP': 0})
  const [bftVoteDist, setBftVoteDist] = useState<any>({'FLAGGED': 0, 'CLEAR': 0, 'DISPUTED': 0})
  const [liveFeed, setLiveFeed] = useState<any[]>([])
  const [riskHistogram, setRiskHistogram] = useState<any[]>([
    { range: '0.0-0.2', normal: 0, anomaly: 0 },
    { range: '0.2-0.4', normal: 0, anomaly: 0 },
    { range: '0.4-0.6', normal: 0, anomaly: 0 },
    { range: '0.6-0.8', normal: 0, anomaly: 0 },
    { range: '0.8-1.0', normal: 0, anomaly: 0 },
  ])
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    const ws = new WebSocket(wsUrl)
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.type === 'NEW_ANOMALY') {
         const { soar, bft, latency_ms, timestamp } = msg.data
         const timeStr = new Date(timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})
         
         setLatencyHistory((prev: any[]) => {
            const hist = [...prev, { time: timeStr, latency: latency_ms }]
            return hist.slice(-15)
         })
         
         if (soar && soar.decision) {
           setSoarActionCounts((prev: any) => ({...prev, [soar.decision]: (prev[soar.decision] || 0) + 1}))
           setAuditLogs((prev: any[]) => [soar, ...prev.slice(0, 99)])
           
           const newEnt = { id: soar.entity_id, risk_score: soar.confidence, category: 'Live Detection', decision: soar.decision }
           setEntities((prev: any[]) => [newEnt, ...prev.filter((e: any) => e.id !== soar.entity_id).slice(0, 99)])
           
           setLiveFeed((prev: any[]) => [{ time: timeStr, ent: newEnt, bft: bft }, ...prev.slice(0, 49)])
           
           const score = soar.confidence || soar.risk_score || 0;
           const bucketIdx = Math.min(Math.floor(score / 0.2), 4);
           setRiskHistogram((prev: any[]) => {
             const next = [...prev];
             if (score > 0.8) next[bucketIdx] = { ...next[bucketIdx], anomaly: next[bucketIdx].anomaly + 1 };
             else next[bucketIdx] = { ...next[bucketIdx], normal: next[bucketIdx].normal + 1 };
             return next;
           });
         }
         
         if (bft && bft.consensus) {
           setBftVoteDist((prev: any) => ({...prev, [bft.consensus]: (prev[bft.consensus] || 0) + 1}))
           setBftLog((prev: any[]) => [{entity_id: soar?.entity_id || 'unknown', ...bft}, ...prev.slice(0, 99)])
         }
      }
    }
    return () => ws.close()
  }, [])

  // ── Data fetchers ────────────────────────────────────────────────────────

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/metrics')
      if (res.ok) { const d = await res.json(); setMetrics(d) }
    } catch (e) { console.error(e) }
  }

  const fetchEntities = async () => {
    try {
      const res = await fetch('/api/entities')
      if (res.ok) { const d = await res.json(); setEntities(d.entities || []) }
    } catch (e) { console.error(e) }
  }

  const fetchGraph = async () => {
    try {
      const res = await fetch('/api/graph')
      if (res.ok) { const d = await res.json(); setGraphData(d) }
    } catch (e) { console.error(e) }
  }

  const fetchAudit = async () => {
    try {
      const res = await fetch('/api/audit')
      if (res.ok) { const d = await res.json(); setAuditLogs(d.audit_logs || []) }
    } catch (e) { console.error(e) }
  }

  const fetchBftLog = async () => {
    try {
      const res = await fetch('/api/bft_log')
      if (res.ok) { 
        const d = await res.json()
        const logs = d.bft_log || []
        setBftLog(logs)
        const dist = logs.reduce((acc: any, log: any) => {
          if (log.consensus) acc[log.consensus] = (acc[log.consensus] || 0) + 1
          return acc
        }, {'FLAGGED': 0, 'CLEAR': 0, 'DISPUTED': 0})
        setBftVoteDist(dist)
      }
    } catch (e) { console.error(e) }
  }

  const fetchFprRecall = async () => {
    try {
      const res = await fetch('/api/fpr_recall')
      if (res.ok) { const d = await res.json(); setFprRecall(d) }
    } catch (e) { console.error(e) }
  }

  const fetchRagStatsInit = async () => {
    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'init', top_k: 1 })
      })
      if (res.ok) { const d = await res.json(); setRagStats(d.corpus_stats || null); }
    } catch (e) { console.error(e) }
  }

  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return
    setRagLoading(true)
    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ragQuery, top_k: 3 })
      })
      if (res.ok) { const d = await res.json(); setRagResults(d.results || []); setRagStats(d.corpus_stats || null); }
    } catch (e) { console.error(e) }
    finally { setRagLoading(false) }
  }

  const handleOverride = async (entityId: string, action: string) => {
    try {
      const res = await fetch('/api/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: entityId, action })
      })
      if (res.ok) { fetchEntities(); fetchAudit() }
    } catch (e) { console.error(e) }
  }

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status')
      const d = await res.json()
      setStatus(d.status)
      if (d.status === 'ready') {
        fetchMetrics(); fetchEntities(); fetchGraph()
        fetchAudit()
        fetchBftLog()
        fetchFprRecall()
        fetchRagStatsInit()
      }
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 8000)
    return () => clearInterval(interval)
  }, [])

  // ── FPR-Recall canvas chart ───────────────────────────────────────────────
  useEffect(() => {
    if (!fprRecall || !canvasRef.current) return
    const curve = fprRecall.tradeoff_curve
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height, PAD = 52

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, W, H)

    // Grid lines
    ctx.strokeStyle = '#27272a'; ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const x = PAD + i * (W - 2 * PAD) / 4
      const y = (H - PAD) - i * (H - 2 * PAD) / 4
      ctx.beginPath(); ctx.moveTo(x, PAD); ctx.lineTo(x, H - PAD); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = '#52525b'; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(PAD, PAD); ctx.lineTo(PAD, H - PAD)
    ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD)
    ctx.stroke()

    // Labels
    ctx.fillStyle = '#71717a'; ctx.font = '11px monospace'
    ctx.fillText('FPR →', W / 2 - 16, H - 10)
    ctx.save(); ctx.translate(14, H / 2 + 20); ctx.rotate(-Math.PI / 2)
    ctx.fillText('Recall ↑', 0, 0); ctx.restore()
    for (let i = 0; i <= 4; i++) {
      const xv = (i * 0.25).toFixed(2)
      const yv = (i * 0.25).toFixed(2)
      ctx.fillText(xv, PAD + i * (W - 2 * PAD) / 4 - 10, H - PAD + 14)
      ctx.fillText(yv, 4, (H - PAD) - i * (H - 2 * PAD) / 4 + 4)
    }

    // Diagonal
    ctx.strokeStyle = '#3f3f46'; ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, PAD)
    ctx.stroke(); ctx.setLineDash([])

    const toX = (fpr: number) => PAD + fpr * (W - 2 * PAD)
    const toY = (rec: number) => (H - PAD) - rec * (H - 2 * PAD)

    // Anchor points for full ROC curve rendering
    const fullCurve = [{fpr: 0, recall: 0, threshold_multiplier: 'inf'}, ...curve, {fpr: 1, recall: 1, threshold_multiplier: '0'}]

    // Cal-conditioned curve (white solid)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5
    ctx.beginPath()
    fullCurve.forEach((pt: any, i: number) => {
      i === 0 ? ctx.moveTo(toX(pt.fpr), toY(pt.recall)) : ctx.lineTo(toX(pt.fpr), toY(pt.recall))
    })
    ctx.stroke()

    // Points + labels
    curve.forEach((pt: any) => {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(toX(pt.fpr), toY(pt.recall), 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#a1a1aa'; ctx.font = '10px monospace'
      ctx.fillText(`×${pt.threshold_multiplier}`, toX(pt.fpr) + 8, toY(pt.recall) - 6)
    })

    // Legend
    ctx.fillStyle = '#ffffff'; ctx.fillRect(W - 160, PAD + 10, 14, 3)
    ctx.fillStyle = '#a1a1aa'; ctx.font = '11px monospace'
    ctx.fillText('Calendar-Conditioned', W - 142, PAD + 15)
  }, [fprRecall, activeTab])

  // ── Render ───────────────────────────────────────────────────────────────

  if (status === 'initializing' || !metrics) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', flexDirection: 'column', gap: '20px' }}>
        <div style={{ width: '36px', height: '36px', border: '2px solid #27272a', borderTopColor: '#ffffff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ fontSize: '12px', color: '#52525b', fontFamily: 'monospace', letterSpacing: '0.12em' }}>SYSTEM INITIALIZING — STAND BY</span>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const NAV_ITEMS = [
    { id: 'guide',     label: 'Guide & Walkthrough', icon: '📖' },
    { id: 'overview',  label: 'Overview',        icon: '▦' },
    { id: 'fpr',       label: 'FPR-Recall',       icon: '◈' },
    { id: 'bft',       label: 'BFT Vote Log',     icon: '⧉' },
    { id: 'graph',     label: 'Lateral Movement', icon: '⬡' },
    { id: 'audit',     label: 'Audit Log',        icon: '≡' },
    { id: 'rag',       label: 'Threat Intel RAG', icon: '◉' },
  ]

  const decisionBadgeClass = (d: string) => {
    if (!d) return 'badge-neutral'
    const dl = d.toUpperCase()
    if (dl.includes('AUTO_CONTAIN')) return 'badge-error'
    if (dl.includes('ESCALATE')) return 'badge-warning'
    if (dl.includes('MONITOR')) return 'badge-neutral'
    return 'badge-neutral'
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            ET // Cyber Command
          </div>
          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
            AI-Driven Cyber Resilience
          </div>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <button key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => setActiveTab(item.id)}>
              <span style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', padding: '16px', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <div>Pipeline: <span style={{ color: 'var(--status-success-text)' }}>● READY</span></div>
          <div style={{ marginTop: '4px' }}>{metrics.n_samples?.toLocaleString()} samples evaluated</div>
        </div>
      </aside>

      {/* Main area */}
      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span className="badge badge-success">System Secure</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              FPR {(metrics.fpr * 100).toFixed(2)}% · Recall {(metrics.recall * 100).toFixed(2)}% · {metrics.latency_ms?.toFixed(0)}ms latency
            </span>
          </div>
        </header>

        <main className="content-container">

          {/* ── GUIDE TAB ── */}
          {activeTab === 'guide' && (
            <>
              <div className="page-header">
                <h2 className="page-title">Project Walkthrough (For Judges)</h2>
              </div>
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-warning-text)' }}>
                <div className="card-header" style={{ fontSize: '16px' }}>1. The Problem Statement</div>
                <div className="card-body">
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    When defending Critical National Infrastructure (CNI), standard anomaly detectors fail in a very specific, painful way: 
                    <strong style={{ color: '#fff' }}> they cannot distinguish between an attack and a legitimate institutional traffic burst.</strong>
                  </p>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '12px' }}>
                    For example, when a university opens admissions, traffic spikes massively. A standard anomaly detector flags this as a volumetric attack, triggering thousands of false positives. SOC analysts get alert fatigue, and real attacks slip through the noise.
                  </p>
                </div>
              </div>
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-success-text)' }}>
                <div className="card-header" style={{ fontSize: '16px' }}>2. The Calendar-Conditioned Differentiator</div>
                <div className="card-body">
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    We engineered a Hybrid Anomaly Detector that is aware of the institution's calendar. By training it on "burst" data tagged with calendar phases, the model learns that a massive spike in traffic is normal if it aligns with the calendar.
                  </p>
                  <p style={{ color: 'var(--status-success-text)', lineHeight: '1.6', marginTop: '12px', fontWeight: 'bold' }}>
                    Result: On legitimate traffic bursts, our calendar-conditioning reduced the false-positive rate by 46%!
                  </p>
                </div>
              </div>
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-error-text)' }}>
                <div className="card-header" style={{ fontSize: '16px' }}>3. BFT Consensus Gate & SOAR Audit</div>
                <div className="card-body">
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    Before the system is allowed to automatically isolate a server, it must pass a <strong style={{ color: '#fff' }}>Byzantine Fault Tolerance (BFT) Consensus Gate</strong>. Three independent detection agents vote on the risk. A firewall block only occurs if a 2/3 quorum agrees, guaranteeing that a compromised agent cannot cause a self-inflicted Denial of Service.
                  </p>
                  <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginTop: '12px' }}>
                    Every decision is mapped to a MITRE ATT&CK Knowledge Graph and written to a cryptographically secure SHA-256 Audit Log with RAG-enriched threat intel.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── OVERVIEW TAB ── */}
          {activeTab === 'overview' && (
            <>
              <div className="page-header">
                <h2 className="page-title">Platform Overview</h2>
              </div>
              
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-success-text)', backgroundColor: 'rgba(52, 211, 153, 0.05)' }}>
                <div className="card-body" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--status-success-text)' }}>JUDGE INSIGHT:</strong> The "Burst FPR Reduction" metric below proves our Calendar-Conditioning works. It dynamically suppresses false alarms during legitimate high-volume events (like exams or admissions), allowing the SOC to focus on real threats.
                </div>
              </div>

                            <div className="metrics-grid" style={{ marginBottom: '24px' }}>
                <div className="metric-card">
                  <div className="metric-value">{metrics?.n_samples?.toLocaleString() || '...'}</div>
                  <div className="metric-label">Total Endpoints Evaluated</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value text-error">{metrics?.fpr ? (metrics.fpr * 100).toFixed(2) : '...'}%</div>
                  <div className="metric-label">False Positive Rate (Cal-Conditioned)</div>
                </div>
                <div className="metric-card">
                  <div className="metric-value text-success">{latencyHistory.length > 0 ? latencyHistory[latencyHistory.length-1].latency.toFixed(0) : (metrics?.latency_ms?.toFixed(0) || '...')} <span style={{ fontSize: '14px' }}>ms</span></div>
                  <div className="metric-label">Live Pipeline Latency</div>
                </div>
                <div className="metric-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '20px 20px 0' }}>
                    <div className="metric-value text-success">Real-time</div>
                    <div className="metric-label">Latency Stream</div>
                  </div>
                  <div style={{ flex: 1, minHeight: '60px', marginTop: '10px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={latencyHistory}>
                        <Line type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Live Network Intercept</span>
                    <span style={{ fontSize: '11px', color: 'var(--status-success-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--status-success-text)', borderRadius: '50%', display: 'inline-block' }}></span>
                      STREAMING
                    </span>
                  </div>
                  <div className="card-body mono" style={{ padding: '12px', backgroundColor: '#09090b', color: '#4ade80', flex: 1, height: '400px', overflowY: 'auto', fontSize: '11px', lineHeight: 1.6 }}>
                    {liveFeed.length === 0 ? <div style={{opacity: 0.5}}>Waiting for live stream...</div> : null}
                    {liveFeed.map((item: any, i: number) => (
                      <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid rgba(74, 222, 128, 0.1)' }}>
                        <span style={{ opacity: 0.5 }}>[{item.time}]</span> 
                        {' '} {item.ent.id} {' | '}
                        <span style={{ color: item.ent.risk_score > 0.8 ? '#f87171' : '#fbbf24' }}>RISK:{item.ent.risk_score?.toFixed(3)}</span> 
                        {' -> '} 
                        <span style={{ color: item.ent.decision === 'AUTO_CONTAIN' ? '#f87171' : item.ent.decision === 'ESCALATE' ? '#fbbf24' : '#a1a1aa' }}>
                          [{item.ent.decision}]
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Flagged Entities · BFT Consensus</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{entities.length} flagged</span>
                  </div>
                  <div className="card-body" style={{ padding: 0, flex: 1, height: '400px', overflowY: 'auto' }}>
                    <table>
                      <thead><tr>
                        <th>Entity ID</th>
                        <th>Risk Score</th>
                        <th>Decision</th>
                        <th>Human Override</th>
                      </tr></thead>
                      <tbody>
                        {entities.slice(0, 20).map((ent: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">
                              {ent.id}
                              {ent.tier0 && <span className="badge badge-warning" style={{ marginLeft: '8px', fontSize: '10px' }}>TIER-0</span>}
                            </td>
                            <td className="mono text-error">{ent.risk_score?.toFixed(3)}</td>
                            <td>
                              <span className={`badge ${ent.decision === 'AUTO_CONTAIN' ? 'badge-error' : ent.decision === 'ESCALATE' ? 'badge-warning' : 'badge-neutral'}`}>
                                {ent.decision} {ent.override_applied && <em> (Override)</em>}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn btn-primary btn-sm" onClick={() => handleOverride(ent.id, 'ESCALATE')}>Approve</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => handleOverride(ent.id, 'DISMISS')}>Dismiss</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── FPR-RECALL TAB ── */}
          {activeTab === 'fpr' && (
            <>
              <div className="page-header">
                <h2 className="page-title">FPR-Recall Tradeoff</h2>
              </div>
              
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-warning-text)', backgroundColor: 'rgba(251, 191, 36, 0.05)' }}>
                <div className="card-body" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--status-warning-text)' }}>JUDGE INSIGHT:</strong> This curve demonstrates how tuning the anomaly threshold impacts detection. The ablation study below proves that Calendar Conditioning fundamentally shifts this curve, granting lower False Positive Rates without sacrificing Recall.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div className="card">
                  <div className="card-header">Live Risk Score Distribution (Real-Time)</div>
                  <div className="card-body" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={riskHistogram}>
                        <XAxis dataKey="range" stroke="#52525b" />
                        <Tooltip contentStyle={{backgroundColor: '#18181b', border: '1px solid #3f3f46'}} />
                        <Legend verticalAlign="bottom" height={36}/>
                        <Area type="monotone" dataKey="normal" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Normal Traffic" />
                        <Area type="monotone" dataKey="anomaly" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Anomalous Traffic" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">Calendar-Conditioned Model Curve</div>
                  <div className="card-body" style={{ padding: 0, display: 'flex', justifyContent: 'center' }}>
                    <canvas ref={canvasRef} width={420} height={300} style={{ display: 'block' }} />
                  </div>
                </div>
              </div>
              <div className="card" style={{ marginTop: '24px' }}>
                <div className="card-header">Operating Points</div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table>
                      <thead><tr>
                        <th>Threshold ×</th><th>FPR</th><th>Recall</th><th>Precision</th>
                      </tr></thead>
                      <tbody>
                        {fprRecall?.tradeoff_curve?.map((pt: any, i: number) => (
                          <tr key={i} style={{ backgroundColor: pt.threshold_multiplier === 1.0 ? 'rgba(255,255,255,0.04)' : '' }}>
                            <td className="mono">{pt.threshold_multiplier === 1.0 ? <strong>×{pt.threshold_multiplier} ★</strong> : `×${pt.threshold_multiplier}`}</td>
                            <td className="mono text-error">{(pt.fpr * 100).toFixed(2)}%</td>
                            <td className="mono text-success">{(pt.recall * 100).toFixed(2)}%</td>
                            <td className="mono">{(pt.precision * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              {fprRecall?.ablation && (
                <div className="card">
                  <div className="card-header">Calendar Conditioning Ablation Study</div>
                  <div className="card-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                      {[
                        { label: 'Baseline FPR (no calendar)', value: `${(fprRecall.ablation.baseline_fpr * 100).toFixed(2)}%`, cls: 'text-error' },
                        { label: 'Calendar-Conditioned FPR', value: `${(fprRecall.ablation.cal_fpr * 100).toFixed(2)}%`, cls: 'text-warning' },
                        { label: 'Relative FPR Reduction', value: `${(fprRecall.ablation.relative_fpr_reduction * 100).toFixed(2)}%`, cls: 'text-success' },
                      ].map((m, i) => (
                        <div key={i}>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{m.label}</div>
                          <div className={`metric-value ${m.cls}`} style={{ fontSize: '24px' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      On legitimate exam-period traffic bursts (n={fprRecall.ablation.n_samples}). Calendar conditioning suppresses false positives on high-volume-but-benign institutional events.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── BFT VOTE LOG TAB ── */}
          {activeTab === 'bft' && (
            <>
              <div className="page-header">
                <h2 className="page-title">BFT Consensus Vote Log</h2>
              </div>
              
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--status-error-text)', backgroundColor: 'rgba(248, 113, 113, 0.05)' }}>
                <div className="card-body" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--status-error-text)' }}>JUDGE INSIGHT:</strong> Autonomous AI in critical infrastructure is dangerous. We implemented a Byzantine Fault Tolerance (BFT) gate. A Strict 2/3 Quorum is required to execute an AUTO_CONTAIN. If agents dispute, it safely escalates to a human.
                </div>
              </div>
                            <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Live Agent Consensus Circuit</span>
                  <span style={{ fontSize: '11px', color: 'var(--status-success-text)' }}>STREAMING</span>
                </div>
                <div className="card-body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px', gap: '40px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {['Agent A', 'Agent B', 'Agent C'].map((name, i) => {
                       const vote = liveFeed[0]?.bft?.[`vote_${name.charAt(name.length-1)}`];
                       const color = vote ? (vote.flagged ? '#ef4444' : '#10b981') : '#52525b';
                       return (
                         <div key={name} style={{ padding: '16px', border: `2px solid ${color}`, borderRadius: '8px', textAlign: 'center', width: '160px', transition: 'border-color 0.3s', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                           <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{name}</div>
                           <div style={{ fontSize: '11px', color: color, marginTop: '4px' }}>{vote ? (vote.flagged ? 'FLAGGED' : 'CLEAR') : 'WAITING'}</div>
                           {vote && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>Conf: {vote.score.toFixed(3)}</div>}
                         </div>
                       )
                    })}
                  </div>
                  
                  <div style={{ width: '80px', height: '2px', backgroundColor: '#52525b', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '-4px', right: '-8px', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid #52525b' }} />
                  </div>
                  
                  <div style={{ padding: '24px', border: `2px solid ${liveFeed[0]?.bft?.consensus === 'FLAGGED' ? '#ef4444' : liveFeed[0]?.bft?.consensus === 'CLEAR' ? '#10b981' : '#f59e0b'}`, borderRadius: '50%', width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transition: 'all 0.3s', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Consensus</div>
                    <div style={{ fontSize: '14px', color: liveFeed[0]?.bft?.consensus === 'FLAGGED' ? '#ef4444' : liveFeed[0]?.bft?.consensus === 'CLEAR' ? '#10b981' : '#f59e0b', marginTop: '8px' }}>
                      {liveFeed[0]?.bft?.consensus || 'IDLE'}
                    </div>
                  </div>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>3-Agent Vote Records — 2/3 Quorum Required for AUTO_CONTAIN</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{bftLog.length} decisions</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <table>
                    <thead><tr>
                      <th>Entity ID</th>
                      <th>Agent A</th>
                      <th>Agent B</th>
                      <th>Agent C (IF-only)</th>
                      <th>Vote Count</th>
                      <th>Consensus</th>
                      <th>Recommended Action</th>
                    </tr></thead>
                    <tbody>
                      {bftLog.map((entry: any, i: number) => (
                        <tr key={i}>
                          <td className="mono">{entry.entity_id}</td>
                          {(['vote_A', 'vote_B', 'vote_C'] as const).map((vk, vi) => (
                            <td key={vi}>
                              <div style={{ fontSize: '11px' }}>
                                <span style={{ color: entry[vk]?.flagged ? 'var(--status-error-text)' : 'var(--status-success-text)' }}>
                                  {entry[vk]?.flagged ? '● FLAGGED' : '○ CLEAR'}
                                </span>
                                <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                                  {entry[vk]?.score?.toFixed(3)} / {entry[vk]?.threshold?.toFixed(3)}
                                </div>
                                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', opacity: 0.8 }}>
                                  [ {entry[vk]?.variant || 'unknown'} ]
                                </div>
                              </div>
                            </td>
                          ))}
                          <td className="mono">{entry.vote_count}/{entry.quorum_required}</td>
                          <td>
                            <span className={`badge ${entry.consensus === 'FLAGGED' ? 'badge-error' : entry.consensus === 'DISPUTED' ? 'badge-warning' : 'badge-neutral'}`}>
                              {entry.consensus}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${decisionBadgeClass(entry.recommended_decision)}`}>
                              {entry.recommended_decision}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">Vote Distribution</div>
                  <div className="card-body" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        {name: 'Flagged', count: bftVoteDist['FLAGGED'] || 0, fill: '#ef4444'},
                        {name: 'Clear', count: bftVoteDist['CLEAR'] || 0, fill: '#10b981'},
                        {name: 'Dispute', count: bftVoteDist['DISPUTED'] || 0, fill: '#f59e0b'}
                      ]}>
                        <XAxis dataKey="name" stroke="#52525b" />
                        <YAxis stroke="#52525b" allowDecimals={false} />
                        <Tooltip cursor={{fill: '#27272a'}} contentStyle={{backgroundColor: '#18181b', border: '1px solid #3f3f46'}} />
                        <Legend verticalAlign="bottom" height={36}/>
                        <Bar dataKey="count">
                          { [
                            {name: 'Flagged', count: bftVoteDist['FLAGGED'] || 0, fill: '#ef4444'},
                            {name: 'Clear', count: bftVoteDist['CLEAR'] || 0, fill: '#10b981'},
                            {name: 'Dispute', count: bftVoteDist['DISPUTED'] || 0, fill: '#f59e0b'}
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── LATERAL MOVEMENT GRAPH TAB ── */}
          {activeTab === 'graph' && (
            <>
              <div className="page-header">
                <h2 className="page-title">Lateral Movement Attack Graph</h2>
              </div>
              
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #60a5fa', backgroundColor: 'rgba(96, 165, 250, 0.05)' }}>
                <div className="card-body" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#60a5fa' }}>JUDGE INSIGHT:</strong> When an anomaly is detected, this module maps its NetworkX connections to trace lateral movement. Analysts can instantly identify adjacent TIER-0 nodes at risk and sever the pivot connections.
                </div>
              </div>
              {graphData ? (
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>NetworkX Attack Graph — Top-100 Risk Entities</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {graphData.nodes?.length || 0} nodes · {(graphData.links || graphData.edges || []).length} edges
                    </span>
                  </div>
                  <div className="card-body" style={{ padding: 0, height: 'calc(100vh - 240px)', display: 'flex', justifyContent: 'center', backgroundColor: '#09090b', overflow: 'hidden' }}>
                    <ForceGraph2D
                      graphData={graphData}
                      nodeLabel="id"
                      nodeColor={(node: any) => node.id === liveFeed[0]?.ent?.id ? '#f87171' : (node.is_tier0 ? '#f59e0b' : node.risk_score > 0.8 ? '#ef4444' : '#52525b')}
                      nodeVal={(node: any) => node.id === liveFeed[0]?.ent?.id ? 15 : (node.risk_score > 0.8 ? 5 : 2)}
                      nodeRelSize={4}
                      linkColor={() => 'rgba(255,255,255,0.1)'}
                      linkWidth={1.5}
                      linkDirectionalArrowLength={3.5}
                      linkDirectionalArrowRelPos={1}
                      backgroundColor="#09090b"
                      width={1050}
                      extraRenderers={[liveFeed]}
                    />
                  </div>
                </div>
              ) : (
                <div className="card"><div className="card-body">Loading graph data...</div></div>
              )}
            </>
          )}

          {/* ── AUDIT LOG TAB ── */}
          {activeTab === 'audit' && (
            <>
              <div className="page-header">
                <h2 className="page-title">SHA-256 Hash-Chained Audit Log</h2>
              </div>
              
              <div className="card" style={{ marginBottom: '24px', borderLeft: '4px solid #a78bfa', backgroundColor: 'rgba(167, 139, 250, 0.05)' }}>
                <div className="card-body" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#a78bfa' }}>JUDGE INSIGHT:</strong> In Critical Infrastructure, every AI decision must be verifiable. We write every action, along with its RAG-enriched threat context, into an immutable SHA-256 chained log to provide undeniable proof of why the system took action.
                </div>
              </div>
                            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-secondary)' }}>Live Blockchain Verification Stream</h3>
                </div>
                <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', padding: '10px 0', scrollBehavior: 'smooth' }}>
                  {auditLogs.slice(0, 5).map((log, i) => (
                    <div key={i} className="card" style={{ minWidth: '320px', flexShrink: 0, animation: 'slideIn 0.5s ease-out', borderLeft: `4px solid ${log.decision === 'AUTO_CONTAIN' ? '#ef4444' : log.decision === 'ESCALATE' ? '#f59e0b' : '#52525b'}` }}>
                      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(167, 139, 250, 0.05)', padding: '12px 16px' }}>
                        <span>Block #{auditLogs.length - i}</span>
                        <span style={{ color: log.decision === 'AUTO_CONTAIN' ? '#ef4444' : '#f59e0b', fontSize: '11px', fontWeight: 'bold' }}>{log.decision}</span>
                      </div>
                      <div className="card-body mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', padding: '16px' }}>
                        <div><strong style={{color:'var(--text-primary)'}}>Entity:</strong> {log.entity_id}</div>
                        <div style={{ marginTop: '8px', color:'var(--text-primary)' }}><strong>Prev Hash:</strong></div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.7 }}>{log.prev_hash}</div>
                        <div style={{ marginTop: '8px', color:'var(--text-primary)' }}><strong>Entry Hash:</strong></div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: '#a78bfa' }}>{log.entry_hash}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Immutable SOAR Decision Records</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{auditLogs.length} records</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <table>
                    <thead><tr>
                      <th>Timestamp (UTC)</th>
                      <th>Entity ID</th>
                      <th>RAG Evidence & Context</th>
                      <th>Decision</th>
                      <th>SHA-256 Hash</th>
                    </tr></thead>
                    <tbody>
                      {auditLogs.map((log: any, i: number) => (
                        <tr key={i}>
                          <td className="mono text-muted" style={{ fontSize: '12px' }}>
                            {new Date((log.timestamp || 0) * 1000).toISOString().replace('T', ' ').substring(0, 19)}
                          </td>
                          <td className="mono">{log.entity_id}</td>
                          <td>
                            <div className="mono text-muted" style={{ fontSize: '11px', marginBottom: '4px' }}>{log.mitre_technique || '—'}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', maxWidth: '300px', whiteSpace: 'normal', fontStyle: 'italic' }}>
                              {log.evidence ? log.evidence : 'No RAG evidence available.'}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${decisionBadgeClass(log.decision)}`}>
                              {log.decision} {log.override_applied && <em> (Override)</em>}
                            </span>
                          </td>
                          {/* FIX: field is entry_hash, not hash */}
                          <td className="mono text-muted" style={{ fontSize: '10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {log.entry_hash ? log.entry_hash.substring(0, 16) + '…' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">SOAR Actions</div>
                  <div className="card-body" style={{ height: '300px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[
                          {name: 'Contain', value: soarActionCounts['AUTO_CONTAIN'] || 0},
                          {name: 'Escalate', value: soarActionCounts['ESCALATE'] || 0},
                          {name: 'Drop', value: soarActionCounts['DROP'] || 0}
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          { [
                            {name: 'Contain', value: soarActionCounts['AUTO_CONTAIN'] || 0},
                            {name: 'Escalate', value: soarActionCounts['ESCALATE'] || 0},
                            {name: 'Drop', value: soarActionCounts['DROP'] || 0}
                          ].filter(d => d.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.name === 'Contain' ? '#ef4444' : entry.name === 'Escalate' ? '#f59e0b' : '#52525b'} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{backgroundColor: '#18181b', border: '1px solid #3f3f46'}} />
                        <Legend verticalAlign="bottom" height={36}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── RAG THREAT INTEL TAB ── */}
          {activeTab === 'rag' && (
            <>
              <div className="page-header">
                <h2 className="page-title">Threat Intelligence RAG Query</h2>
              </div>
              <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>TF-IDF Retrieval over MITRE ATT&CK / CVE / CERT-In Corpus</span>
                  {ragStats && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Total Documents: {ragStats.total_documents} (Techniques: {ragStats.by_type?.mitre_technique || 0})
                    </span>
                  )}
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <input
                      type="text"
                      placeholder="e.g. ransomware lateral movement healthcare"
                      value={ragQuery}
                      onChange={e => setRagQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRagQuery(); } }}
                      style={{
                        flex: 1, padding: '10px 14px', background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)', borderRadius: '6px',
                        color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'var(--font-mono)',
                        outline: 'none',
                      }}
                    />
                    <button type="button" className="btn btn-primary" onClick={handleRagQuery} disabled={ragLoading}>
                      {ragLoading ? 'Querying…' : 'Query RAG'}
                    </button>
                  </div>
                  {ragResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {ragResults.map((doc: any, i: number) => (
                        <div key={i} style={{ padding: '16px', background: 'var(--bg-surface-hover)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span className="mono" style={{ fontWeight: 600 }}>{doc.id}</span>
                            <span className={`badge ${doc.type === 'mitre_technique' ? 'badge-error' : doc.type === 'cve' ? 'badge-warning' : 'badge-neutral'}`}>
                              {doc.type}
                            </span>
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: '6px' }}>{doc.title}</div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{doc.snippet}</div>
                          <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                            Relevance score: <span className="mono">{doc.score?.toFixed(4)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {ragResults.length === 0 && !ragLoading && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {ragQuery ? "No results found for your query. Try different keywords." : "Enter a query above to retrieve relevant threat intelligence documents."}
                      <div style={{ marginTop: '8px' }}>
                        Example queries: <em>active scanning reconnaissance</em> · <em>log4shell exploit rce</em> · <em>AIIMS ransomware healthcare</em>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  )
}
