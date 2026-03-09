import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboard,
  listEnquetes,
  listEnqueteurs,
  listAffectationsByEnquete,
  updateAffectation,
  syncAll,
  getEnqueteur,
  createEnquete,
  updateEnquete,
  deleteEnquete,
  createEnqueteur,
  updateEnqueteur,
  deleteEnqueteur,
  createAffectation,
  deleteAffectation,
  getSurveyInfo,
  getSurveyQuestions,
  getSegmentationsByEnquete,
  createSegmentation,
  deleteSegmentation,
  getQuotasBySegmentation,
  createQuotasBulk,
  updateQuota,
  deleteQuota,
  getSegmentationsStats,
  getHistoriqueGlobal,
  authRequestProfileOTP,
  authUpdateProfile,
  updateEnqueteurRole,
} from '../lib/api'
import { Card, Badge, Button, Modal, Input, Avatar, Spinner, LineChart } from '../components/ui'

const STATUTS = [
  { value: 'en_cours',  label: 'En cours',  variant: 'info' },
  { value: 'en_retard', label: 'En retard', variant: 'warning' },
  { value: 'termine',   label: 'Termine',   variant: 'success' },
]

export default function Admin() {
  const nav = useNavigate()
  const [view, setView] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [enquetes, setEnquetes] = useState([])
  const [enqueteurs, setEnqueteurs] = useState([])
  const [segmentationsStats, setSegmentationsStats] = useState([])
  const [historique, setHistorique] = useState([])
  const [selectedEnquete, setSelectedEnquete] = useState(null)
  const [selectedEnqueteur, setSelectedEnqueteur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [adminUser, setAdminUser] = useState(null)

  // Modals
  const [showEnqueteModal, setShowEnqueteModal] = useState(false)
  const [showEnqueteurModal, setShowEnqueteurModal] = useState(false)
  const [showAffectationModal, setShowAffectationModal] = useState(false)
  const [editingEnquete, setEditingEnquete] = useState(null)
  const [editingEnqueteur, setEditingEnqueteur] = useState(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('user')
    if (!stored) return nav('/')
    const user = JSON.parse(stored)
    if (!user.is_admin) return nav('/dashboard')
    setAdminUser(user)
    loadAll()
  }, [nav])

  async function loadAll() {
    setLoading(true)
    try {
      const [d, e, enq, segStats, hist] = await Promise.all([
        getDashboard(),
        listEnquetes(),
        listEnqueteurs(),
        getSegmentationsStats(),
        getHistoriqueGlobal(30)
      ])
      setDashboard(d)
      setEnquetes(e)
      setEnqueteurs(enq)
      setSegmentationsStats(segStats)
      setHistorique(hist || [])
    } finally { setLoading(false) }
  }

  const filteredEnqueteurs = enqueteurs.filter(e =>
    `${e.nom} ${e.prenom} ${e.identifiant}`.toLowerCase().includes(search.toLowerCase())
  )

  // Verifier si l'utilisateur est super admin
  const isSuperAdmin = adminUser?.role === 'super_admin'

  async function handleSync() {
    setSyncing(true)
    try {
      await syncAll()
      await loadAll()
    } finally {
      setSyncing(false)
    }
  }

  function openEnqueteModal(enquete = null) {
    setEditingEnquete(enquete)
    setShowEnqueteModal(true)
  }

  function openEnqueteurModal(enqueteur = null) {
    setEditingEnqueteur(enqueteur)
    setShowEnqueteurModal(true)
  }

  async function handleDeleteEnquete(id) {
    if (!confirm('Supprimer cette enquete et toutes ses affectations ?')) return
    await deleteEnquete(id)
    await loadAll()
    setSelectedEnquete(null)
  }

  async function handleDeleteEnqueteur(id) {
    if (!confirm('Supprimer cet enqueteur ?')) return
    await deleteEnqueteur(id)
    await loadAll()
    setSelectedEnqueteur(null)
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      {/* SIDEBAR */}
      <aside className={`flex-shrink-0 flex flex-col border-r border-[#E5E7EB] bg-white transition-all duration-200 ${sidebarCollapsed ? 'w-[68px]' : 'w-[260px]'}`}>
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
                <p className="text-[10px] text-[#9CA3AF]">Gestion des enquetes</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {!sidebarCollapsed && dashboard && (
          <div className="p-4 border-b border-[#E5E7EB]">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-[#F9FAFB]">
                <p className="text-lg font-bold text-[#111827]">{dashboard.total_valides}</p>
                <p className="text-[10px] text-[#9CA3AF]">Valides</p>
              </div>
              <div className="p-3 rounded-lg bg-[#ECFDF5]">
                <p className="text-lg font-bold text-[#059669]">{dashboard.taux_completion}%</p>
                <p className="text-[10px] text-[#059669]">Progression</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="p-2 flex-1">
          {!sidebarCollapsed && (
            <p className="px-3 py-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              Navigation
            </p>
          )}

          <NavButton
            icon={<DashboardIcon />}
            label="Tableau de bord"
            active={view === 'dashboard'}
            collapsed={sidebarCollapsed}
            onClick={() => setView('dashboard')}
          />

          <NavButton
            icon={<ClipboardIcon />}
            label="Enquetes"
            active={view === 'enquetes'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('enquetes'); setSelectedEnquete(null) }}
            badge={enquetes.length}
          />

          <NavButton
            icon={<UsersIcon />}
            label="Enqueteurs"
            active={view === 'enqueteurs'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('enqueteurs'); setSelectedEnqueteur(null) }}
            badge={enqueteurs.length}
          />

          <NavButton
            icon={<UserIcon />}
            label="Mon profil"
            active={view === 'profil'}
            collapsed={sidebarCollapsed}
            onClick={() => setView('profil')}
          />
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E7EB] space-y-1">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`w-full p-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              syncing ? 'bg-[#ECFDF5] text-[#059669]' : 'bg-[#059669] text-white hover:bg-[#047857]'
            }`}
          >
            <SyncIcon className={syncing ? 'animate-spin' : ''} />
            {!sidebarCollapsed && (
              <span className="text-xs font-medium">
                {syncing ? 'Synchronisation...' : 'Synchroniser'}
              </span>
            )}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full p-2 rounded-lg flex items-center justify-center gap-2 text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
          >
            <ChevronIcon className={`transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`} />
            {!sidebarCollapsed && <span className="text-xs">Reduire</span>}
          </button>

          <button
            onClick={() => { sessionStorage.clear(); nav('/') }}
            className="w-full p-2 rounded-lg flex items-center justify-center gap-2 text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
          >
            <LogoutIcon />
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
            segmentationsStats={segmentationsStats}
            historique={historique}
          />
        ) : view === 'enqueteurs' ? (
          selectedEnqueteur ? (
            <EnqueteurDetailView
              enqueteur={selectedEnqueteur}
              onBack={() => setSelectedEnqueteur(null)}
            />
          ) : (
            <EnqueteursListView
              enqueteurs={filteredEnqueteurs}
              total={enqueteurs.length}
              search={search}
              setSearch={setSearch}
              onSelect={setSelectedEnqueteur}
              onAdd={() => openEnqueteurModal()}
              onEdit={openEnqueteurModal}
              onDelete={handleDeleteEnqueteur}
              isSuperAdmin={isSuperAdmin}
              onRefresh={loadAll}
            />
          )
        ) : view === 'enquetes' ? (
          selectedEnquete ? (
            <EnqueteDetailView
              enquete={selectedEnquete}
              enqueteurs={enqueteurs}
              onBack={() => setSelectedEnquete(null)}
              onRefresh={loadAll}
              onEdit={() => openEnqueteModal(selectedEnquete)}
              onDelete={() => handleDeleteEnquete(selectedEnquete.id)}
              onAddAffectation={() => setShowAffectationModal(true)}
              isSuperAdmin={isSuperAdmin}
            />
          ) : (
            <EnquetesListView
              enquetes={enquetes}
              onSelect={setSelectedEnquete}
              onAdd={() => openEnqueteModal()}
              onEdit={openEnqueteModal}
              onDelete={handleDeleteEnquete}
              isSuperAdmin={isSuperAdmin}
            />
          )
        ) : view === 'profil' ? (
          <AdminProfilView
            user={adminUser}
            onUpdate={(updated) => {
              setAdminUser(updated)
              sessionStorage.setItem('user', JSON.stringify(updated))
            }}
          />
        ) : null}
      </main>

      {/* MODALS */}
      {showEnqueteModal && (
        <EnqueteModal
          enquete={editingEnquete}
          onClose={() => { setShowEnqueteModal(false); setEditingEnquete(null) }}
          onSave={async (data) => {
            if (editingEnquete) {
              await updateEnquete(editingEnquete.id, data)
            } else {
              await createEnquete(data)
            }
            await loadAll()
            setShowEnqueteModal(false)
            setEditingEnquete(null)
          }}
        />
      )}

      {showEnqueteurModal && (
        <EnqueteurModal
          enqueteur={editingEnqueteur}
          isSuperAdmin={isSuperAdmin}
          currentUserId={adminUser?.id}
          onClose={() => { setShowEnqueteurModal(false); setEditingEnqueteur(null) }}
          onSave={async (data) => {
            if (editingEnqueteur) {
              await updateEnqueteur(editingEnqueteur.id, data)
            } else {
              await createEnqueteur(data)
            }
            await loadAll()
            setShowEnqueteurModal(false)
            setEditingEnqueteur(null)
          }}
          onRoleChange={async (newRole) => {
            if (editingEnqueteur) {
              await updateEnqueteurRole(editingEnqueteur.id, newRole)
              await loadAll()
            }
          }}
        />
      )}

      {showAffectationModal && selectedEnquete && (
        <AffectationModal
          enquete={selectedEnquete}
          enqueteurs={enqueteurs}
          onClose={() => setShowAffectationModal(false)}
          onSave={async (data) => {
            await createAffectation(data)
            await loadAll()
            setShowAffectationModal(false)
          }}
        />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ICONS
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="2" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SyncIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 4v6h-6M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  )
}

function ChevronIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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

function CheckIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
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

/* ══════════════════════════════════════════════════════════════════════════════
   NAV BUTTON
   ══════════════════════════════════════════════════════════════════════════════ */

function NavButton({ icon, label, active, collapsed, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
        active ? 'bg-[#ECFDF5] text-[#059669]' : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'
      }`}
    >
      <span>{icon}</span>
      {!collapsed && (
        <>
          <span className="text-sm font-medium flex-1 text-left">{label}</span>
          {badge !== undefined && (
            <span className="text-xs bg-[#F3F4F6] text-[#6B7280] px-2 py-0.5 rounded-full">{badge}</span>
          )}
        </>
      )}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROGRESS BAR
   ══════════════════════════════════════════════════════════════════════════════ */

