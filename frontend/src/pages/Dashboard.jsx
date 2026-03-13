import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEnqueteur, syncEnqueteur, getEnqueteurSegmentations, getHistoriqueEnqueteur, authRequestProfileOTP, authUpdateProfile } from '../lib/api'
import { Card, Badge, ProgressBar, CopyButton, Spinner, Avatar, Button, LineChart, Input, Modal } from '../components/ui'

const STATUT_CONFIG = {
  en_cours:  { label: 'En cours',  variant: 'info' },
  en_retard: { label: 'En retard', variant: 'warning' },
  termine:   { label: 'Termine',   variant: 'success' },
}

export default function Dashboard() {
  const nav = useNavigate()
  const [enq, setEnq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedEnquete, setSelectedEnquete] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [segmentations, setSegmentations] = useState([])
  const [historique, setHistorique] = useState([])

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) return nav('/')
    const data = JSON.parse(stored)
    setEnq(data)
    setLoading(false)

    const refresh = async () => {
      try {
        const [fresh, segs, hist] = await Promise.all([
          getEnqueteur(data.id),
          getEnqueteurSegmentations(data.id),
          getHistoriqueEnqueteur(data.id)
        ])
        setEnq(fresh)
        setSegmentations(segs || [])
        setHistorique(hist || [])
        sessionStorage.setItem('user', JSON.stringify(fresh))
      } catch {}
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [nav])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncEnqueteur(enq.id)
      const fresh = await getEnqueteur(enq.id)
      setEnq(fresh)
      sessionStorage.setItem('user', JSON.stringify(fresh))
    } catch (err) {
      console.error('Erreur sync:', err)
    } finally {
      setSyncing(false)
    }
  }

  if (loading || !enq) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <Spinner size="lg" />
      </div>
    )
  }

  const affectations = enq.affectations || []
  // Utiliser completions_valides (completions qui comptent dans les quotas)
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const totalClics = affectations.reduce((s, a) => s + (a.clics || 0), 0)
  const globalPct = Math.round((totalCompletions / Math.max(totalObjectif, 1)) * 100)
  const conversionRate = totalClics > 0 ? Math.round((totalCompletions / totalClics) * 100) : 0

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo + User */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#059669] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M3 3v18h18" />
                    <path d="M18 9l-5 5-4-4-3 3" />
                  </svg>
                </div>
                <span className="text-[#111827] font-semibold hidden sm:block">Marketym</span>
              </div>
              <div className="h-6 w-px bg-[#E5E7EB] hidden sm:block" />
              <div className="flex items-center gap-2">
                <Avatar name={`${enq.prenom} ${enq.nom}`} size="sm" />
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-[#111827]">{enq.prenom} {enq.nom}</p>
                  <p className="text-xs text-[#6B7280]">{enq.identifiant}</p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  syncing
                    ? 'bg-[#ECFDF5] text-[#059669]'
                    : 'text-[#059669] hover:bg-[#ECFDF5]'
                }`}
              >
                <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="hidden sm:inline">{syncing ? 'Sync...' : 'Synchroniser'}</span>
              </button>
              <button
                onClick={() => { sessionStorage.clear(); nav('/') }}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="hidden sm:inline">Deconnexion</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <TabButton
              active={activeTab === 'dashboard'}
              onClick={() => { setActiveTab('dashboard'); setSelectedEnquete(null) }}
              icon={<DashboardIcon />}
              label="Tableau de bord"
            />
            <TabButton
              active={activeTab === 'enquetes'}
              onClick={() => { setActiveTab('enquetes'); setSelectedEnquete(null) }}
              icon={<ClipboardIcon />}
              label="Mes enquetes"
              badge={affectations.length}
            />
            <TabButton
              active={activeTab === 'profil'}
              onClick={() => { setActiveTab('profil'); setSelectedEnquete(null) }}
              icon={<UserIcon />}
              label="Mon profil"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <DashboardTab
            affectations={affectations}
            totalCompletions={totalCompletions}
            totalObjectif={totalObjectif}
            totalClics={totalClics}
            globalPct={globalPct}
            conversionRate={conversionRate}
            segmentations={segmentations}
            historique={historique}
            onSelectEnquete={(aff) => { setSelectedEnquete(aff); setActiveTab('enquetes') }}
          />
        )}
        {activeTab === 'enquetes' && (
          selectedEnquete ? (
            <EnqueteDetail
              affectation={selectedEnquete}
              segmentations={segmentations}
              onBack={() => setSelectedEnquete(null)}
            />
          ) : (
            <EnquetesTab
              affectations={affectations}
              onSelect={setSelectedEnquete}
            />
          )
        )}
        {activeTab === 'profil' && (
          <ProfilTab enqueteur={enq} onUpdate={setEnq} />
        )}
      </main>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="2" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB BUTTON
   ══════════════════════════════════════════════════════════════════════════════ */

function TabButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-[#059669] text-[#059669]'
          : 'border-transparent text-[#6B7280] hover:text-[#111827] hover:border-[#D1D5DB]'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
          active ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#F3F4F6] text-[#6B7280]'
        }`}>{badge}</span>
      )}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD TAB
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardTab({ affectations, totalCompletions, totalObjectif, totalClics, globalPct, conversionRate, segmentations, historique, onSelectEnquete }) {
  const [selectedSegEnquete, setSelectedSegEnquete] = useState(null)

  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827]">Tableau de bord</h1>
        <p className="text-sm text-[#6B7280]">Vue d'ensemble de votre progression</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KPICard label="Completions" value={totalCompletions} subValue={`/ ${totalObjectif}`} color="#059669" />
        <KPICard label="Objectif" value={totalObjectif} subValue="reponses" color="#2563EB" />
        <KPICard label="Clics" value={totalClics} subValue="ouvertures" color="#7C3AED" />
        <KPICard label="Conversion" value={`${conversionRate}%`} subValue="taux" color="#D97706" />
      </div>

      {/* Progression globale + Courbe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111827]">Progression globale</h3>
            <span className="text-2xl font-bold text-[#059669]">{globalPct}%</span>
          </div>
          <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-[#059669] transition-all duration-700"
              style={{ width: `${Math.min(globalPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-[#6B7280]">
            <span>{totalCompletions} valides</span>
            <span>Objectif: {totalObjectif}</span>
          </div>
        </Card>

        {/* Courbe d'evolution */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111827]">Evolution (30 jours)</h3>
            {historique && historique.length > 0 && (
              <span className="text-xs text-[#6B7280]">
                {historique.length} jours
              </span>
            )}
          </div>
          <LineChart data={historique} height={100} color="#059669" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mes enquetes */}
        <Card className="p-6">
          <h3 className="font-semibold text-[#111827] mb-4">Mes enquetes</h3>
          <div className="space-y-4">
            {affectations.map(aff => {
              const enquete = aff.enquetes || {}
              const completions = aff.completions_valides ?? aff.completions_total ?? 0
              const pct = Math.round((completions / Math.max(aff.objectif_total, 1)) * 100)
              return (
                <button
                  key={aff.id}
                  onClick={() => onSelectEnquete(aff)}
                  className="w-full text-left p-3 rounded-lg hover:bg-[#F9FAFB] transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                        {enquete.code}
                      </span>
                      <span className="text-sm font-medium text-[#111827]">{enquete.nom}</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                  </div>
                  <ProgressBar value={completions} max={aff.objectif_total} size="sm" />
                  <div className="flex justify-between mt-1 text-xs text-[#9CA3AF]">
                    <span>{completions} / {aff.objectif_total}</span>
                    <span>{aff.clics} clics</span>
                  </div>
                </button>
              )
            })}
            {affectations.length === 0 && (
              <p className="text-center text-[#9CA3AF] py-4">Aucune enquete assignee</p>
            )}
          </div>
        </Card>

        {/* Segmentations dynamiques */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111827]">Segmentations</h3>
            {segmentations && segmentations.length > 1 && (
              <div className="flex gap-1">
                {segmentations.map(seg => (
                  <button
                    key={seg.enquete_id}
                    onClick={() => setSelectedSegEnquete(selectedSegEnquete === seg.enquete_id ? null : seg.enquete_id)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      selectedSegEnquete === seg.enquete_id || (selectedSegEnquete === null && segmentations[0]?.enquete_id === seg.enquete_id)
                        ? 'bg-[#059669] text-white'
                        : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                    }`}
                  >
                    {seg.enquete_code}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {segmentations && segmentations.length > 0 ? (
              (() => {
                const currentSeg = segmentations.find(s => s.enquete_id === selectedSegEnquete) || segmentations[0]
                return currentSeg?.segmentations?.map(seg => (
                  <div key={seg.id}>
                    <p className="text-xs font-medium text-[#6B7280] mb-2">{seg.nom}</p>
                    {[...seg.quotas].sort((a, b) => {
                      const pA = a.objectif > 0 ? (a.completions || 0) / a.objectif : 0
                      const pB = b.objectif > 0 ? (b.completions || 0) / b.objectif : 0
                      return pB - pA
                    }).map((q, i) => {
                      const pct = q.objectif > 0 ? Math.round(((q.completions || 0) / q.objectif) * 100) : 0
                      const isComplete = pct >= 100
                      return (
                        <div key={i} className={`p-2 mb-1 rounded-lg ${isComplete ? 'bg-[#ECFDF5]' : 'bg-[#F9FAFB]'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className={`font-medium text-xs ${isComplete ? 'text-[#059669]' : 'text-[#111827]'}`}>
                              {q.segment_value}
                              {isComplete && (
                                <svg className="w-3 h-3 inline ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                          </div>
                          <div className="h-1 bg-[#E5E7EB] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#059669]" style={{ width: `${Math.min(pct, 100)}%` }} />
                          </div>
                          <div className="flex justify-between mt-1 text-[9px] text-[#6B7280]">
                            <span>{q.completions || 0}</span>
                            <span>/ {q.objectif}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))
              })()
            ) : (
              <p className="text-center text-[#9CA3AF] py-4">Aucune segmentation configuree</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETES TAB
   ══════════════════════════════════════════════════════════════════════════════ */

function EnquetesTab({ affectations, onSelect }) {
  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827]">Mes enquetes</h1>
        <p className="text-sm text-[#6B7280]">{affectations.length} enquetes assignees</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {affectations.map(aff => {
          const enquete = aff.enquetes || {}
          const status = STATUT_CONFIG[aff.statut] || STATUT_CONFIG.en_cours
          const completions = aff.completions_valides ?? aff.completions_total ?? 0
          const pct = Math.round((completions / Math.max(aff.objectif_total, 1)) * 100)
          const conversionRate = aff.clics > 0 ? Math.round((completions / aff.clics) * 100) : 0

          return (
            <Card
              key={aff.id}
              className="p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onSelect(aff)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
                      {enquete.code}
                    </span>
                    <Badge variant={status.variant} size="sm">{status.label}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold text-[#111827]">{enquete.nom}</h3>
                  <p className="text-sm text-[#6B7280] line-clamp-1">{enquete.cible}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold" style={{ color: getProgressColor(pct) }}>{pct}%</p>
                </div>
              </div>

              {/* Mini Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="p-2 rounded-lg bg-[#ECFDF5] text-center">
                  <p className="text-lg font-bold text-[#059669]">{completions}</p>
                  <p className="text-[10px] text-[#059669]">Completions</p>
                </div>
                <div className="p-2 rounded-lg bg-[#F5F3FF] text-center">
                  <p className="text-lg font-bold text-[#7C3AED]">{aff.clics}</p>
                  <p className="text-[10px] text-[#7C3AED]">Clics</p>
                </div>
                <div className="p-2 rounded-lg bg-[#FFFBEB] text-center">
                  <p className="text-lg font-bold text-[#D97706]">{conversionRate}%</p>
                  <p className="text-[10px] text-[#D97706]">Conversion</p>
                </div>
              </div>

              <ProgressBar value={completions} max={aff.objectif_total} size="md" />
              <p className="text-xs text-[#9CA3AF] mt-2 text-right">Objectif: {aff.objectif_total}</p>
            </Card>
          )
        })}
      </div>

      {affectations.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
            <ClipboardIcon />
          </div>
          <p className="text-[#6B7280]">Aucune enquete assignee</p>
          <p className="text-sm text-[#9CA3AF] mt-1">Contactez l'administrateur pour etre assigne a une enquete</p>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETE DETAIL
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteDetail({ affectation, segmentations, onBack }) {
  const enquete = affectation.enquetes || {}
  const status = STATUT_CONFIG[affectation.statut] || STATUT_CONFIG.en_cours
  const completions = affectation.completions_valides ?? affectation.completions_total ?? 0
  const pct = Math.round((completions / Math.max(affectation.objectif_total, 1)) * 100)
  const conversionRate = affectation.clics > 0
    ? Math.round((completions / affectation.clics) * 100)
    : 0

  return (
    <div className="animate-fadeIn">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] mb-4 transition-colors"
      >
        <BackIcon />
        Retour a mes enquetes
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
              {enquete.code}
            </span>
            <Badge variant={status.variant} dot>{status.label}</Badge>
          </div>
          <h1 className="text-2xl font-semibold text-[#111827] mb-1">{enquete.nom}</h1>
          <p className="text-[#6B7280]">{enquete.cible}</p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold" style={{ color: getProgressColor(pct) }}>{pct}%</p>
          <p className="text-sm text-[#9CA3AF]">progression</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <KPICard label="Completions" value={completions} subValue={`/ ${affectation.objectif_total}`} color="#059669" />
        <KPICard label="Objectif" value={affectation.objectif_total} subValue="reponses" color="#2563EB" />
        <KPICard label="Clics" value={affectation.clics || 0} subValue="ouvertures" color="#7C3AED" />
        <KPICard label="Conversion" value={`${conversionRate}%`} subValue="taux" color="#D97706" />
      </div>

      {/* Progress */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#111827]">Progression globale</h3>
          <span className="text-sm font-mono text-[#6B7280]">
            {completions} / {affectation.objectif_total}
          </span>
        </div>
        <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out bg-[#059669]"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Lien */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#059669]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            Lien de collecte
          </h3>
          <div className="flex items-center gap-2 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg mb-4">
            <p className="flex-1 text-xs font-mono text-[#4B5563] truncate">
              {affectation.lien_questionnaire}
            </p>
            <CopyButton text={affectation.lien_questionnaire} />
          </div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => window.open(affectation.lien_questionnaire, '_blank')}
          >
            Ouvrir le questionnaire
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </Button>
        </Card>

        {/* Segmentations */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#059669]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
            Progression par segment
          </h3>
          <div className="space-y-2.5 max-h-[200px] overflow-y-auto">
            {(() => {
              const enqueteId = affectation.enquete_id || affectation.enquetes?.id
              const seg = segmentations?.find(s => s.enquete_id === enqueteId)
              const allQuotas = seg?.segmentations?.flatMap(s => s.quotas) || []
              const filtered = allQuotas.filter(q => (q.completions || 0) > 0 || (q.objectif || 0) > 0)
                .sort((a, b) => {
                  const pctA = (a.completions || 0) / Math.max(a.objectif || 1, 1)
                  const pctB = (b.completions || 0) / Math.max(b.objectif || 1, 1)
                  return pctB - pctA
                })
              return filtered.length > 0 ? filtered.map((q, i) => {
                const segPct = Math.min(Math.round(((q.completions || 0) / Math.max(q.objectif || 1, 1)) * 100), 100)
                const isComplete = segPct >= 100
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`w-24 text-sm truncate ${isComplete ? 'text-[#059669] font-medium' : 'text-[#4B5563]'}`} title={q.segment_value}>
                      {q.segment_value || 'Inconnu'}
                    </span>
                    <div className="flex-1 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#059669]" style={{ width: `${segPct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-[#9CA3AF] w-14 text-right">
                      {q.completions || 0}/{q.objectif || 0}
                    </span>
                  </div>
                )
              }) : (
                <p className="text-sm text-[#9CA3AF] text-center py-6">Aucun quota defini</p>
              )
            })()}
          </div>
        </Card>
      </div>

      {/* Admin Message */}
      {affectation.commentaire_admin && (
        <Card className="p-5 mt-6 border-l-4 border-l-[#D97706] bg-[#FFFBEB]">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-[#D97706] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-[#92400E] mb-1">Message de l'administrateur</p>
              <p className="text-sm text-[#78350F]">{affectation.commentaire_admin}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROFIL TAB
   ══════════════════════════════════════════════════════════════════════════════ */

function ProfilTab({ enqueteur, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    nom: enqueteur.nom || '',
    prenom: enqueteur.prenom || '',
    email: enqueteur.email || '',
    telephone: enqueteur.telephone || '',
    reseau_mobile: enqueteur.reseau_mobile || '',
    mode_remuneration: enqueteur.mode_remuneration || ''
  })

  const affectations = enqueteur.affectations || []
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const handleEditClick = async () => {
    setError('')
    setLoading(true)
    try {
      await authRequestProfileOTP()
      setShowOtpModal(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'envoi du code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyAndSave = async () => {
    if (!otpCode || otpCode.length < 6) {
      setError('Veuillez entrer le code a 6 chiffres')
      return
    }

    setError('')
    setLoading(true)
    try {
      const result = await authUpdateProfile(otpCode, formData)
      setSuccess('Profil mis a jour avec succes')
      setShowOtpModal(false)
      setIsEditing(false)
      setOtpCode('')

      // Mettre a jour le session storage et notifier le parent
      if (result.user && onUpdate) {
        const stored = JSON.parse(sessionStorage.getItem('user') || '{}')
        const updated = { ...stored, ...result.user }
        sessionStorage.setItem('user', JSON.stringify(updated))
        onUpdate(updated)
      }

      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Code incorrect ou erreur')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFormData({
      nom: enqueteur.nom || '',
      prenom: enqueteur.prenom || '',
      email: enqueteur.email || '',
      telephone: enqueteur.telephone || '',
      reseau_mobile: enqueteur.reseau_mobile || '',
      mode_remuneration: enqueteur.mode_remuneration || ''
    })
    setError('')
  }

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Mon profil</h1>
          <p className="text-sm text-[#6B7280]">Vos informations personnelles</p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} variant="secondary" size="sm">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Modifier
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded-lg text-sm text-[#059669]">
          {success}
        </div>
      )}

      {/* Avatar + Name */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={`${enqueteur.prenom} ${enqueteur.nom}`} size="lg" />
          <div>
            <h2 className="text-xl font-semibold text-[#111827]">{enqueteur.prenom} {enqueteur.nom}</h2>
            <p className="text-sm font-mono text-[#6B7280]">{enqueteur.identifiant}</p>
            <Badge variant="success" size="sm" className="mt-2">Actif</Badge>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Prenom"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
              />
              <Input
                label="Nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <Input
              label="Telephone"
              value={formData.telephone}
              onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[#374151]">Reseau mobile</label>
                <select
                  value={formData.reseau_mobile}
                  onChange={(e) => setFormData({ ...formData, reseau_mobile: e.target.value })}
                  className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent"
                >
                  <option value="">-- Selectionner --</option>
                  <option value="wave">Wave</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="free_money">Free Money</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-[#374151]">Mode de remuneration</label>
                <select
                  value={formData.mode_remuneration}
                  onChange={(e) => setFormData({ ...formData, mode_remuneration: e.target.value })}
                  className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2.5 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent"
                >
                  <option value="">-- Selectionner --</option>
                  <option value="virement">Virement</option>
                  <option value="espece">Espece</option>
                  <option value="espece_virement">Espece + Virement</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleEditClick} loading={loading}>
                Enregistrer les modifications
              </Button>
              <Button onClick={handleCancel} variant="secondary">
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#6B7280] mb-1">Email</p>
              <p className="text-sm font-medium text-[#111827]">{enqueteur.email || '---'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Telephone</p>
                <p className="text-sm font-medium text-[#111827]">{enqueteur.telephone || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Reseau mobile</p>
                <p className="text-sm font-medium text-[#111827]">
                  {enqueteur.reseau_mobile === 'wave' ? 'Wave' :
                   enqueteur.reseau_mobile === 'orange_money' ? 'Orange Money' :
                   enqueteur.reseau_mobile === 'free_money' ? 'Free Money' : '---'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Mode de remuneration</p>
                <p className="text-sm font-medium text-[#111827]">
                  {enqueteur.mode_remuneration === 'virement' ? 'Virement' :
                   enqueteur.mode_remuneration === 'espece' ? 'Espece' :
                   enqueteur.mode_remuneration === 'espece_virement' ? 'Espece + Virement' :
                   enqueteur.mode_remuneration === 'cheque' ? 'Cheque' : '---'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Membre depuis</p>
                <p className="text-sm font-medium text-[#111827]">
                  {enqueteur.created_at ? new Date(enqueteur.created_at).toLocaleDateString('fr-FR') : '---'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Stats */}
      <Card className="p-6">
        <h3 className="font-semibold text-[#111827] mb-4">Statistiques</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#EFF6FF] text-center">
            <p className="text-2xl font-bold text-[#2563EB]">{affectations.length}</p>
            <p className="text-xs text-[#2563EB]">Enquetes</p>
          </div>
          <div className="p-4 rounded-xl bg-[#ECFDF5] text-center">
            <p className="text-2xl font-bold text-[#059669]">{totalCompletions}</p>
            <p className="text-xs text-[#059669]">Completions</p>
          </div>
          <div className="p-4 rounded-xl bg-[#F5F3FF] text-center">
            <p className="text-2xl font-bold text-[#7C3AED]">{totalObjectif}</p>
            <p className="text-xs text-[#7C3AED]">Objectif total</p>
          </div>
        </div>
      </Card>

      {/* Modal OTP */}
      <Modal isOpen={showOtpModal} onClose={() => { setShowOtpModal(false); setOtpCode(''); setError(''); }} title="Verification requise">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">
            Un code de verification a ete envoye a votre adresse email <strong>{enqueteur.email}</strong>.
            Entrez ce code pour confirmer les modifications.
          </p>

          {error && (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-sm text-[#DC2626]">
              {error}
            </div>
          )}

          <Input
            label="Code de verification"
            placeholder="000000"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="text-center text-2xl tracking-widest font-mono"
          />

          <div className="flex gap-3">
            <Button onClick={handleVerifyAndSave} loading={loading} fullWidth>
              Confirmer
            </Button>
            <Button onClick={() => { setShowOtpModal(false); setOtpCode(''); setError(''); }} variant="secondary" fullWidth>
              Annuler
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ══════════════════════════════════════════════════════════════════════════════ */

function KPICard({ label, value, subValue, color }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
        {subValue && <span className="text-sm font-normal text-[#9CA3AF] ml-1">{subValue}</span>}
      </p>
    </Card>
  )
}

function getProgressColor(pct) {
  if (pct >= 100) return '#059669'
  if (pct >= 75) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  if (pct >= 25) return '#F97316'
  return '#EF4444'
}
