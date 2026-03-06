import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboard,
  listEnquetes,
  listEnqueteurs,
  listAffectationsByEnquete,
  updateAffectation,
  syncAll,
} from '../lib/api'
import { Card, Badge, Button, Modal, Input, Avatar, Spinner } from '../components/ui'

const STATUTS = [
  { value: 'en_cours',  label: 'En cours',  variant: 'info' },
  { value: 'en_retard', label: 'En retard', variant: 'warning' },
  { value: 'termine',   label: 'Termine',   variant: 'success' },
]

// Liste des pays UEMOA/CEMAC
const PAYS_LIST = [
  'Benin', 'Burkina Faso', 'Cameroun', 'Congo', 'Cote d\'Ivoire', 'Gabon',
  'Guinee', 'Guinee-Bissau', 'Guinee Equatoriale', 'Mali', 'Niger',
  'RCA', 'Senegal', 'Tchad', 'Togo'
]

export default function Admin() {
  const nav = useNavigate()
  const [view, setView] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [enquetes, setEnquetes] = useState([])
  const [enqueteurs, setEnqueteurs] = useState([])
  const [allAffectations, setAllAffectations] = useState([])
  const [selectedEnquete, setSelectedEnquete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [dateFilter, setDateFilter] = useState('all')
  const [paysFilter, setPaysFilter] = useState('all')

  useEffect(() => {
    if (!sessionStorage.getItem('admin')) return nav('/')
    loadAll()
  }, [nav])

  async function loadAll() {
    setLoading(true)
    try {
      const [d, e, enq] = await Promise.all([getDashboard(), listEnquetes(), listEnqueteurs()])
      setDashboard(d)
      setEnquetes(e)
      setEnqueteurs(enq)

      // Charger toutes les affectations pour les stats par pays
      const allAff = []
      for (const enquete of e) {
        const affs = await listAffectationsByEnquete(enquete.id)
        allAff.push(...affs.map(a => ({ ...a, enquete })))
      }
      setAllAffectations(allAff)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (enquetes.length > 0 && !selectedEnquete && view === 'enquetes') {
      setSelectedEnquete(enquetes[0])
    }
  }, [enquetes, view, selectedEnquete])

  const filteredEnqueteurs = enqueteurs.filter(e =>
    `${e.nom} ${e.prenom} ${e.identifiant}`.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSync() {
    setSyncing(true)
    try {
      await syncAll()
      await loadAll()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      {/* SIDEBAR */}
      <aside
        className={`
          flex-shrink-0 flex flex-col border-r border-[#E5E7EB] bg-white
          transition-all duration-200
          ${sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#059669] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div>
                <span className="text-[#111827] font-semibold text-sm">Marketym Admin</span>
                <p className="text-[10px] text-[#9CA3AF]">Tableau de bord</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {!sidebarCollapsed && dashboard && (
          <div className="p-4 border-b border-[#E5E7EB]">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-[#F9FAFB]">
                <p className="text-lg font-bold text-[#111827]">{dashboard.total_completions}</p>
                <p className="text-[10px] text-[#9CA3AF]">Completions</p>
              </div>
              <div className="p-3 rounded-lg bg-[#ECFDF5]">
                <p className="text-lg font-bold text-[#059669]">{dashboard.taux_completion}%</p>
                <p className="text-[10px] text-[#059669]">Progression</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="p-2 border-b border-[#E5E7EB]">
          {!sidebarCollapsed && (
            <p className="px-3 py-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              Navigation
            </p>
          )}

          <NavButton
            icon={
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            }
            label="Tableau de bord"
            active={view === 'dashboard'}
            collapsed={sidebarCollapsed}
            onClick={() => setView('dashboard')}
          />

          <NavButton
            icon={
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
              </svg>
            }
            label="Enquetes"
            active={view === 'enquetes'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('enquetes'); setSelectedEnquete(enquetes[0] || null) }}
          />

          <NavButton
            icon={
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
              </svg>
            }
            label="Enqueteurs"
            active={view === 'enqueteurs'}
            collapsed={sidebarCollapsed}
            onClick={() => setView('enqueteurs')}
          />
        </div>

        {/* Enquetes List (only for enquetes view) */}
        {view === 'enquetes' && (
          <div className="flex-1 overflow-y-auto py-2">
            {!sidebarCollapsed && (
              <p className="px-4 py-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
                Toutes les enquetes
              </p>
            )}
            {enquetes.map((enq, index) => {
              const isSelected = selectedEnquete?.id === enq.id
              const pct = enq.total_objectif > 0 ? Math.round((enq.total_completions / enq.total_objectif) * 100) : 0

              return (
                <button
                  key={enq.id}
                  onClick={() => setSelectedEnquete(enq)}
                  className={`
                    w-full text-left transition-all duration-150 animate-slideIn
                    ${sidebarCollapsed ? 'px-3 py-3' : 'px-4 py-3'}
                    ${isSelected
                      ? 'bg-[#F3F4F6] border-l-2 border-l-[#059669]'
                      : 'border-l-2 border-l-transparent hover:bg-[#F9FAFB]'
                    }
                  `}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  {sidebarCollapsed ? (
                    <div className={`
                      w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold mx-auto
                      ${isSelected ? 'bg-[#059669] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}
                    `}>
                      {enq.code?.slice(0, 2)}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                          {enq.code}
                        </span>
                        <span className={`text-xs font-semibold ${pct >= 100 ? 'text-[#059669]' : 'text-[#6B7280]'}`}>
                          {pct}%
                        </span>
                      </div>
                      <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#111827]' : 'text-[#4B5563]'}`}>
                        {enq.nom}
                      </p>
                      <p className="text-[10px] text-[#9CA3AF] mt-1">
                        {enq.nb_enqueteurs} enqueteurs
                      </p>
                      <div className="mt-2">
                        <ProgressBarColored value={enq.total_completions} max={enq.total_objectif} size="sm" />
                      </div>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {view !== 'enquetes' && <div className="flex-1" />}

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E7EB] space-y-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`w-full p-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              syncing
                ? 'bg-[#ECFDF5] text-[#059669]'
                : 'bg-[#059669] text-white hover:bg-[#047857]'
            }`}
          >
            <svg
              className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {!sidebarCollapsed && (
              <span className="text-xs font-medium">
                {syncing ? 'Synchronisation...' : 'Synchroniser'}
              </span>
            )}
          </button>

          <button
            onClick={loadAll}
            className="w-full p-2 rounded-lg flex items-center justify-center gap-2 text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            {!sidebarCollapsed && <span className="text-xs">Actualiser</span>}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full p-2 rounded-lg flex items-center justify-center gap-2 text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!sidebarCollapsed && <span className="text-xs">Reduire</span>}
          </button>

          <button
            onClick={() => { sessionStorage.clear(); nav('/') }}
            className="w-full p-2 rounded-lg flex items-center justify-center gap-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!sidebarCollapsed && <span className="text-xs">Deconnexion</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : view === 'dashboard' ? (
          <DashboardView
            dashboard={dashboard}
            enquetes={enquetes}
            enqueteurs={enqueteurs}
            allAffectations={allAffectations}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            paysFilter={paysFilter}
            setPaysFilter={setPaysFilter}
          />
        ) : view === 'enqueteurs' ? (
          <EnqueteursView
            enqueteurs={filteredEnqueteurs}
            total={enqueteurs.length}
            search={search}
            setSearch={setSearch}
          />
        ) : selectedEnquete ? (
          <EnqueteDetailView enquete={selectedEnquete} onRefresh={loadAll} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-[#9CA3AF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
                  <rect x="9" y="3" width="6" height="4" rx="2" />
                </svg>
              </div>
              <p className="text-[#6B7280]">Selectionnez une enquete</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROGRESS BAR COLORED
   ══════════════════════════════════════════════════════════════════════════════ */

function ProgressBarColored({ value, max = 100, size = 'md', showLabel = false }) {
  const percentage = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100)

  const getColor = () => {
    if (percentage >= 100) return { bg: '#059669', light: '#ECFDF5' } // Vert - Termine
    if (percentage >= 75) return { bg: '#10B981', light: '#D1FAE5' }  // Vert clair - Presque fini
    if (percentage >= 50) return { bg: '#F59E0B', light: '#FEF3C7' }  // Orange - En cours
    if (percentage >= 25) return { bg: '#F97316', light: '#FFEDD5' }  // Orange fonce - Attention
    return { bg: '#EF4444', light: '#FEE2E2' }                        // Rouge - Critique
  }

  const colors = getColor()
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' }

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#6B7280]">{value} / {max}</span>
          <span className="font-medium" style={{ color: colors.bg }}>{percentage}%</span>
        </div>
      )}
      <div className={`w-full ${heights[size]} rounded-full overflow-hidden`} style={{ backgroundColor: colors.light }}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%`, backgroundColor: colors.bg }}
        />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardView({ dashboard, enquetes, enqueteurs, allAffectations, dateFilter, setDateFilter, paysFilter, setPaysFilter }) {

  // Calculer les stats par pays
  const statsByPays = useMemo(() => {
    const stats = {}
    PAYS_LIST.forEach(pays => {
      stats[pays] = { completions: 0, objectif: 0, clics: 0 }
    })

    // Pour l'instant, on simule avec les données d'enquêteurs
    // Dans une vraie implementation, on utiliserait completions_pays
    enqueteurs.forEach(enq => {
      const paysAssigne = enq.pays || 'Senegal'
      if (stats[paysAssigne]) {
        stats[paysAssigne].completions += enq.total_completions || 0
        stats[paysAssigne].objectif += enq.total_objectif || 0
        stats[paysAssigne].clics += enq.total_clics || 0
      }
    })

    return Object.entries(stats)
      .map(([pays, data]) => ({ pays, ...data }))
      .filter(p => p.objectif > 0 || p.completions > 0)
      .sort((a, b) => {
        const pctA = a.objectif > 0 ? a.completions / a.objectif : 0
        const pctB = b.objectif > 0 ? b.completions / b.objectif : 0
        return pctB - pctA
      })
  }, [enqueteurs])

  // Simuler evolution par date (7 derniers jours)
  const evolutionData = useMemo(() => {
    const days = []
    const today = new Date()
    const totalCompletions = dashboard?.total_completions || 0

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dayName = date.toLocaleDateString('fr-FR', { weekday: 'short' })
      const dayNum = date.getDate()

      // Simulation progression cumulative
      const progress = Math.round(totalCompletions * ((7 - i) / 7) * (0.8 + Math.random() * 0.4))
      days.push({
        label: `${dayName} ${dayNum}`,
        value: Math.min(progress, totalCompletions),
        isToday: i === 0
      })
    }
    return days
  }, [dashboard])

  const maxEvolution = Math.max(...evolutionData.map(d => d.value), 1)

  // Stats par enquete
  const enquetesStats = enquetes.map(e => ({
    ...e,
    pct: e.total_objectif > 0 ? Math.round((e.total_completions / e.total_objectif) * 100) : 0
  })).sort((a, b) => b.pct - a.pct)

  return (
    <div className="p-6 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Tableau de bord</h1>
          <p className="text-sm text-[#6B7280]">Vue d'ensemble de toutes les enquetes</p>
        </div>

        {/* Filtres */}
        <div className="flex items-center gap-3">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[#D1D5DB] rounded-lg bg-white text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#059669]"
          >
            <option value="all">Toutes periodes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
          </select>
        </div>
      </div>

      {/* KPIs Globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          label="Total Completions"
          value={dashboard?.total_completions || 0}
          icon={<CheckIcon />}
          color="#059669"
          bgColor="#ECFDF5"
        />
        <KPICard
          label="Objectif Global"
          value={dashboard?.total_objectif || 0}
          icon={<TargetIcon />}
          color="#2563EB"
          bgColor="#EFF6FF"
        />
        <KPICard
          label="Taux de Completion"
          value={`${dashboard?.taux_completion || 0}%`}
          icon={<ChartIcon />}
          color="#7C3AED"
          bgColor="#F5F3FF"
          highlight={dashboard?.taux_completion >= 75}
        />
        <KPICard
          label="Total Clics"
          value={dashboard?.total_clics || 0}
          icon={<ClickIcon />}
          color="#D97706"
          bgColor="#FFFBEB"
        />
      </div>

      {/* Progression globale */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#111827]">Progression Globale</h3>
          <span className="text-2xl font-bold text-[#059669]">{dashboard?.taux_completion || 0}%</span>
        </div>
        <ProgressBarColored
          value={dashboard?.total_completions || 0}
          max={dashboard?.total_objectif || 1}
          size="lg"
        />
        <div className="flex justify-between mt-2 text-xs text-[#6B7280]">
          <span>{dashboard?.total_completions || 0} completions</span>
          <span>Objectif: {dashboard?.total_objectif || 0}</span>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Evolution par date */}
        <Card className="p-6">
          <h3 className="font-semibold text-[#111827] mb-4">Evolution des completions (7 jours)</h3>
          <div className="flex items-end justify-between h-40 gap-2">
            {evolutionData.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex flex-col items-center justify-end h-32">
                  <span className="text-xs font-medium text-[#111827] mb-1">{day.value}</span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${
                      day.isToday ? 'bg-[#059669]' : 'bg-[#E5E7EB]'
                    }`}
                    style={{ height: `${(day.value / maxEvolution) * 100}%`, minHeight: '4px' }}
                  />
                </div>
                <span className={`text-[10px] ${day.isToday ? 'font-bold text-[#059669]' : 'text-[#6B7280]'}`}>
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Stats par enquete */}
        <Card className="p-6">
          <h3 className="font-semibold text-[#111827] mb-4">Progression par enquete</h3>
          <div className="space-y-4">
            {enquetesStats.map((enq, i) => (
              <div key={enq.id} className="animate-slideIn" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                      {enq.code}
                    </span>
                    <span className="text-sm font-medium text-[#111827] truncate max-w-[150px]">
                      {enq.nom}
                    </span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: getProgressColor(enq.pct) }}>
                    {enq.pct}%
                  </span>
                </div>
                <ProgressBarColored value={enq.total_completions} max={enq.total_objectif} size="sm" />
                <div className="flex justify-between mt-1 text-[10px] text-[#9CA3AF]">
                  <span>{enq.total_completions} / {enq.total_objectif}</span>
                  <span>{enq.nb_enqueteurs} enqueteurs</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Stats par pays */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-[#111827]">Progression par pays</h3>
          <select
            value={paysFilter}
            onChange={(e) => setPaysFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-[#D1D5DB] rounded-lg bg-white text-[#374151] focus:outline-none focus:ring-2 focus:ring-[#059669]"
          >
            <option value="all">Tous les pays</option>
            {PAYS_LIST.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(paysFilter === 'all' ? statsByPays.slice(0, 9) : statsByPays.filter(p => p.pays === paysFilter)).map((pays, i) => {
            const pct = pays.objectif > 0 ? Math.round((pays.completions / pays.objectif) * 100) : 0
            return (
              <div
                key={pays.pays}
                className="p-4 rounded-xl border border-[#E5E7EB] hover:border-[#D1D5DB] transition-colors animate-slideIn"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[#111827]">{pays.pays}</span>
                  <Badge variant={pct >= 75 ? 'success' : pct >= 50 ? 'warning' : 'error'} size="sm">
                    {pct}%
                  </Badge>
                </div>
                <ProgressBarColored value={pays.completions} max={pays.objectif || 100} size="md" />
                <div className="flex justify-between mt-2 text-[10px] text-[#6B7280]">
                  <span>{pays.completions} completions</span>
                  <span>Obj: {pays.objectif || '—'}</span>
                </div>
              </div>
            )
          })}
        </div>

        {statsByPays.length === 0 && (
          <div className="text-center py-8 text-[#9CA3AF]">
            <p>Aucune donnee par pays disponible</p>
            <p className="text-xs mt-1">Les statistiques apparaitront apres synchronisation</p>
          </div>
        )}
      </Card>

      {/* Top Enqueteurs */}
      <Card className="p-6">
        <h3 className="font-semibold text-[#111827] mb-4">Top Enqueteurs</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E5E7EB]">
                <th className="text-left py-2 text-[10px] font-semibold text-[#6B7280] uppercase">#</th>
                <th className="text-left py-2 text-[10px] font-semibold text-[#6B7280] uppercase">Enqueteur</th>
                <th className="text-center py-2 text-[10px] font-semibold text-[#6B7280] uppercase">Completions</th>
                <th className="text-center py-2 text-[10px] font-semibold text-[#6B7280] uppercase">Objectif</th>
                <th className="py-2 text-[10px] font-semibold text-[#6B7280] uppercase">Progression</th>
              </tr>
            </thead>
            <tbody>
              {enqueteurs
                .sort((a, b) => (b.total_completions || 0) - (a.total_completions || 0))
                .slice(0, 5)
                .map((enq, i) => {
                  const pct = enq.total_objectif > 0 ? Math.round((enq.total_completions / enq.total_objectif) * 100) : 0
                  return (
                    <tr key={enq.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                      <td className="py-3">
                        <span className={`
                          w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                          ${i === 0 ? 'bg-[#FEF3C7] text-[#D97706]' :
                            i === 1 ? 'bg-[#E5E7EB] text-[#6B7280]' :
                            i === 2 ? 'bg-[#FFEDD5] text-[#C2410C]' :
                            'bg-[#F3F4F6] text-[#9CA3AF]'}
                        `}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={`${enq.prenom} ${enq.nom}`} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{enq.prenom} {enq.nom}</p>
                            <p className="text-xs text-[#9CA3AF]">{enq.identifiant}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center py-3 text-sm font-semibold text-[#059669]">
                        {enq.total_completions || 0}
                      </td>
                      <td className="text-center py-3 text-sm text-[#6B7280]">
                        {enq.total_objectif || 0}
                      </td>
                      <td className="py-3 w-32">
                        <div className="flex items-center gap-2">
                          <ProgressBarColored value={enq.total_completions || 0} max={enq.total_objectif || 1} size="sm" />
                          <span className="text-xs font-mono" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   KPI CARD
   ══════════════════════════════════════════════════════════════════════════════ */

function KPICard({ label, value, icon, color, bgColor, highlight }) {
  return (
    <Card className={`p-4 ${highlight ? 'ring-2 ring-[#059669]' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#6B7280] mb-1">{label}</p>
          <p className="text-2xl font-bold text-[#111827]">{value}</p>
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: bgColor, color }}
        >
          {icon}
        </div>
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════════════════════════════════════ */

function CheckIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function TargetIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  )
}

function ClickIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 15l-2 5L9 9l11 4-5 2z" />
      <path d="M22 22l-5-10" />
    </svg>
  )
}

function getProgressColor(pct) {
  if (pct >= 100) return '#059669'
  if (pct >= 75) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  if (pct >= 25) return '#F97316'
  return '#EF4444'
}

/* ══════════════════════════════════════════════════════════════════════════════
   NAV BUTTON
   ══════════════════════════════════════════════════════════════════════════════ */

function NavButton({ icon, label, active, collapsed, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150
        ${active
          ? 'bg-[#ECFDF5] text-[#059669]'
          : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'
        }
      `}
    >
      <span>{icon}</span>
      {!collapsed && (
        <span className="text-sm font-medium">{label}</span>
      )}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETE DETAIL VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteDetailView({ enquete, onRefresh }) {
  const [affectations, setAffectations] = useState([])
  const [loading, setLoading] = useState(true)
  const [editAff, setEditAff] = useState(null)

  useEffect(() => {
    loadAffectations()
  }, [enquete.id])

  async function loadAffectations() {
    setLoading(true)
    try {
      const data = await listAffectationsByEnquete(enquete.id)
      setAffectations(data)
    } finally { setLoading(false) }
  }

  async function handleSave(id, data) {
    await updateAffectation(id, data)
    await loadAffectations()
    onRefresh()
  }

  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_total || 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const totalClics = affectations.reduce((s, a) => s + (a.clics || 0), 0)
  const pct = totalObjectif > 0 ? Math.round((totalCompletions / totalObjectif) * 100) : 0

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header */}
      <div className="p-6 border-b border-[#E5E7EB] bg-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
                {enquete.code}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-[#111827] mb-1">{enquete.nom}</h1>
            <p className="text-sm text-[#6B7280]">{enquete.cible}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold" style={{ color: getProgressColor(pct) }}>{pct}%</p>
            <p className="text-xs text-[#9CA3AF]">{totalCompletions}/{totalObjectif}</p>
          </div>
        </div>

        {/* Mini Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          {[
            { label: 'Enqueteurs', value: affectations.length, color: '#2563EB', bg: '#EFF6FF' },
            { label: 'Completions', value: totalCompletions, color: '#059669', bg: '#ECFDF5' },
            { label: 'Clics', value: totalClics, color: '#7C3AED', bg: '#F5F3FF' },
          ].map((stat, i) => (
            <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: stat.bg }}>
              <p className="text-xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: stat.color, opacity: 0.7 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar globale */}
        <div className="mt-4">
          <ProgressBarColored value={totalCompletions} max={totalObjectif} size="lg" showLabel />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#111827]">
            Affectations
            <span className="text-[#9CA3AF] font-normal ml-2">({affectations.length})</span>
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Enqueteur
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Clics
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Completions
                  </th>
                  <th className="px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Progression
                  </th>
                  <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {affectations.map((a, i) => {
                  const enqr = a.enqueteurs || {}
                  const statut = STATUTS.find(s => s.value === a.statut) || STATUTS[0]
                  const rowPct = Math.round((a.completions_total / Math.max(a.objectif_total, 1)) * 100)

                  return (
                    <tr
                      key={a.id}
                      className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors animate-slideUp"
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={`${enqr.prenom} ${enqr.nom}`} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-[#111827]">{enqr.prenom} {enqr.nom}</p>
                            <p className="text-xs font-mono text-[#9CA3AF]">{enqr.identifiant}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3 text-sm font-mono text-[#6B7280]">
                        {a.clics}
                      </td>
                      <td className="text-center px-4 py-3 text-sm font-mono font-medium text-[#111827]">
                        {a.completions_total}
                      </td>
                      <td className="px-4 py-3 w-36">
                        <div className="flex items-center gap-2">
                          <ProgressBarColored value={a.completions_total} max={a.objectif_total} size="sm" />
                          <span className="text-xs font-mono" style={{ color: getProgressColor(rowPct) }}>{rowPct}%</span>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3">
                        <Badge variant={statut.variant} size="sm">
                          {statut.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" size="sm" onClick={() => setEditAff(a)}>
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {/* Edit Modal */}
      {editAff && (
        <AffectationModal
          affectation={editAff}
          onClose={() => setEditAff(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETEURS VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteursView({ enqueteurs, total, search, setSearch }) {
  return (
    <div className="p-6 animate-fadeIn">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#111827] mb-1">Enqueteurs</h1>
        <p className="text-sm text-[#6B7280]">{total} enqueteurs enregistres</p>
      </div>

      {/* Search */}
      <div className="mb-6 max-w-xs">
        <Input
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          }
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Enqueteur
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Contact
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Enquetes
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Completions
              </th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                Progression
              </th>
            </tr>
          </thead>
          <tbody>
            {enqueteurs.map((e, i) => {
              const pct = e.total_objectif > 0 ? Math.round((e.total_completions / e.total_objectif) * 100) : 0
              return (
                <tr
                  key={e.id}
                  className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors animate-slideUp"
                  style={{
                    animationDelay: `${i * 15}ms`,
                    opacity: e.actif === false ? 0.5 : 1,
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${e.prenom} ${e.nom}`} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-[#111827]">{e.prenom} {e.nom}</p>
                        <p className="text-xs font-mono text-[#9CA3AF]">{e.identifiant}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-[#4B5563]">{e.telephone || '—'}</p>
                    <p className="text-xs text-[#9CA3AF]">
                      {e.reseau_mobile === 'wave' ? 'Wave' : e.reseau_mobile === 'orange_money' ? 'Orange Money' : '—'}
                    </p>
                  </td>
                  <td className="text-center px-4 py-3 text-sm font-mono text-[#2563EB]">
                    {e.nb_enquetes}
                  </td>
                  <td className="text-center px-4 py-3 text-sm font-mono font-medium text-[#059669]">
                    {e.total_completions}
                  </td>
                  <td className="px-4 py-3 w-36">
                    <div className="flex items-center gap-2">
                      <ProgressBarColored value={e.total_completions} max={e.total_objectif} size="sm" />
                      <span className="text-xs font-mono" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {enqueteurs.length === 0 && (
          <div className="py-12 text-center text-sm text-[#9CA3AF]">
            Aucun enqueteur trouve
          </div>
        )}
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   AFFECTATION MODAL
   ══════════════════════════════════════════════════════════════════════════════ */

function AffectationModal({ affectation, onClose, onSave }) {
  const [form, setForm] = useState({
    clics: affectation.clics || 0,
    completions_total: affectation.completions_total || 0,
    objectif_total: affectation.objectif_total || 200,
    statut: affectation.statut || 'en_cours',
    commentaire_admin: affectation.commentaire_admin || '',
  })
  const [saving, setSaving] = useState(false)

  const enqr = affectation.enqueteurs || {}

  async function handleSubmit() {
    setSaving(true)
    try {
      await onSave(affectation.id, form)
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${enqr.prenom} ${enqr.nom}`}
    >
      <p className="text-xs font-mono text-[#6B7280] mb-6 px-2 py-1 bg-[#F3F4F6] rounded inline-block">
        {enqr.identifiant}
      </p>

      <div className="space-y-4">
        {/* Numbers */}
        <div className="grid grid-cols-3 gap-3">
          {[
            ['clics', 'Clics'],
            ['completions_total', 'Completions'],
            ['objectif_total', 'Objectif'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">{label}</label>
              <input
                type="number"
                min={0}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: parseInt(e.target.value) || 0 }))}
                className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent"
              />
            </div>
          ))}
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Statut</label>
          <div className="flex gap-2">
            {STATUTS.map(s => (
              <button
                key={s.value}
                onClick={() => setForm(f => ({ ...f, statut: s.value }))}
                className={`
                  flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-150
                  ${form.statut === s.value
                    ? 'ring-2 ring-[#059669] bg-[#ECFDF5] text-[#059669]'
                    : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                  }
                `}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comment */}
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Message pour l'enqueteur</label>
          <textarea
            value={form.commentaire_admin}
            onChange={e => setForm(f => ({ ...f, commentaire_admin: e.target.value }))}
            rows={3}
            placeholder="Message visible par l'enqueteur..."
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent resize-none"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>
          Annuler
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>
          Enregistrer
        </Button>
      </div>
    </Modal>
  )
}