function ProgressBar({ value, max = 100, size = 'md', showLabel = false }) {
  const percentage = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100)
  const getColor = () => {
    if (percentage >= 100) return { bg: '#059669', light: '#ECFDF5' }
    if (percentage >= 75) return { bg: '#10B981', light: '#D1FAE5' }
    if (percentage >= 50) return { bg: '#F59E0B', light: '#FEF3C7' }
    if (percentage >= 25) return { bg: '#F97316', light: '#FFEDD5' }
    return { bg: '#EF4444', light: '#FEE2E2' }
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
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${percentage}%`, backgroundColor: colors.bg }} />
      </div>
    </div>
  )
}

function getProgressColor(pct) {
  if (pct >= 100) return '#059669'
  if (pct >= 75) return '#10B981'
  if (pct >= 50) return '#F59E0B'
  if (pct >= 25) return '#F97316'
  return '#EF4444'
}

function formatTimeAgo(dateString) {
  if (!dateString) return { text: 'Jamais', isOnline: false }
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const isOnline = diffMins < 15
  if (diffMins < 1) return { text: 'En ligne', isOnline: true }
  if (diffMins < 15) return { text: `Il y a ${diffMins} min`, isOnline: true }
  if (diffMins < 60) return { text: `Il y a ${diffMins} min`, isOnline: false }
  if (diffHours < 24) return { text: `Il y a ${diffHours}h`, isOnline: false }
  if (diffDays === 1) return { text: 'Hier', isOnline: false }
  if (diffDays < 7) return { text: `Il y a ${diffDays}j`, isOnline: false }
  return { text: date.toLocaleDateString('fr-FR'), isOnline: false }
}

/* ══════════════════════════════════════════════════════════════════════════════
   KPI CARD
   ══════════════════════════════════════════════════════════════════════════════ */

function KPICard({ label, value, icon, color, bgColor }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[#6B7280] mb-1">{label}</p>
          <p className="text-2xl font-bold text-[#111827]">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bgColor, color }}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardView({ dashboard, enquetes, enqueteurs, segmentationsStats, historique }) {
  const [statutFilter, setStatutFilter] = useState('all')
  const [selectedSegEnquete, setSelectedSegEnquete] = useState(null)

  // Filtrer les enquetes par statut
  const filteredEnquetes = useMemo(() => {
    if (statutFilter === 'all') return enquetes
    return enquetes.filter(e => e.statut === statutFilter)
  }, [enquetes, statutFilter])

  const enquetesStats = filteredEnquetes.map(e => ({
    ...e,
    valides: e.total_valides ?? e.total_completions ?? 0,
    pct: e.total_objectif > 0 ? Math.round(((e.total_valides ?? e.total_completions ?? 0) / e.total_objectif) * 100) : 0,
    tauxConversion: e.total_clics > 0 ? Math.round(((e.total_valides ?? e.total_completions ?? 0) / e.total_clics) * 100) : 0
  })).sort((a, b) => (b.valides || 0) - (a.valides || 0))  // Tri par completions valides décroissantes

  // Stats filtrees
  const filteredTotalObjectif = filteredEnquetes.reduce((sum, e) => sum + (e.taille_echantillon || e.total_objectif || 0), 0)
  const filteredTotalValides = filteredEnquetes.reduce((sum, e) => sum + (e.total_valides ?? e.total_completions ?? 0), 0)
  const filteredTotalClics = filteredEnquetes.reduce((sum, e) => sum + (e.total_clics || 0), 0)
  const filteredPct = filteredTotalObjectif > 0 ? Math.round((filteredTotalValides / filteredTotalObjectif) * 100) : 0
  const filteredTauxConversion = filteredTotalClics > 0 ? Math.round((filteredTotalValides / filteredTotalClics) * 100) : 0

  // Taux de conversion global
  const tauxConversionGlobal = (dashboard?.total_clics || 0) > 0
    ? Math.round(((dashboard?.total_valides || 0) / (dashboard?.total_clics || 1)) * 100)
    : 0

  return (
    <div className="p-6 animate-fadeIn max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Tableau de bord</h1>
          <p className="text-sm text-[#6B7280]">Vue d'ensemble de toutes les enquetes</p>
        </div>
        {/* Filtre par statut */}
        <div className="flex gap-2">
          <button
            onClick={() => setStatutFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statutFilter === 'all' ? 'bg-[#111827] text-white' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
            }`}
          >
            Toutes ({enquetes.length})
          </button>
          <button
            onClick={() => setStatutFilter('en_cours')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statutFilter === 'en_cours' ? 'bg-[#2563EB] text-white' : 'bg-[#EFF6FF] text-[#2563EB] hover:bg-[#DBEAFE]'
            }`}
          >
            En cours ({dashboard?.nb_enquetes_en_cours || 0})
          </button>
          <button
            onClick={() => setStatutFilter('termine')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statutFilter === 'termine' ? 'bg-[#059669] text-white' : 'bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5]'
            }`}
          >
            Terminees ({dashboard?.nb_enquetes_terminees || 0})
          </button>
          <button
            onClick={() => setStatutFilter('archive')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statutFilter === 'archive' ? 'bg-[#6B7280] text-white' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
            }`}
          >
            Archivees ({dashboard?.nb_enquetes_archivees || 0})
          </button>
        </div>
      </div>

      {/* KPIs - adaptes au filtre */}
      {statutFilter === 'all' ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard label="Valides" value={dashboard?.total_valides || 0} icon={<CheckIcon />} color="#059669" bgColor="#ECFDF5" />
          <KPICard label="Invalides" value={dashboard?.total_invalides || 0} icon={<XIcon />} color="#DC2626" bgColor="#FEF2F2" />
          <KPICard label="Echantillon" value={dashboard?.total_objectif || 0} icon={<TargetIcon />} color="#2563EB" bgColor="#EFF6FF" />
          <KPICard label="Conversion" value={`${tauxConversionGlobal}%`} icon={<ChartIcon />} color="#7C3AED" bgColor="#F5F3FF" />
          <KPICard label="Clics" value={dashboard?.total_clics || 0} icon={<ClickIcon />} color="#D97706" bgColor="#FFFBEB" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard label="Enquetes" value={filteredEnquetes.length} icon={<ClipboardIcon />} color="#2563EB" bgColor="#EFF6FF" />
          <KPICard label="Completions" value={filteredTotalCompletions} icon={<CheckIcon />} color="#059669" bgColor="#ECFDF5" />
          <KPICard label="Echantillon" value={filteredTotalObjectif} icon={<TargetIcon />} color="#7C3AED" bgColor="#F5F3FF" />
          <KPICard label="Conversion" value={`${filteredTauxConversion}%`} icon={<ChartIcon />} color="#D97706" bgColor="#FFFBEB" />
          <KPICard label="Clics" value={filteredTotalClics} icon={<ClickIcon />} color="#6B7280" bgColor="#F3F4F6" />
        </div>
      )}

      {/* Progression globale + Courbe */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111827]">
              Progression {statutFilter !== 'all' ? `(${statutFilter === 'en_cours' ? 'En cours' : statutFilter === 'termine' ? 'Terminees' : 'Archivees'})` : 'Globale'}
            </h3>
            <span className="text-2xl font-bold text-[#059669]">
              {statutFilter === 'all' ? (dashboard?.taux_completion || 0) : filteredPct}%
            </span>
          </div>
          <ProgressBar
            value={statutFilter === 'all' ? (dashboard?.total_valides || 0) : filteredTotalCompletions}
            max={statutFilter === 'all' ? (dashboard?.total_objectif || 1) : (filteredTotalObjectif || 1)}
            size="lg"
          />
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-[#059669] font-medium">
              {statutFilter === 'all' ? (dashboard?.total_valides || 0) : filteredTotalCompletions} completions
            </span>
            <span className="text-[#6B7280]">
              Echantillon: {statutFilter === 'all' ? (dashboard?.total_objectif || 0) : filteredTotalObjectif}
            </span>
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
          <LineChart data={historique} height={120} color="#059669" />
        </Card>
      </div>

      {/* Par enquete */}
      <Card className="p-6 mb-6">
        <h3 className="font-semibold text-[#111827] mb-4">Par enquete</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enquetesStats.map(enq => (
            <div key={enq.id} className="p-4 rounded-lg bg-[#F9FAFB]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-white text-[#6B7280]">{enq.code}</span>
                  <Badge variant={enq.statut === 'en_cours' ? 'info' : enq.statut === 'termine' ? 'success' : 'default'} size="sm">
                    {enq.statut === 'en_cours' ? 'En cours' : enq.statut === 'termine' ? 'Termine' : 'Archive'}
                  </Badge>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#F5F3FF] text-[#7C3AED] font-medium">
                  Conv: {enq.tauxConversion}%
                </span>
              </div>
              <p className="text-sm font-medium text-[#111827] mb-2 truncate">{enq.nom}</p>
              <ProgressBar value={enq.valides} max={enq.total_objectif} size="sm" />
              <div className="flex justify-between mt-2 text-[10px]">
                <span className="text-[#059669]">{enq.valides} valides</span>
                <span className="text-[#6B7280]">Obj: {enq.total_objectif}</span>
              </div>
              <div className="flex justify-between mt-1 text-[10px]">
                <span className="text-[#6B7280]">{enq.total_clics || 0} clics</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Segmentations par enquete */}
      {segmentationsStats && segmentationsStats.length > 0 && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111827]">Segmentations</h3>
            <div className="flex gap-2">
              {segmentationsStats.map(enqSeg => (
                <button
                  key={enqSeg.enquete_id}
                  onClick={() => setSelectedSegEnquete(selectedSegEnquete === enqSeg.enquete_id ? null : enqSeg.enquete_id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedSegEnquete === enqSeg.enquete_id
                      ? 'bg-[#059669] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {enqSeg.enquete_code}
                </button>
              ))}
            </div>
          </div>

          {selectedSegEnquete ? (
            <div>
              {segmentationsStats
                .filter(s => s.enquete_id === selectedSegEnquete)
                .map(enqSeg => (
                  <div key={enqSeg.enquete_id}>
                    {enqSeg.segmentations.map(seg => (
                      <div key={seg.id} className="mb-4">
                        <p className="text-sm font-medium text-[#374151] mb-2">{seg.nom}</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {seg.quotas.slice(0, 8).map(q => {
                            const pct = q.objectif > 0 ? Math.round(((q.completions || 0) / q.objectif) * 100) : 0
                            return (
                              <div key={q.id} className="p-2 bg-[#F9FAFB] rounded-lg">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-[#374151] truncate">{q.segment_value}</span>
                                  <span className="text-xs font-semibold" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                                </div>
                                <ProgressBar value={q.completions || 0} max={q.objectif} size="sm" />
                                <div className="flex justify-between mt-1 text-[9px] text-[#6B7280]">
                                  <span>{q.completions || 0}</span>
                                  <span>/ {q.objectif}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {seg.quotas.length > 8 && (
                          <p className="text-xs text-[#9CA3AF] mt-2">+ {seg.quotas.length - 8} autres</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-[#9CA3AF] text-center py-4">Selectionnez une enquete pour voir ses segmentations</p>
          )}
        </Card>
      )}

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
                <th className="py-2 text-[10px] font-semibold text-[#6B7280] uppercase">Progression</th>
              </tr>
            </thead>
            <tbody>
              {enqueteurs.sort((a, b) => (b.total_completions_valides ?? b.total_completions ?? 0) - (a.total_completions_valides ?? a.total_completions ?? 0)).slice(0, 5).map((enq, i) => {
                const valides = enq.total_completions_valides ?? enq.total_completions ?? 0
                const pct = enq.total_objectif > 0 ? Math.round((valides / enq.total_objectif) * 100) : 0
                return (
                  <tr key={enq.id} className="border-b border-[#E5E7EB]">
                    <td className="py-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-[#FEF3C7] text-[#D97706]' : i === 1 ? 'bg-[#E5E7EB] text-[#6B7280]' : 'bg-[#F3F4F6] text-[#9CA3AF]'
                      }`}>{i + 1}</span>
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
                    <td className="text-center py-3 text-sm font-semibold text-[#059669]">{valides}</td>
                    <td className="py-3 w-32">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={valides} max={enq.total_objectif || 1} size="sm" />
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
   ENQUETES LIST VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnquetesListView({ enquetes, onSelect, onAdd, onEdit, onDelete, isSuperAdmin }) {
  return (
    <div className="p-6 animate-fadeIn max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Enquetes</h1>
          <p className="text-sm text-[#6B7280]">{enquetes.length} enquetes enregistrees</p>
        </div>
        <Button variant="primary" onClick={onAdd}>
          <PlusIcon />
          <span className="ml-2">Nouvelle enquete</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {enquetes.map(enq => {
          const valides = enq.total_valides ?? enq.total_completions ?? 0
          const pct = enq.total_objectif > 0 ? Math.round((valides / enq.total_objectif) * 100) : 0
          return (
            <Card key={enq.id} className="p-5 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onSelect(enq)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">{enq.code}</span>
                  <Badge variant={enq.statut === 'en_cours' ? 'info' : enq.statut === 'termine' ? 'success' : 'default'} size="sm" className="ml-2">
                    {enq.statut}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onEdit(enq) }} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280]">
                    <EditIcon />
                  </button>
                  {isSuperAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(enq.id) }} className="p-1.5 rounded hover:bg-[#FEF2F2] text-[#DC2626]">
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-[#111827] mb-1">{enq.nom}</h3>
              <p className="text-sm text-[#6B7280] mb-4 line-clamp-2">{enq.cible}</p>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#6B7280]">{enq.nb_enqueteurs} enqueteurs</span>
                <span className="text-lg font-bold" style={{ color: getProgressColor(pct) }}>{pct}%</span>
              </div>
              <ProgressBar value={valides} max={enq.total_objectif} size="md" />
              <div className="flex justify-between mt-2 text-xs text-[#9CA3AF]">
                <span>{valides} valides</span>
                <span>Obj: {enq.total_objectif}</span>
              </div>
            </Card>
          )
        })}
      </div>

      {enquetes.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
            <ClipboardIcon />
          </div>
          <p className="text-[#6B7280] mb-4">Aucune enquete</p>
          <Button variant="primary" onClick={onAdd}>Creer une enquete</Button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETE DETAIL VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteDetailView({ enquete, enqueteurs, onBack, onRefresh, onEdit, onDelete, onAddAffectation, isSuperAdmin }) {
  const [activeTab, setActiveTab] = useState('affectations')
  const [affectations, setAffectations] = useState([])
  const [segmentations, setSegmentations] = useState([])
  const [loading, setLoading] = useState(true)
  const [editAff, setEditAff] = useState(null)

  useEffect(() => {
    loadData()
  }, [enquete.id])

  async function loadData() {
    setLoading(true)
    try {
      const [affs, segs] = await Promise.all([
        listAffectationsByEnquete(enquete.id),
        getSegmentationsByEnquete(enquete.id)
      ])
      setAffectations(affs)
      setSegmentations(segs)
    } finally { setLoading(false) }
  }

  async function loadAffectations() {
    const data = await listAffectationsByEnquete(enquete.id)
    setAffectations(data)
  }

  async function loadSegmentations() {
    const data = await getSegmentationsByEnquete(enquete.id)
    setSegmentations(data)
  }

  async function handleSaveAff(id, data) {
    await updateAffectation(id, data)
    await loadAffectations()
    onRefresh()
  }

  async function handleDeleteAff(id) {
    if (!confirm('Supprimer cette affectation ?')) return
    await deleteAffectation(id)
    await loadAffectations()
    onRefresh()
  }

  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  // Utiliser taille_echantillon de l'enquete si disponible, sinon somme des objectifs
  const tailleEchantillon = enquete.taille_echantillon || 0
  const totalObjectifAffectations = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const objectifGlobal = tailleEchantillon > 0 ? tailleEchantillon : totalObjectifAffectations
  const pct = objectifGlobal > 0 ? Math.round((totalCompletions / objectifGlobal) * 100) : 0

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header */}
      <div className="p-6 border-b border-[#E5E7EB] bg-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] mb-4 transition-colors">
          <BackIcon />
          Retour aux enquetes
        </button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">{enquete.code}</span>
              <Badge variant={enquete.statut === 'en_cours' ? 'info' : 'success'} size="sm">{enquete.statut}</Badge>
            </div>
            <h1 className="text-xl font-semibold text-[#111827] mb-1">{enquete.nom}</h1>
            <p className="text-sm text-[#6B7280]">{enquete.cible}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <EditIcon />
              <span className="ml-1">Modifier</span>
            </Button>
            {isSuperAdmin && (
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-[#DC2626] hover:bg-[#FEF2F2]">
                <TrashIcon />
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-[#FEF3C7]">
            <p className="text-xl font-bold text-[#D97706]">{tailleEchantillon}</p>
            <p className="text-[10px] font-medium uppercase text-[#D97706] opacity-70">Echantillon</p>
          </div>
          <div className="p-4 rounded-xl bg-[#EFF6FF]">
            <p className="text-xl font-bold text-[#2563EB]">{affectations.length}</p>
            <p className="text-[10px] font-medium uppercase text-[#2563EB] opacity-70">Enqueteurs</p>
          </div>
          <div className="p-4 rounded-xl bg-[#ECFDF5]">
            <p className="text-xl font-bold text-[#059669]">{totalCompletions}</p>
            <p className="text-[10px] font-medium uppercase text-[#059669] opacity-70">Completions</p>
          </div>
          <div className="p-4 rounded-xl bg-[#F5F3FF]">
            <p className="text-xl font-bold text-[#7C3AED]">{pct}%</p>
            <p className="text-[10px] font-medium uppercase text-[#7C3AED] opacity-70">Progression</p>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar value={totalCompletions} max={objectifGlobal} size="lg" showLabel />
        </div>

        {/* Onglets */}
        <div className="flex gap-1 mt-6 border-b border-[#E5E7EB]">
          <button
            onClick={() => setActiveTab('affectations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'affectations'
                ? 'border-[#059669] text-[#059669]'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Affectations ({affectations.length})
          </button>
          <button
            onClick={() => setActiveTab('segmentations')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'segmentations'
                ? 'border-[#059669] text-[#059669]'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Segmentations ({segmentations.length})
          </button>
        </div>
      </div>

      {/* Contenu des onglets */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'affectations' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#111827]">Affectations</h3>
              <Button variant="primary" size="sm" onClick={onAddAffectation}>
                <PlusIcon />
                <span className="ml-1">Ajouter</span>
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
                      <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Enqueteur</th>
                      <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Clics</th>
                      <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Completions</th>
                      <th className="px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Progression</th>
                      <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Statut</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {affectations.map(a => {
                      const enqr = a.enqueteurs || {}
                      const statut = STATUTS.find(s => s.value === a.statut) || STATUTS[0]
                      const valides = a.completions_valides ?? a.completions_total ?? 0
                      const rowPct = Math.round((valides / Math.max(a.objectif_total, 1)) * 100)
                      return (
                        <tr key={a.id} className="border-b border-[#E5E7EB] hover:bg-[#F9FAFB]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={`${enqr.prenom} ${enqr.nom}`} size="sm" />
                              <div>
                                <p className="text-sm font-medium text-[#111827]">{enqr.prenom} {enqr.nom}</p>
                                <p className="text-xs font-mono text-[#9CA3AF]">{enqr.identifiant}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-4 py-3 text-sm font-mono text-[#6B7280]">{a.clics}</td>
                          <td className="text-center px-4 py-3 text-sm font-mono font-medium text-[#111827]">{valides}</td>
                          <td className="px-4 py-3 w-36">
                            <div className="flex items-center gap-2">
                              <ProgressBar value={valides} max={a.objectif_total} size="sm" />
                              <span className="text-xs font-mono" style={{ color: getProgressColor(rowPct) }}>{rowPct}%</span>
                            </div>
                          </td>
                          <td className="text-center px-4 py-3">
                            <Badge variant={statut.variant} size="sm">{statut.label}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => setEditAff(a)} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280]">
                                <EditIcon />
                              </button>
                              {isSuperAdmin && (
                                <button onClick={() => handleDeleteAff(a.id)} className="p-1.5 rounded hover:bg-[#FEF2F2] text-[#DC2626]">
                                  <TrashIcon />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {affectations.length === 0 && (
                  <div className="py-12 text-center text-sm text-[#9CA3AF]">Aucune affectation</div>
                )}
              </Card>
            )}
          </>
        )}

        {activeTab === 'segmentations' && (
          <SegmentationsTab
            enquete={enquete}
            segmentations={segmentations}
            onRefresh={loadSegmentations}
          />
        )}
      </div>

      {editAff && (
        <EditAffectationModal affectation={editAff} onClose={() => setEditAff(null)} onSave={handleSaveAff} />
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   SEGMENTATIONS TAB
   ══════════════════════════════════════════════════════════════════════════════ */

function SegmentationsTab({ enquete, segmentations, onRefresh }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedSeg, setSelectedSeg] = useState(null)
  const [questions, setQuestions] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // Charger les questions du survey pour la creation
  async function loadQuestions() {
    if (!enquete.survey_id || questions.length > 0) return
    setLoadingQuestions(true)
    try {
      const qs = await getSurveyQuestions(enquete.survey_id)
      setQuestions(qs)
    } catch (err) {
      console.error('Erreur chargement questions:', err)
    } finally {
      setLoadingQuestions(false)
    }
  }

  async function handleCreateSegmentation(data) {
    // 1. Creer la segmentation
    const seg = await createSegmentation({
      enquete_id: enquete.id,
      question_id: data.question_id,
      question_text: data.question_text,
      nom: data.nom,
    })

    // 2. Creer les quotas si fournis
    if (data.quotas && data.quotas.length > 0) {
      await createQuotasBulk({
        segmentation_id: seg.id,
        quotas: data.quotas.map(q => ({
          segment_value: q.text,
          objectif: q.objectif
        }))
      })
    }

    onRefresh()
    setShowAddModal(false)
  }

  async function handleDeleteSegmentation(id) {
    if (!confirm('Supprimer cette segmentation et ses quotas ?')) return
    await deleteSegmentation(id)
    onRefresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#111827]">Segmentations</h3>
        <Button
          variant="primary"
          size="sm"
          onClick={() => { loadQuestions(); setShowAddModal(true) }}
          disabled={!enquete.survey_id}
        >
          <PlusIcon />
          <span className="ml-1">Ajouter</span>
        </Button>
      </div>

      {!enquete.survey_id && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 mb-4">
          Configurez d'abord le Survey ID de cette enquete pour pouvoir ajouter des segmentations.
        </div>
      )}

      {segmentations.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#9CA3AF]">
          Aucune segmentation configuree
        </div>
      ) : (
        <div className="space-y-4">
          {segmentations.map(seg => (
            <SegmentationCard
              key={seg.id}
              segmentation={seg}
              isExpanded={selectedSeg === seg.id}
              onToggle={() => setSelectedSeg(selectedSeg === seg.id ? null : seg.id)}
              onDelete={() => handleDeleteSegmentation(seg.id)}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddSegmentationModal
          questions={questions}
          loading={loadingQuestions}
          onClose={() => setShowAddModal(false)}
          onSave={handleCreateSegmentation}
        />
      )}
    </div>
  )
}

function SegmentationCard({ segmentation, isExpanded, onToggle, onDelete }) {
  const [quotas, setQuotas] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAddQuotas, setShowAddQuotas] = useState(false)

  useEffect(() => {
    if (isExpanded && quotas.length === 0) {
      loadQuotas()
    }
  }, [isExpanded])

  async function loadQuotas() {
    setLoading(true)
    try {
      const data = await getQuotasBySegmentation(segmentation.id)
      setQuotas(data)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteQuota(id) {
    await deleteQuota(id)
    loadQuotas()
  }

  const totalObjectif = quotas.reduce((s, q) => s + (q.objectif || 0), 0)
  const totalCompletions = quotas.reduce((s, q) => s + (q.completions || 0), 0)

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#F9FAFB]"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isExpanded ? 'bg-[#059669] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">{segmentation.nom}</p>
            <p className="text-xs text-[#6B7280]">Question: {segmentation.question_text || segmentation.question_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-mono font-medium text-[#111827]">{totalCompletions}/{totalObjectif}</p>
            <p className="text-xs text-[#6B7280]">{quotas.length} quotas</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded hover:bg-[#FEF2F2] text-[#DC2626]"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-[#E5E7EB] p-4 bg-[#F9FAFB]">
          {loading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-medium text-[#6B7280]">Quotas par valeur</p>
                <Button variant="secondary" size="sm" onClick={() => setShowAddQuotas(true)}>
                  <PlusIcon />
                  <span className="ml-1">Ajouter quotas</span>
                </Button>
              </div>
              {quotas.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] text-center py-4">Aucun quota defini</p>
              ) : (
                <div className="space-y-2">
                  {[...quotas].sort((a, b) => (b.completions || 0) - (a.completions || 0)).map(q => (
                    <div key={q.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                      <span className="flex-1 text-sm text-[#111827]">{q.segment_value}</span>
                      <span className="text-sm font-mono text-[#059669]">{q.completions || 0}</span>
                      <span className="text-xs text-[#9CA3AF]">/</span>
                      <span className="text-sm font-mono text-[#6B7280]">{q.objectif}</span>
                      <ProgressBar value={q.completions || 0} max={q.objectif} size="sm" className="w-20" />
                      <button
                        onClick={() => handleDeleteQuota(q.id)}
                        className="p-1 rounded hover:bg-[#FEF2F2] text-[#DC2626]"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {showAddQuotas && (
            <AddQuotasModal
              segmentation={segmentation}
              onClose={() => setShowAddQuotas(false)}
              onSave={() => { loadQuotas(); setShowAddQuotas(false) }}
            />
          )}
        </div>
      )}
    </Card>
  )
}

function AddSegmentationModal({ questions, loading, onClose, onSave }) {
  const [form, setForm] = useState({ question_id: '', question_text: '', nom: '' })
  const [quotas, setQuotas] = useState([]) // [{text: "Cote d'Ivoire", objectif: 0}, ...]
  const [saving, setSaving] = useState(false)

  function handleSelectQuestion(qId) {
    const q = questions.find(x => x.id === qId)
    setForm({
      question_id: qId,
      question_text: q?.text || '',
      nom: '',
    })
    // Pre-remplir les quotas avec les modalites de la question
    if (q?.answers) {
      setQuotas(q.answers.map(a => ({ text: a.text, objectif: 0 })))
    } else {
      setQuotas([])
    }
  }

  function updateQuotaObjectif(index, value) {
    setQuotas(prev => prev.map((q, i) => i === index ? { ...q, objectif: parseInt(value) || 0 } : q))
  }

  async function handleSubmit() {
    if (!form.question_id || !form.nom) return alert('Remplissez tous les champs')
    setSaving(true)
    try {
      // Filtrer les quotas avec objectif > 0
      const quotasToCreate = quotas.filter(q => q.objectif > 0)
      await onSave({ ...form, quotas: quotasToCreate })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Nouvelle segmentation">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Question QuestionPro *</label>
          {loading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : (
            <select
              value={form.question_id}
              onChange={e => handleSelectQuestion(e.target.value)}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            >
              <option value="">Selectionner une question</option>
              {questions.map(q => (
                <option key={q.id} value={q.id}>{q.text}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Nom de la segmentation *</label>
          <input
            value={form.nom}
            onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
            placeholder="Ex: Pays, Secteur, Tranche d'age..."
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
          />
        </div>

        {/* Modalites et quotas */}
        {quotas.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              Quotas par modalite ({quotas.length} modalites)
            </label>
            <div className="max-h-60 overflow-y-auto border border-[#E5E7EB] rounded-lg">
              {quotas.map((q, i) => (
                <div key={i} className="flex items-center gap-3 p-2 border-b border-[#E5E7EB] last:border-b-0">
                  <span className="flex-1 text-sm text-[#374151] truncate" title={q.text}>{q.text}</span>
                  <input
                    type="number"
                    value={q.objectif}
                    onChange={e => updateQuotaObjectif(i, e.target.value)}
                    placeholder="0"
                    className="w-20 bg-white border border-[#D1D5DB] rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#059669]"
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-[#9CA3AF]">
              Total: {quotas.reduce((s, q) => s + q.objectif, 0)} | Laissez 0 pour ignorer une modalite
            </p>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>Creer</Button>
      </div>
    </Modal>
  )
}

function AddQuotasModal({ segmentation, onClose, onSave }) {
  const [quotasText, setQuotasText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    // Parser le texte: une ligne par quota, format "valeur: objectif" ou "valeur = objectif"
    const lines = quotasText.split('\n').filter(l => l.trim())
    const quotas = lines.map(line => {
      const match = line.match(/^(.+?)[\s]*[:=][\s]*(\d+)$/)
      if (match) {
        return { segment_value: match[1].trim(), objectif: parseInt(match[2]) }
      }
      return null
    }).filter(Boolean)

    if (quotas.length === 0) {
      return alert('Format invalide. Utilisez: "Valeur: 50" ou "Valeur = 50"')
    }

    setSaving(true)
    try {
      await createQuotasBulk({
        segmentation_id: segmentation.id,
        quotas: quotas
      })
      onSave()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={`Quotas: ${segmentation.nom}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">
            Quotas (une ligne par valeur)
          </label>
          <textarea
            value={quotasText}
            onChange={e => setQuotasText(e.target.value)}
            rows={8}
            placeholder={`Cote d'Ivoire: 50\nSenegal: 50\nCameroun: 50\nBurkina Faso: 30`}
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#059669] resize-none"
          />
          <p className="mt-1 text-xs text-[#9CA3AF]">Format: "Valeur: objectif" ou "Valeur = objectif"</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>Ajouter</Button>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETEURS LIST VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteursListView({ enqueteurs, total, search, setSearch, onSelect, onAdd, onEdit, onDelete, isSuperAdmin, onRefresh }) {
  return (
    <div className="p-6 animate-fadeIn max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Enqueteurs</h1>
          <p className="text-sm text-[#6B7280]">{total} enqueteurs enregistres</p>
        </div>
        <Button variant="primary" onClick={onAdd}>
          <PlusIcon />
          <span className="ml-2">Nouvel enqueteur</span>
        </Button>
      </div>

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

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Enqueteur</th>
              <th className="text-left px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Contact</th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Enquetes</th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Completions</th>
              <th className="px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Progression</th>
              <th className="text-center px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase">Connexion</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {enqueteurs.map(e => {
              const valides = e.total_completions_valides ?? e.total_completions ?? 0
              const pct = e.total_objectif > 0 ? Math.round((valides / e.total_objectif) * 100) : 0
              const lastConnexion = formatTimeAgo(e.derniere_connexion)
              return (
                <tr key={e.id} onClick={() => onSelect(e)} className="border-b border-[#E5E7EB] hover:bg-[#ECFDF5] transition-colors cursor-pointer" style={{ opacity: e.actif === false ? 0.5 : 1 }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar name={`${e.prenom} ${e.nom}`} size="sm" />
                        {lastConnexion.isOnline && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#059669] border-2 border-white rounded-full" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#111827]">{e.prenom} {e.nom}</p>
                        <p className="text-xs font-mono text-[#9CA3AF]">{e.identifiant}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-[#4B5563]">{e.email || '—'}</p>
                    <p className="text-xs text-[#9CA3AF]">{e.telephone || ''}</p>
                  </td>
                  <td className="text-center px-4 py-3 text-sm font-mono text-[#2563EB]">{e.nb_enquetes}</td>
                  <td className="text-center px-4 py-3 text-sm font-mono font-medium text-[#059669]">{valides}</td>
                  <td className="px-4 py-3 w-36">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={valides} max={e.total_objectif} size="sm" />
                      <span className="text-xs font-mono" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                    </div>
                  </td>
                  <td className="text-center px-4 py-3">
                    <span className={`text-xs ${lastConnexion.isOnline ? 'text-[#059669] font-medium' : 'text-[#9CA3AF]'}`}>
                      {lastConnexion.text}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {e.role === 'super_admin' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#7C3AED] text-white font-medium">SUPER</span>
                      )}
                      {e.role === 'admin' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2563EB] text-white font-medium">ADMIN</span>
                      )}
                      <button onClick={(ev) => { ev.stopPropagation(); onEdit(e) }} className="p-1.5 rounded hover:bg-[#F3F4F6] text-[#6B7280]">
                        <EditIcon />
                      </button>
                      {isSuperAdmin && e.role !== 'super_admin' && (
                        <button onClick={(ev) => { ev.stopPropagation(); onDelete(e.id) }} className="p-1.5 rounded hover:bg-[#FEF2F2] text-[#DC2626]">
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {enqueteurs.length === 0 && <div className="py-12 text-center text-sm text-[#9CA3AF]">Aucun enqueteur</div>}
      </Card>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ENQUETEUR DETAIL VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteurDetailView({ enqueteur, onBack }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDetails()
  }, [enqueteur.id])

  async function loadDetails() {
    setLoading(true)
    try {
      const data = await getEnqueteur(enqueteur.id)
      setDetails(data)
    } finally { setLoading(false) }
  }

  if (loading) return <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>

  const affectations = details?.affectations || []
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const globalPct = Math.round((totalCompletions / Math.max(totalObjectif, 1)) * 100)

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      <div className="p-6 border-b border-[#E5E7EB] bg-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] mb-4">
          <BackIcon />
          Retour aux enqueteurs
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={`${details.prenom} ${details.nom}`} size="lg" />
            <div>
              <h1 className="text-2xl font-semibold text-[#111827]">{details.prenom} {details.nom}</h1>
              <p className="text-sm font-mono text-[#6B7280]">{details.identifiant}</p>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {details.email && <span className="text-sm text-[#4B5563]">{details.email}</span>}
                {details.telephone && <span className="text-sm text-[#6B7280]">{details.telephone}</span>}
                <Badge variant={details.actif !== false ? 'success' : 'error'} size="sm">
                  {details.actif !== false ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold" style={{ color: getProgressColor(globalPct) }}>{globalPct}%</p>
            <p className="text-sm text-[#9CA3AF]">progression</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="p-4 rounded-xl bg-[#EFF6FF]">
            <p className="text-2xl font-bold text-[#2563EB]">{affectations.length}</p>
            <p className="text-[10px] font-medium uppercase text-[#2563EB] opacity-70">Enquetes</p>
          </div>
          <div className="p-4 rounded-xl bg-[#ECFDF5]">
            <p className="text-2xl font-bold text-[#059669]">{totalCompletions}</p>
            <p className="text-[10px] font-medium uppercase text-[#059669] opacity-70">Completions</p>
          </div>
          <div className="p-4 rounded-xl bg-[#F5F3FF]">
            <p className="text-2xl font-bold text-[#7C3AED]">{totalObjectif}</p>
            <p className="text-[10px] font-medium uppercase text-[#7C3AED] opacity-70">Objectif</p>
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar value={totalCompletions} max={totalObjectif} size="lg" showLabel />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <h3 className="text-sm font-semibold text-[#111827] mb-4">Enquetes assignees ({affectations.length})</h3>
        <div className="space-y-4">
          {affectations.map(aff => {
            const enquete = aff.enquetes || {}
            const valides = aff.completions_valides ?? aff.completions_total ?? 0
            const pct = Math.round((valides / Math.max(aff.objectif_total, 1)) * 100)
            return (
              <Card key={aff.id} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">{enquete.code}</span>
                      <Badge variant={pct >= 100 ? 'success' : pct >= 50 ? 'info' : 'warning'} size="sm">{pct}%</Badge>
                    </div>
                    <h4 className="text-lg font-medium text-[#111827]">{enquete.nom}</h4>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: getProgressColor(pct) }}>{valides}</p>
                    <p className="text-xs text-[#9CA3AF]">/ {aff.objectif_total}</p>
                  </div>
                </div>
                <ProgressBar value={valides} max={aff.objectif_total} size="md" />

                {aff.completions_pays?.filter(cp => cp.completions > 0).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
                    <p className="text-xs font-semibold text-[#6B7280] mb-2">Par pays</p>
                    <div className="grid grid-cols-3 gap-2">
                      {aff.completions_pays.filter(cp => cp.completions > 0).sort((a, b) => b.completions - a.completions).slice(0, 6).map((cp, i) => {
                        const pays = cp.pays || {}
                        const cpPct = cp.objectif > 0 ? Math.round((cp.completions / cp.objectif) * 100) : 0
                        return (
                          <div key={i} className={`p-2 rounded-lg text-xs ${cpPct >= 100 ? 'bg-[#ECFDF5]' : 'bg-[#F9FAFB]'}`}>
                            <div className="flex justify-between mb-1">
                              <span className="font-medium text-[#374151]">{pays.nom}</span>
                              <span style={{ color: getProgressColor(cpPct) }}>{cpPct}%</span>
                            </div>
                            <div className="h-1 bg-[#E5E7EB] rounded-full">
                              <div className="h-full rounded-full bg-[#059669]" style={{ width: `${Math.min(cpPct, 100)}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
        {affectations.length === 0 && <div className="text-center py-12 text-[#9CA3AF]">Aucune enquete assignee</div>}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MODALS
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteModal({ enquete, onClose, onSave }) {
  const isEditing = !!enquete

  // Pour creation: survey_id, cible, description, taille_echantillon
  // Pour edition: nom, description, cible, statut, taille_echantillon (+ survey_id si manquant)
  const [form, setForm] = useState({
    survey_id: enquete?.survey_id || '',
    nom: enquete?.nom || '',
    description: enquete?.description || '',
    cible: enquete?.cible || '',
    statut: enquete?.statut || 'en_cours',
    taille_echantillon: enquete?.taille_echantillon || 0,
  })
  const missingSurveyId = isEditing && !enquete?.survey_id
  const [surveyInfo, setSurveyInfo] = useState(null)
  const [loadingSurvey, setLoadingSurvey] = useState(false)
  const [surveyError, setSurveyError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleVerifySurvey() {
    if (!form.survey_id) return
    setLoadingSurvey(true)
    setSurveyError('')
    setSurveyInfo(null)
    try {
      const info = await getSurveyInfo(form.survey_id)
      setSurveyInfo(info)
    } catch (err) {
      setSurveyError('Survey introuvable sur QuestionPro')
    } finally {
      setLoadingSurvey(false)
    }
  }

  async function handleSubmit() {
    if (isEditing) {
      // Mode edition
      if (!form.cible) return alert('La cible est obligatoire')
      // Si survey_id manquant, verifier qu'il a ete configure
      if (missingSurveyId && (!form.survey_id || !surveyInfo)) {
        return alert('Veuillez configurer et verifier le Survey ID')
      }
      setSaving(true)
      try {
        const payload = {
          description: form.description,
          cible: form.cible,
          statut: form.statut,
          taille_echantillon: form.taille_echantillon
        }
        if (missingSurveyId && form.survey_id) {
          payload.survey_id = form.survey_id
        }
        await onSave(payload)
      } finally { setSaving(false) }
    } else {
      // Mode creation
      if (!form.survey_id || !surveyInfo) return alert('Verifiez d\'abord le Survey ID')
      if (!form.cible) return alert('La cible est obligatoire')
      setSaving(true)
      try {
        await onSave({
          survey_id: form.survey_id,
          description: form.description,
          cible: form.cible,
          taille_echantillon: form.taille_echantillon
        })
      } finally { setSaving(false) }
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={isEditing ? 'Modifier l\'enquete' : 'Nouvelle enquete'}>
      <div className="space-y-4">
        {!isEditing ? (
          <>
            {/* Mode creation: Survey ID */}
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">Survey ID QuestionPro *</label>
              <div className="flex gap-2">
                <input
                  value={form.survey_id}
                  onChange={e => { setForm(f => ({ ...f, survey_id: e.target.value })); setSurveyInfo(null); setSurveyError('') }}
                  placeholder="13445449"
                  className="flex-1 bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
                />
                <Button variant="secondary" onClick={handleVerifySurvey} loading={loadingSurvey}>
                  Verifier
                </Button>
              </div>
              {surveyError && (
                <p className="mt-2 text-xs text-[#DC2626]">{surveyError}</p>
              )}
              {surveyInfo && (
                <div className="mt-2 p-3 bg-[#ECFDF5] rounded-lg">
                  <p className="text-sm font-medium text-[#059669]">{surveyInfo.name}</p>
                  <p className="text-xs text-[#6B7280] mt-1">
                    {surveyInfo.completions} completions • {surveyInfo.started} demarrees • {surveyInfo.clics} vues
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Mode edition: Survey ID si manquant */}
            {missingSurveyId && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                <p className="text-xs text-amber-700 mb-2">Cette enquete n'a pas de Survey ID configure. Veuillez l'ajouter pour pouvoir creer des affectations.</p>
                <div className="flex gap-2">
                  <input
                    value={form.survey_id}
                    onChange={e => { setForm(f => ({ ...f, survey_id: e.target.value })); setSurveyInfo(null); setSurveyError('') }}
                    placeholder="13445449"
                    className="flex-1 bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
                  />
                  <Button variant="secondary" onClick={handleVerifySurvey} loading={loadingSurvey}>
                    Verifier
                  </Button>
                </div>
                {surveyError && <p className="mt-2 text-xs text-[#DC2626]">{surveyError}</p>}
                {surveyInfo && (
                  <div className="mt-2 p-2 bg-[#ECFDF5] rounded-lg">
                    <p className="text-sm font-medium text-[#059669]">{surveyInfo.name}</p>
                  </div>
                )}
              </div>
            )}
            {/* Mode edition: Nom (lecture seule) et Statut */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Nom</label>
                <input
                  value={form.nom}
                  disabled
                  className="w-full bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm text-[#6B7280]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Statut</label>
                <select
                  value={form.statut}
                  onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}
                  className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
                >
                  <option value="brouillon">Brouillon</option>
                  <option value="en_cours">En cours</option>
                  <option value="termine">Termine</option>
                  <option value="archive">Archive</option>
                </select>
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Cible *</label>
            <input
              value={form.cible}
              onChange={e => setForm(f => ({ ...f, cible: e.target.value }))}
              placeholder="Ex: Jeunes 18-35 ans"
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Taille echantillon</label>
            <input
              type="number"
              value={form.taille_echantillon}
              onChange={e => setForm(f => ({ ...f, taille_echantillon: parseInt(e.target.value) || 0 }))}
              placeholder="1500"
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Description</label>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="Description de l'enquete (optionnel)..."
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] resize-none"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={saving}
          fullWidth
          disabled={!isEditing && !surveyInfo}
        >
          {isEditing ? 'Modifier' : 'Creer'}
        </Button>
      </div>
    </Modal>
  )
}

function EnqueteurModal({ enqueteur, onClose, onSave, isSuperAdmin, currentUserId, onRoleChange }) {
  const [form, setForm] = useState({
    identifiant: enqueteur?.identifiant || '',
    nom: enqueteur?.nom || '',
    prenom: enqueteur?.prenom || '',
    email: enqueteur?.email || '',
    telephone: enqueteur?.telephone || '',
    reseau_mobile: enqueteur?.reseau_mobile || 'wave',
    mode_remuneration: enqueteur?.mode_remuneration || 'virement',
    mot_de_passe: enqueteur?.mot_de_passe || '1234',
    actif: enqueteur?.actif !== false,
  })
  const [role, setRole] = useState(enqueteur?.role || 'enqueteur')
  const [saving, setSaving] = useState(false)
  const [changingRole, setChangingRole] = useState(false)

  const canChangeRole = isSuperAdmin && enqueteur && enqueteur.id !== currentUserId && enqueteur.role !== 'super_admin'

  async function handleRoleChange(newRole) {
    if (!onRoleChange || newRole === role) return
    setChangingRole(true)
    try {
      await onRoleChange(newRole)
      setRole(newRole)
    } finally {
      setChangingRole(false)
    }
  }

  async function handleSubmit() {
    if (!form.identifiant || !form.nom || !form.prenom) return alert('Remplissez tous les champs obligatoires')
    setSaving(true)
    try {
      await onSave(form)
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={enqueteur ? 'Modifier l\'enqueteur' : 'Nouvel enqueteur'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Identifiant *</label>
            <input
              value={form.identifiant}
              onChange={e => setForm(f => ({ ...f, identifiant: e.target.value.toUpperCase() }))}
              placeholder="ACQ1, GENZ2..."
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Mot de passe</label>
            <input
              value={form.mot_de_passe}
              onChange={e => setForm(f => ({ ...f, mot_de_passe: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Prenom *</label>
            <input
              value={form.prenom}
              onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Nom *</label>
            <input
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="email@exemple.com"
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Telephone</label>
            <input
              value={form.telephone}
              onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Reseau mobile</label>
            <select
              value={form.reseau_mobile}
              onChange={e => setForm(f => ({ ...f, reseau_mobile: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            >
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="free_money">Free Money</option>
              <option value="autre">Autre</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Mode remuneration</label>
            <select
              value={form.mode_remuneration}
              onChange={e => setForm(f => ({ ...f, mode_remuneration: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            >
              <option value="virement">Virement</option>
              <option value="espece">Espece</option>
              <option value="espece_virement">Espece + Virement</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))}
                className="w-4 h-4 rounded border-[#D1D5DB] text-[#059669] focus:ring-[#059669]"
              />
              <span className="text-sm text-[#374151]">Actif</span>
            </label>
          </div>
        </div>
        {canChangeRole && (
          <div className="pt-4 border-t border-[#E5E7EB]">
            <label className="block text-xs font-medium text-[#374151] mb-1.5">
              Role utilisateur
              {changingRole && <span className="ml-2 text-[#9CA3AF]">(enregistrement...)</span>}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleRoleChange('enqueteur')}
                disabled={changingRole}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  role === 'enqueteur'
                    ? 'bg-[#059669] text-white'
                    : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
                }`}
              >
                Enqueteur
              </button>
              <button
                type="button"
                onClick={() => handleRoleChange('admin')}
                disabled={changingRole}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  role === 'admin'
                    ? 'bg-[#2563EB] text-white'
                    : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB]'
                }`}
              >
                Admin
              </button>
            </div>
            <p className="mt-2 text-xs text-[#9CA3AF]">
              Les admins peuvent gerer les enquetes et affectations mais ne peuvent pas supprimer ni gerer les roles.
            </p>
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>
          {enqueteur ? 'Modifier' : 'Creer'}
        </Button>
      </div>
    </Modal>
  )
}

function AffectationModal({ enquete, enqueteurs, onClose, onSave }) {
  const [form, setForm] = useState({
    enquete_id: enquete.id,
    enqueteur_id: '',
    objectif_total: 200,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!form.enqueteur_id) {
      return setError('Veuillez selectionner un enqueteur')
    }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de la creation')
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Nouvelle affectation">
      <p className="text-sm text-[#6B7280] mb-4">
        Enquete: <span className="font-medium text-[#111827]">{enquete.nom}</span>
      </p>
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Enqueteur *</label>
          <select
            value={form.enqueteur_id}
            onChange={e => setForm(f => ({ ...f, enqueteur_id: e.target.value }))}
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
          >
            <option value="">Selectionner un enqueteur</option>
            {enqueteurs.map(e => (
              <option key={e.id} value={e.id}>{e.identifiant} - {e.prenom} {e.nom}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Objectif total</label>
          <input
            type="number"
            value={form.objectif_total}
            onChange={e => setForm(f => ({ ...f, objectif_total: parseInt(e.target.value) || 0 }))}
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
          />
          <p className="mt-1 text-xs text-[#9CA3AF]">Le lien sera genere automatiquement</p>
        </div>
      </div>
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>Affecter</Button>
      </div>
    </Modal>
  )
}

function EditAffectationModal({ affectation, onClose, onSave }) {
  const [form, setForm] = useState({
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
    <Modal isOpen={true} onClose={onClose} title={`${enqr.prenom} ${enqr.nom}`}>
      <p className="text-xs font-mono text-[#6B7280] mb-4 px-2 py-1 bg-[#F3F4F6] rounded inline-block">{enqr.identifiant}</p>

      {/* Affichage du lien */}
      {affectation.lien_questionnaire && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs font-medium text-emerald-700 mb-1">Lien questionnaire</p>
          <a href={affectation.lien_questionnaire} target="_blank" rel="noopener noreferrer"
             className="text-xs text-emerald-600 hover:underline break-all">
            {affectation.lien_questionnaire}
          </a>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Objectif total</label>
          <input
            type="number"
            value={form.objectif_total}
            onChange={e => setForm(f => ({ ...f, objectif_total: parseInt(e.target.value) || 0 }))}
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Statut</label>
          <div className="flex gap-2">
            {STATUTS.map(s => (
              <button
                key={s.value}
                onClick={() => setForm(f => ({ ...f, statut: s.value }))}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  form.statut === s.value ? 'ring-2 ring-[#059669] bg-[#ECFDF5] text-[#059669]' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                }`}
              >{s.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Message pour l'enqueteur</label>
          <textarea
            value={form.commentaire_admin}
            onChange={e => setForm(f => ({ ...f, commentaire_admin: e.target.value }))}
            rows={3}
            placeholder="Message visible par l'enqueteur..."
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669] resize-none"
          />
        </div>
      </div>
      <div className="flex gap-3 mt-6 pt-4 border-t border-[#E5E7EB]">
        <Button variant="secondary" onClick={onClose} fullWidth>Annuler</Button>
        <Button variant="primary" onClick={handleSubmit} loading={saving} fullWidth>Enregistrer</Button>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ADMIN PROFIL VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function AdminProfilView({ user, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState({
    nom: user?.nom || '',
    prenom: user?.prenom || '',
    email: user?.email || '',
    telephone: user?.telephone || '',
  })

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

      if (result.user && onUpdate) {
        onUpdate(result.user)
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
      nom: user?.nom || '',
      prenom: user?.prenom || '',
      email: user?.email || '',
      telephone: user?.telephone || '',
    })
    setError('')
  }

  if (!user) return null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Mon profil</h1>
          <p className="text-sm text-[#6B7280]">Gerez vos informations personnelles</p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)} variant="secondary" size="sm">
            <EditIcon />
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

      <Card className="p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={`${user.prenom} ${user.nom}`} size="lg" />
          <div>
            <h2 className="text-xl font-semibold text-[#111827]">{user.prenom} {user.nom}</h2>
            <p className="text-sm font-mono text-[#6B7280]">{user.identifiant || user.email}</p>
            <Badge variant="info" size="sm" className="mt-2">Administrateur</Badge>
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
              <p className="text-sm font-medium text-[#111827]">{user.email || '---'}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Telephone</p>
                <p className="text-sm font-medium text-[#111827]">{user.telephone || '---'}</p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280] mb-1">Role</p>
                <p className="text-sm font-medium text-[#111827]">Administrateur</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Modal OTP */}
      <Modal isOpen={showOtpModal} onClose={() => { setShowOtpModal(false); setOtpCode(''); setError(''); }} title="Verification requise">
        <div className="space-y-4">
          <p className="text-sm text-[#6B7280]">
            Un code de verification a ete envoye a votre adresse email <strong>{user.email}</strong>.
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
