import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboard,
  listEnquetes,
  listEnqueteurs,
  listAffectationsByEnquete,
  updateAffectation,
  syncAll,
} from '../lib/api'
import { Card, Badge, ProgressBar, Button, Modal, Input, Avatar, Spinner } from '../components/ui'

const STATUTS = [
  { value: 'en_cours',  label: 'En cours',  variant: 'info' },
  { value: 'en_retard', label: 'En retard', variant: 'warning' },
  { value: 'termine',   label: 'Termine',   variant: 'success' },
]

export default function Admin() {
  const nav = useNavigate()
  const [view, setView] = useState('enquetes')
  const [dashboard, setDashboard] = useState(null)
  const [enquetes, setEnquetes] = useState([])
  const [enqueteurs, setEnqueteurs] = useState([])
  const [selectedEnquete, setSelectedEnquete] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)

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
      {/* ══════════════════════════════════════════════════════════════════════
          SIDEBAR
          ══════════════════════════════════════════════════════════════════════ */}
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

        {/* Enquetes List */}
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
                        <ProgressBar value={enq.total_completions} max={enq.total_objectif} size="sm" />
                      </div>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {view === 'enqueteurs' && <div className="flex-1" />}

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E7EB] space-y-1">
          {/* Sync Button */}
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

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
          ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Spinner size="lg" />
          </div>
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
            <p className="text-3xl font-bold text-[#111827]">{pct}%</p>
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
                          <ProgressBar value={a.completions_total} max={a.objectif_total} size="sm" />
                          <span className="text-xs font-mono text-[#6B7280] w-8">{rowPct}%</span>
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
                      <ProgressBar value={e.total_completions} max={e.total_objectif} size="sm" />
                      <span className="text-xs font-mono text-[#6B7280] w-8">{pct}%</span>
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
