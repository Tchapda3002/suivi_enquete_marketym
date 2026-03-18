import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getDashboard,
  listEnquetes,
  listEnqueteurs,
  listAffectations,
  listAffectationsByEnquete,
  updateAffectation,
  syncAll,
  migrateLinks,
  getEnqueteur,
  getEnqueteurSegmentations,
  getHistoriqueEnqueteur,
  createEnquete,
  updateEnquete,
  deleteEnquete,
  createEnqueteur,
  updateEnqueteur,
  deleteEnqueteur,
  migrateIdentifiants,
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
  getQuotaConfigsByEnquete,
  createQuotaConfig,
  deleteQuotaConfig,
  generateCombinations,
  getSegmentationsStats,
  getHistoriqueGlobal,
  getHistoriqueEnquete,
  authRequestProfileOTP,
  authUpdateProfile,
  updateEnqueteurRole,
  getDemandesAdmin,
  accepterDemande,
  refuserDemande,
} from '../lib/api'
import { Card, Badge, Button, Modal, Input, Avatar, Spinner, LineChart, CopyButton } from '../components/ui'

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
  const [allAffectations, setAllAffectations] = useState([])
  const [selectedEnquete, setSelectedEnquete] = useState(null)
  const [selectedEnqueteur, setSelectedEnqueteur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [adminUser, setAdminUser] = useState(null)
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date().toISOString().split('T')[0]
    return {
      from_date: today,
      to_date: today,
      preset: '1j'
    }
  })

  // Mes enquetes (affectations personnelles de l'admin)
  const [adminAffectations, setAdminAffectations] = useState([])
  const [selectedMyEnquete, setSelectedMyEnquete] = useState(null)
  const [adminSegmentations, setAdminSegmentations] = useState([])
  const [adminHistorique, setAdminHistorique] = useState([])

  // Demandes d'affectation
  const [demandes, setDemandes] = useState([])

  // Mobile sidebar
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    loadAll(user.id)
  }, [nav])

  async function loadAll(adminId, range) {
    setLoading(true)
    const dr = range || dateRange
    try {
      const userId = adminId || adminUser?.id
      // Charger les données principales
      const [d, e, enq, segStats, hist, affs, dem] = await Promise.all([
        getDashboard(),
        listEnquetes(),
        listEnqueteurs(),
        getSegmentationsStats(),
        getHistoriqueGlobal({ from_date: dr.from_date, to_date: dr.to_date }),
        listAffectations(),
        getDemandesAdmin()
      ])
      setDashboard(d)
      setEnquetes(e)
      setEnqueteurs(enq)
      setSegmentationsStats(segStats)
      setHistorique(hist || [])
      setAllAffectations(affs || [])
      setDemandes(dem || [])

      // Charger les données "Mes enquetes" separement (pour ne pas bloquer si erreur)
      if (userId) {
        try {
          const [adminData, adminSegs, adminHist] = await Promise.all([
            getEnqueteur(userId),
            getEnqueteurSegmentations(userId),
            getHistoriqueEnqueteur(userId, { from_date: dr.from_date, to_date: dr.to_date })
          ])
          setAdminAffectations(adminData?.affectations || [])
          setAdminSegmentations(adminSegs || [])
          setAdminHistorique(adminHist || [])
        } catch (err) {
          console.error('Erreur chargement Mes enquetes:', err)
          setAdminAffectations([])
          setAdminSegmentations([])
          setAdminHistorique([])
        }
      }
    } catch (err) {
      console.error('Erreur chargement dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  async function reloadHistorique(range) {
    const dr = range || dateRange
    const userId = adminUser?.id
    try {
      const [hist, adminHist] = await Promise.all([
        getHistoriqueGlobal({ from_date: dr.from_date, to_date: dr.to_date }),
        userId ? getHistoriqueEnqueteur(userId, { from_date: dr.from_date, to_date: dr.to_date }) : Promise.resolve([])
      ])
      setHistorique(hist || [])
      setAdminHistorique(adminHist || [])
    } catch (err) {
      console.error('Erreur rechargement historique:', err)
    }
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

  async function handleMigrateLinks() {
    if (!confirm('Migrer les liens de toutes les affectations ? (corrige http → https)')) return
    try {
      const res = await migrateLinks()
      alert(`Migration terminee : ${res.updated || 0} affectations mises a jour`)
      await loadAll()
    } catch (err) {
      alert('Erreur lors de la migration')
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
    <div className="h-screen flex overflow-hidden bg-[#F9FAFB]">
      {/* Backdrop mobile */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 md:relative md:z-auto
        flex-shrink-0 flex flex-col border-r border-[#E5E7EB] bg-white
        transition-all duration-200 h-full overflow-y-auto
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${sidebarCollapsed ? 'md:w-[68px] w-[260px]' : 'w-[260px]'}
      `}>
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
                <p className="text-[10px] text-[#9CA3AF]">Questionnaires complétés</p>
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
            onClick={() => { setView('dashboard'); setMobileMenuOpen(false) }}
          />

          <NavButton
            icon={<ClipboardIcon />}
            label="Enquetes"
            active={view === 'enquetes'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('enquetes'); setSelectedEnquete(null); setMobileMenuOpen(false) }}
            badge={enquetes.length}
          />

          <NavButton
            icon={<UsersIcon />}
            label="Enqueteurs"
            active={view === 'enqueteurs'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('enqueteurs'); setSelectedEnqueteur(null); setMobileMenuOpen(false) }}
            badge={enqueteurs.length}
          />

          <NavButton
            icon={<MyEnquetesIcon />}
            label="Mes enquetes"
            active={view === 'mes_enquetes'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('mes_enquetes'); setSelectedMyEnquete(null); setMobileMenuOpen(false) }}
            badge={adminAffectations.length > 0 ? adminAffectations.length : undefined}
          />

          <NavButton
            icon={<BellIcon />}
            label="Demandes"
            active={view === 'demandes'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('demandes'); setMobileMenuOpen(false) }}
            badge={demandes.filter(d => d.statut === 'en_attente').length || undefined}
          />

          <NavButton
            icon={<UserIcon />}
            label="Mon profil"
            active={view === 'profil'}
            collapsed={sidebarCollapsed}
            onClick={() => { setView('profil'); setMobileMenuOpen(false) }}
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
            onClick={handleMigrateLinks}
            title="Corriger les liens de collecte (http → https)"
            className="w-full p-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            {!sidebarCollapsed && <span className="text-xs font-medium">Migrer les liens</span>}
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
      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Barre mobile */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-[#E5E7EB] sticky top-0 z-30">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 rounded-lg hover:bg-[#F3F4F6] transition-colors"
          >
            <svg className="w-5 h-5 text-[#374151]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#059669] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M3 3v18h18"/><path d="M18 9l-5 5-4-4-3 3"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-[#111827]">Marketym Admin</span>
          </div>
          {demandes.filter(d => d.statut === 'en_attente').length > 0 && (
            <button
              onClick={() => { setView('demandes'); setMobileMenuOpen(false) }}
              className="ml-auto flex items-center gap-1 px-2 py-1 bg-[#FEF2F2] text-[#DC2626] rounded-full text-xs font-medium"
            >
              <span>{demandes.filter(d => d.statut === 'en_attente').length}</span>
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
          )}
        </div>

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
            segmentationsStats={segmentationsStats}
            historique={historique}
            dateRange={dateRange}
            onDateRangeChange={(range) => {
              setDateRange(range)
              reloadHistorique(range)
            }}
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
        ) : view === 'mes_enquetes' ? (
          selectedMyEnquete ? (
            <MyEnqueteDetailView
              affectation={selectedMyEnquete}
              onBack={() => setSelectedMyEnquete(null)}
            />
          ) : (
            <MesEnquetesView
              affectations={adminAffectations}
              segmentations={adminSegmentations}
              historique={adminHistorique}
              onSelect={setSelectedMyEnquete}
            />
          )
        ) : view === 'demandes' ? (
          <DemandesView
            demandes={demandes}
            onAccepter={async (id, commentaire, objectif) => {
              await accepterDemande(id, commentaire, objectif)
              const updated = await getDemandesAdmin()
              setDemandes(updated || [])
              await loadAll()
            }}
            onRefuser={async (id, commentaire) => {
              await refuserDemande(id, commentaire)
              const updated = await getDemandesAdmin()
              setDemandes(updated || [])
            }}
          />
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

function MyEnquetesIcon() {
  return (
    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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

function BellIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
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
   SORTABLE TABLE
   ══════════════════════════════════════════════════════════════════════════════ */

function useSortable(defaultKey = null, defaultDir = 'desc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function sorted(data, getters) {
    if (!sortKey || !getters[sortKey]) return data
    return [...data].sort((a, b) => {
      const va = getters[sortKey](a)
      const vb = getters[sortKey](b)
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }

  return { sortKey, sortDir, toggleSort, sorted }
}

function SortableHeader({ label, k, sortKey, sortDir, onSort, align = 'left', className = '' }) {
  const active = sortKey === k
  return (
    <th
      onClick={() => onSort(k)}
      className={`px-4 py-3 text-[10px] font-semibold text-[#6B7280] uppercase cursor-pointer select-none hover:text-[#111827] transition-colors ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col gap-[1px]">
          <svg width="7" height="5" viewBox="0 0 7 5" fill={active && sortDir === 'asc' ? '#059669' : '#D1D5DB'}>
            <path d="M3.5 0L7 5H0L3.5 0Z"/>
          </svg>
          <svg width="7" height="5" viewBox="0 0 7 5" fill={active && sortDir === 'desc' ? '#059669' : '#D1D5DB'}>
            <path d="M3.5 5L0 0H7L3.5 5Z"/>
          </svg>
        </span>
      </span>
    </th>
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
   DATE RANGE PICKER
   ══════════════════════════════════════════════════════════════════════════════ */

const DATE_PRESETS = [
  { label: '1j',  days: 0 },
  { label: '7j',  days: 6 },
  { label: '30j', days: 29 },
  { label: '90j', days: 89 },
  { label: 'Cette année', days: null, yearStart: true },
]

function computePresetRange(preset) {
  const today = new Date()
  const to = today.toISOString().split('T')[0]
  if (preset.yearStart) {
    return { from_date: `${today.getFullYear()}-01-01`, to_date: to, preset: 'Cette année' }
  }
  const from = new Date(today)
  from.setDate(from.getDate() - preset.days)
  return { from_date: from.toISOString().split('T')[0], to_date: to, preset: preset.label }
}

function DateRangePicker({ value, onChange }) {
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState(value?.from_date || '')
  const [customTo, setCustomTo] = useState(value?.to_date || '')

  function applyPreset(preset) {
    setShowCustom(false)
    onChange(computePresetRange(preset))
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    onChange({ from_date: customFrom, to_date: customTo, preset: 'custom' })
    setShowCustom(false)
  }

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {DATE_PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => applyPreset(p)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            value?.preset === p.label
              ? 'bg-[#111827] text-white'
              : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(v => !v)}
        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
          value?.preset === 'custom'
            ? 'bg-[#111827] text-white'
            : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
        }`}
      >
        Perso
      </button>
      {showCustom && (
        <div className="flex items-center gap-1 ml-1">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="text-xs border border-[#E5E7EB] rounded px-1 py-0.5"
          />
          <span className="text-xs text-[#6B7280]">→</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="text-xs border border-[#E5E7EB] rounded px-1 py-0.5"
          />
          <button
            onClick={applyCustom}
            className="px-2 py-0.5 rounded text-xs font-medium bg-[#059669] text-white hover:bg-[#047857]"
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   DASHBOARD VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function DashboardView({ dashboard, enquetes, enqueteurs, allAffectations, segmentationsStats, historique, dateRange, onDateRangeChange }) {
  const [statutFilter, setStatutFilter] = useState('all')
  const [selectedSegEnquete, setSelectedSegEnquete] = useState(null)
  const topSort = useSortable('valides', 'desc')

  // Filtre multi-enquetes
  const [selectedEnqueteIds, setSelectedEnqueteIds] = useState([])
  const [showEnqueteFilter, setShowEnqueteFilter] = useState(false)
  const [filteredHistorique, setFilteredHistorique] = useState(null)

  function toggleEnquete(id) {
    setSelectedEnqueteIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  useEffect(() => {
    if (selectedEnqueteIds.length === 0) {
      setFilteredHistorique(null)
      return
    }
    Promise.all(
      selectedEnqueteIds.map(id =>
        getHistoriqueEnquete(id, { from_date: dateRange?.from_date, to_date: dateRange?.to_date })
      )
    ).then(results => {
      const combined = {}
      results.flat().forEach(d => {
        if (!combined[d.date]) combined[d.date] = { date: d.date, completions: 0 }
        combined[d.date].completions += d.completions || 0
      })
      setFilteredHistorique(Object.values(combined).sort((a, b) => a.date.localeCompare(b.date)))
    }).catch(() => setFilteredHistorique(null))
  }, [selectedEnqueteIds, dateRange])

  const displayHistorique = filteredHistorique !== null ? filteredHistorique : historique

  // Filtrer les enquetes par statut ET par selection
  const filteredEnquetes = useMemo(() => {
    let base = selectedEnqueteIds.length > 0 ? enquetes.filter(e => selectedEnqueteIds.includes(e.id)) : enquetes
    if (statutFilter === 'all') return base
    return base.filter(e => e.statut === statutFilter)
  }, [enquetes, statutFilter, selectedEnqueteIds])

  const enquetesStats = filteredEnquetes.map(e => ({
    ...e,
    valides: e.total_valides ?? e.total_completions ?? 0,
    pct: e.total_objectif > 0 ? Math.round(((e.total_valides ?? e.total_completions ?? 0) / e.total_objectif) * 100) : 0,
    tauxConversion: e.total_clics > 0 ? Math.min(100, Math.round(((e.total_valides ?? e.total_completions ?? 0) / e.total_clics) * 100)) : 0
  })).sort((a, b) => (b.valides || 0) - (a.valides || 0))  // Tri par completions valides décroissantes

  // Stats filtrees
  const filteredTotalObjectif = filteredEnquetes.reduce((sum, e) => sum + (e.taille_echantillon || e.total_objectif || 0), 0)
  const filteredTotalValides = filteredEnquetes.reduce((sum, e) => sum + (e.total_valides ?? e.total_completions ?? 0), 0)
  const filteredTotalClics = filteredEnquetes.reduce((sum, e) => sum + (e.total_clics || 0), 0)
  const filteredPct = filteredTotalObjectif > 0 ? Math.round((filteredTotalValides / filteredTotalObjectif) * 100) : 0
  const filteredTauxConversion = filteredTotalClics > 0 ? Math.min(100, Math.round((filteredTotalValides / filteredTotalClics) * 100)) : 0

  // Taux de conversion global
  const tauxConversionGlobal = (dashboard?.total_clics || 0) > 0
    ? Math.min(100, Math.round(((dashboard?.total_valides || 0) / (dashboard?.total_clics || 1)) * 100))
    : 0

  return (
    <div className="p-6 animate-fadeIn max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Tableau de bord</h1>
          <p className="text-sm text-[#6B7280]">Vue d'ensemble de toutes les enquetes</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filtre multi-enquetes */}
          <div className="relative">
            <button
              onClick={() => setShowEnqueteFilter(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                selectedEnqueteIds.length > 0
                  ? 'bg-[#059669] text-white border-[#059669]'
                  : 'bg-white text-[#374151] border-[#E5E7EB] hover:bg-[#F9FAFB]'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M7 12h10M11 18h2"/></svg>
              {selectedEnqueteIds.length === 0 ? 'Toutes les enquetes' : `${selectedEnqueteIds.length} enquete${selectedEnqueteIds.length > 1 ? 's' : ''}`}
              <svg className={`w-3 h-3 transition-transform ${showEnqueteFilter ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {showEnqueteFilter && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-[#E5E7EB] z-50 py-1">
                <div className="px-3 py-2 border-b border-[#E5E7EB] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#6B7280] uppercase">Filtrer par enquete</span>
                  {selectedEnqueteIds.length > 0 && (
                    <button onClick={() => setSelectedEnqueteIds([])} className="text-xs text-[#059669] hover:underline">Tout effacer</button>
                  )}
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {enquetes.map(e => (
                    <label key={e.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#F9FAFB] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEnqueteIds.includes(e.id)}
                        onChange={() => toggleEnquete(e.id)}
                        className="w-4 h-4 rounded accent-[#059669]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#111827] truncate">{e.nom}</p>
                        <p className="text-xs text-[#9CA3AF]">{e.code}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
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
      </div>

      {/* KPIs - adaptes au filtre */}
      {statutFilter === 'all' && selectedEnqueteIds.length === 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard label="Questionnaires complétés" value={dashboard?.total_valides || 0} icon={<CheckIcon />} color="#059669" bgColor="#ECFDF5" />
          <KPICard label="Echantillon" value={dashboard?.total_objectif || 0} icon={<TargetIcon />} color="#2563EB" bgColor="#EFF6FF" />
          <KPICard label="Conversion" value={`${tauxConversionGlobal}%`} icon={<ChartIcon />} color="#7C3AED" bgColor="#F5F3FF" />
          <KPICard label="Clics" value={dashboard?.total_clics || 0} icon={<ClickIcon />} color="#D97706" bgColor="#FFFBEB" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <KPICard label="Enquetes" value={filteredEnquetes.length} icon={<ClipboardIcon />} color="#2563EB" bgColor="#EFF6FF" />
          <KPICard label="Questionnaires complétés" value={filteredTotalValides} icon={<CheckIcon />} color="#059669" bgColor="#ECFDF5" />
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
              {(statutFilter === 'all' && selectedEnqueteIds.length === 0) ? (dashboard?.taux_completion || 0) : filteredPct}%
            </span>
          </div>
          <ProgressBar
            value={(statutFilter === 'all' && selectedEnqueteIds.length === 0) ? (dashboard?.total_valides || 0) : filteredTotalValides}
            max={(statutFilter === 'all' && selectedEnqueteIds.length === 0) ? (dashboard?.total_objectif || 1) : (filteredTotalObjectif || 1)}
            size="lg"
          />
          <div className="flex justify-between mt-2 text-xs">
            <span className="text-[#059669] font-medium">
              {(statutFilter === 'all' && selectedEnqueteIds.length === 0) ? (dashboard?.total_valides || 0) : filteredTotalValides} completions
            </span>
            <span className="text-[#6B7280]">
              Echantillon: {(statutFilter === 'all' && selectedEnqueteIds.length === 0) ? (dashboard?.total_objectif || 0) : filteredTotalObjectif}
            </span>
          </div>
        </Card>

        {/* Evolution */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-[#111827]">Evolution</h3>
            <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
          </div>
          <div className="flex flex-col items-center justify-center py-4">
            <p className="text-5xl font-bold text-[#059669]">
              {displayHistorique.reduce((sum, d) => sum + (d.completions || 0), 0)}
            </p>
            <p className="text-sm text-[#6B7280] mt-2">questionnaires complétés</p>
            <p className="text-xs text-[#9CA3AF] mt-1">
              {dateRange?.from_date} → {dateRange?.to_date}
            </p>
          </div>
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
              {segmentationsStats.filter(s => selectedEnqueteIds.length === 0 || selectedEnqueteIds.includes(s.enquete_id)).map(enqSeg => (
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
                .filter(s => s.enquete_id === selectedSegEnquete && (selectedEnqueteIds.length === 0 || selectedEnqueteIds.includes(s.enquete_id)))
                .map(enqSeg => (
                  <div key={enqSeg.enquete_id}>
                    {enqSeg.segmentations.map(seg => (
                      <div key={seg.id} className="mb-4">
                        <p className="text-sm font-medium text-[#374151] mb-2">{seg.nom}</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {seg.quotas.slice(0, 8).map(q => {
                            const pct = q.objectif > 0 ? Math.round(((q.valides || 0) / q.objectif) * 100) : 0
                            return (
                            <div key={q.id} className="p-2 bg-[#F9FAFB] rounded-lg">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-[#374151] truncate">{q.segment_value}</span>
                                <span className="text-xs font-semibold" style={{ color: pct >= 100 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626' }}>{pct}%</span>
                              </div>
                              <p className="text-xs text-[#9CA3AF]">{q.valides || 0} / {q.objectif || 0}</p>
                            </div>
                          )})}

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
                <th className="text-left py-2 px-4 text-[10px] font-semibold text-[#6B7280] uppercase">#</th>
                <SortableHeader label="Enqueteur" k="nom" sortKey={topSort.sortKey} sortDir={topSort.sortDir} onSort={topSort.toggleSort} className="py-2" />
                <SortableHeader label="Questionnaires complétés" k="valides" sortKey={topSort.sortKey} sortDir={topSort.sortDir} onSort={topSort.toggleSort} align="center" className="py-2" />
                <SortableHeader label="Progression" k="pct" sortKey={topSort.sortKey} sortDir={topSort.sortDir} onSort={topSort.toggleSort} className="py-2" />
              </tr>
            </thead>
            <tbody>
              {topSort.sorted((() => {
                if (selectedEnqueteIds.length === 0) return enqueteurs
                const enqueteurIds = new Set(
                  allAffectations
                    .filter(a => selectedEnqueteIds.includes(a.enquete_id))
                    .map(a => a.enqueteur_id)
                )
                return enqueteurs.filter(e => enqueteurIds.has(e.id))
              })(), {
                nom: e => `${e.nom} ${e.prenom}`,
                valides: e => e.total_completions_valides ?? e.total_completions ?? 0,
                pct: e => e.total_objectif > 0 ? Math.round(((e.total_completions_valides ?? e.total_completions ?? 0) / e.total_objectif) * 100) : 0,
              }).slice(0, 5).map((enq, i) => {
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
  const affSort = useSortable('valides', 'desc')
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
            <p className="text-[10px] font-medium uppercase text-[#059669] opacity-70">Questionnaires complétés</p>
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
                      <SortableHeader label="Enqueteur" k="nom" sortKey={affSort.sortKey} sortDir={affSort.sortDir} onSort={affSort.toggleSort} />
                      <SortableHeader label="Clics" k="clics" sortKey={affSort.sortKey} sortDir={affSort.sortDir} onSort={affSort.toggleSort} align="center" />
                      <SortableHeader label="Questionnaires complétés" k="valides" sortKey={affSort.sortKey} sortDir={affSort.sortDir} onSort={affSort.toggleSort} align="center" />
                      <SortableHeader label="Progression" k="pct" sortKey={affSort.sortKey} sortDir={affSort.sortDir} onSort={affSort.toggleSort} />
                      <SortableHeader label="Statut" k="statut" sortKey={affSort.sortKey} sortDir={affSort.sortDir} onSort={affSort.toggleSort} align="center" />
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {affSort.sorted(affectations, {
                      nom: a => `${a.enqueteurs?.nom || ''} ${a.enqueteurs?.prenom || ''}`,
                      clics: a => a.clics || 0,
                      valides: a => a.completions_valides ?? a.completions_total ?? 0,
                      pct: a => Math.round(((a.completions_valides ?? a.completions_total ?? 0) / Math.max(a.objectif_total, 1)) * 100),
                      statut: a => a.statut || '',
                    }).map(a => {
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
  const [quotaConfigs, setQuotaConfigs] = useState([])
  const [showAddQuotaConfig, setShowAddQuotaConfig] = useState(false)

  useEffect(() => {
    if (enquete.id) loadQuotaConfigs()
  }, [enquete.id])

  async function loadQuotaConfigs() {
    try {
      const data = await getQuotaConfigsByEnquete(enquete.id)
      setQuotaConfigs(data)
    } catch (err) {
      console.error('Erreur chargement quota configs:', err)
    }
  }

  async function handleDeleteQuotaConfig(id) {
    if (!confirm('Supprimer ce quota croise et toutes ses combinaisons ?')) return
    await deleteQuotaConfig(id)
    loadQuotaConfigs()
  }

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
    // 1. Creer la segmentation avec answer_options
    const seg = await createSegmentation({
      enquete_id: enquete.id,
      question_id: data.question_id,
      question_text: data.question_text,
      nom: data.nom,
      answer_options: data.answer_options || [],
    })

    // 2. Creer les quotas si fournis
    if (data.quotas && data.quotas.length > 0) {
      await createQuotasBulk({
        enquete_id: enquete.id,
        segmentation_id: seg.id,
        quotas: data.quotas.map(q => ({
          segment_value: q.text,
          pourcentage: q.pourcentage
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

      {/* Section Quotas Croises */}
      {segmentations.length >= 2 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#111827]">Quotas croises</h3>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddQuotaConfig(true)}
            >
              <PlusIcon />
              <span className="ml-1">Nouveau croisement</span>
            </Button>
          </div>

          {quotaConfigs.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#9CA3AF]">
              Aucun quota croise. Croisez plusieurs segmentations (ex: Pays x Secteur).
            </div>
          ) : (
            <div className="space-y-4">
              {quotaConfigs.map(config => (
                <QuotaConfigCard
                  key={config.id}
                  config={config}
                  onDelete={() => handleDeleteQuotaConfig(config.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showAddQuotaConfig && (
        <AddQuotaConfigModal
          enquete={enquete}
          segmentations={segmentations}
          onClose={() => setShowAddQuotaConfig(false)}
          onSave={() => { loadQuotaConfigs(); setShowAddQuotaConfig(false) }}
        />
      )}
    </div>
  )
}

function QuotaConfigCard({ config, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const quotas = config.quotas || []
  const totalPct = quotas.reduce((s, q) => s + (q.pourcentage || 0), 0)
  const totalCompletions = quotas.reduce((s, q) => s + (q.completions || 0), 0)
  const totalObjectif = quotas.reduce((s, q) => s + (q.objectif || 0), 0)

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#F9FAFB]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${expanded ? 'bg-[#7C3AED] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
            <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#111827]">{config.nom}</p>
            <p className="text-xs text-[#6B7280]">
              {(config.questions || []).map(q => q.segmentations?.nom).join(' x ')} — {quotas.length} combinaisons
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-mono font-medium text-[#111827]">{totalCompletions}/{totalObjectif}</p>
            <p className="text-xs text-[#6B7280]">{Math.round(totalPct)}%</p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded hover:bg-[#FEF2F2] text-[#DC2626]"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[#E5E7EB] p-4 bg-[#F9FAFB]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB]">
                  {(config.questions || []).map(q => (
                    <th key={q.id} className="text-left py-2 px-3 text-xs font-medium text-[#6B7280]">
                      {q.segmentations?.nom}
                    </th>
                  ))}
                  <th className="text-right py-2 px-3 text-xs font-medium text-[#6B7280]">%</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[#6B7280]">Objectif</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[#6B7280]">Complétés</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-[#6B7280]">Progression</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map((q, i) => {
                  const combo = q.combination || {}
                  const pct = q.progression || 0
                  return (
                    <tr key={i} className="border-b border-[#F3F4F6] hover:bg-white">
                      {(config.questions || []).map(qq => (
                        <td key={qq.id} className="py-2 px-3 text-[#111827]">
                          {combo[qq.segmentations?.nom] || '-'}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono text-[#6B7280]">{q.pourcentage}%</td>
                      <td className="py-2 px-3 text-right font-mono text-[#111827]">{q.objectif}</td>
                      <td className="py-2 px-3 text-right font-mono text-[#059669]">{q.completions}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-xs font-semibold" style={{ color: pct >= 100 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626' }}>
                          {Math.round(pct)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}

function AddQuotaConfigModal({ enquete, segmentations, onClose, onSave }) {
  const [step, setStep] = useState(1) // 1: select segs, 2: set percentages
  const [nom, setNom] = useState('')
  const [selectedSegIds, setSelectedSegIds] = useState([])
  const [combinations, setCombinations] = useState([]) // [{combination: {}, pourcentage: 0}]
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const segsWithOptions = segmentations.filter(s => s.answer_options && s.answer_options.length > 0)
  const selectedSegs = segmentations.filter(s => selectedSegIds.includes(s.id))

  function toggleSeg(id) {
    setSelectedSegIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleGenerate() {
    if (selectedSegIds.length < 2) return alert('Selectionnez au moins 2 segmentations')
    if (!nom.trim()) {
      // Auto-generate name
      setNom(selectedSegs.map(s => s.nom).join(' x '))
    }

    setGenerating(true)
    try {
      // Generate combinations locally from answer_options
      const axes = selectedSegs.map(s => ({
        nom: s.nom,
        values: (s.answer_options || []).map(o => o.text || o.value || o.label || String(o))
      }))

      // Cartesian product
      let combos = [{}]
      for (const axis of axes) {
        const newCombos = []
        for (const existing of combos) {
          for (const val of axis.values) {
            newCombos.push({ ...existing, [axis.nom]: val })
          }
        }
        combos = newCombos
      }

      setCombinations(combos.map(c => ({ combination: c, pourcentage: 0 })))
      setStep(2)
    } catch (err) {
      console.error('Erreur generation:', err)
      alert('Erreur lors de la generation des combinaisons')
    } finally {
      setGenerating(false)
    }
  }

  function updatePourcentage(index, value) {
    setCombinations(prev => prev.map((c, i) => i === index ? { ...c, pourcentage: parseFloat(value) || 0 } : c))
  }

  function distribuerEquitablement() {
    if (combinations.length === 0) return
    const pct = Math.round((100 / combinations.length) * 100) / 100
    const reste = Math.round((100 - pct * (combinations.length - 1)) * 100) / 100
    setCombinations(prev => prev.map((c, i) => ({
      ...c,
      pourcentage: i === prev.length - 1 ? reste : pct
    })))
  }

  const totalPct = combinations.reduce((s, c) => s + (c.pourcentage || 0), 0)

  async function handleSave() {
    const finalNom = nom.trim() || selectedSegs.map(s => s.nom).join(' x ')
    const quotasToCreate = combinations.filter(c => c.pourcentage > 0)
    if (quotasToCreate.length === 0) return alert('Definissez au moins un pourcentage')

    setSaving(true)
    try {
      await createQuotaConfig({
        enquete_id: enquete.id,
        nom: finalNom,
        segmentation_ids: selectedSegIds,
        quotas: quotasToCreate
      })
      onSave()
    } catch (err) {
      console.error('Erreur creation quota config:', err)
      alert('Erreur: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Nouveau quota croise" size="lg">
      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Nom du croisement</label>
            <Input
              value={nom}
              onChange={e => setNom(e.target.value)}
              placeholder="Ex: Pays x Secteur (auto-genere si vide)"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-2">
              Segmentations a croiser (min. 2)
            </label>
            {segsWithOptions.length < 2 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                Il faut au moins 2 segmentations avec des options de reponse pour creer un croisement.
                Verifiez que vos segmentations ont des answer_options sauvegardees.
              </div>
            ) : (
              <div className="space-y-2">
                {segsWithOptions.map(seg => (
                  <label
                    key={seg.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedSegIds.includes(seg.id)
                        ? 'border-[#7C3AED] bg-[#F5F3FF]'
                        : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSegIds.includes(seg.id)}
                      onChange={() => toggleSeg(seg.id)}
                      className="accent-[#7C3AED]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#111827]">{seg.nom}</p>
                      <p className="text-xs text-[#6B7280]">
                        {(seg.answer_options || []).length} options: {(seg.answer_options || []).slice(0, 3).map(o => o.text).join(', ')}
                        {(seg.answer_options || []).length > 3 && '...'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button
              variant="primary"
              onClick={handleGenerate}
              disabled={selectedSegIds.length < 2 || generating}
            >
              {generating ? <Spinner /> : 'Generer combinaisons'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#111827]">{combinations.length} combinaisons</p>
              <p className="text-xs text-[#6B7280]">
                Total: <span className={Math.abs(totalPct - 100) < 0.1 ? 'text-[#059669] font-semibold' : 'text-[#DC2626] font-semibold'}>
                  {totalPct.toFixed(1)}%
                </span>
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={distribuerEquitablement}>
              Distribuer equitablement
            </Button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E5E7EB]">
                  {selectedSegs.map(s => (
                    <th key={s.id} className="text-left py-2 px-2 text-xs font-medium text-[#6B7280]">{s.nom}</th>
                  ))}
                  <th className="text-right py-2 px-2 text-xs font-medium text-[#6B7280] w-24">%</th>
                </tr>
              </thead>
              <tbody>
                {combinations.map((c, i) => (
                  <tr key={i} className="border-b border-[#F3F4F6]">
                    {selectedSegs.map(s => (
                      <td key={s.id} className="py-1.5 px-2 text-[#111827]">{c.combination[s.nom]}</td>
                    ))}
                    <td className="py-1.5 px-2 text-right">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={c.pourcentage}
                        onChange={e => updatePourcentage(i, e.target.value)}
                        className="w-20 text-right bg-white border border-[#D1D5DB] rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>Retour</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Annuler</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner /> : 'Creer le quota croise'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
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

  const totalPourcentage = quotas.reduce((s, q) => s + (q.pourcentage || 0), 0)

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
            <p className="text-sm font-mono font-medium text-[#111827]">{totalPourcentage}%</p>
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
                  {[...quotas].sort((a, b) => (b.pourcentage || 0) - (a.pourcentage || 0)).map(q => {
                    const pct = q.objectif > 0 ? Math.round(((q.valides || 0) / q.objectif) * 100) : 0
                    return (
                    <div key={q.id} className="flex items-center gap-3 p-2 bg-white rounded-lg">
                      <span className="flex-1 text-sm text-[#111827]">{q.segment_value}</span>
                      <span className="text-xs text-[#9CA3AF]">{q.pourcentage}%</span>
                      <span className="text-sm font-mono text-[#059669] w-24 text-right">{q.valides || 0}/{q.objectif || 0}</span>
                      <span className="text-xs font-semibold w-10 text-right" style={{ color: pct >= 100 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626' }}>{pct}%</span>
                      <ProgressBar value={q.valides || 0} max={q.objectif || 1} size="sm" className="w-20" />
                      <button
                        onClick={() => handleDeleteQuota(q.id)}
                        className="p-1 rounded hover:bg-[#FEF2F2] text-[#DC2626]"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )})}
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
  const [quotas, setQuotas] = useState([]) // [{text: "Cote d'Ivoire", pourcentage: 0}, ...]
  const [saving, setSaving] = useState(false)
  const [modeManuel, setModeManuel] = useState(false)
  const [newModalite, setNewModalite] = useState('')

  const totalPct = quotas.reduce((s, q) => s + (q.pourcentage || 0), 0)
  const totalValide = Math.abs(totalPct - 100) < 0.01

  function handleSelectQuestion(qId) {
    const q = questions.find(x => x.id === qId)
    setForm({ question_id: qId, question_text: q?.text || '', nom: '' })
    if (q?.answers?.length > 0) {
      setQuotas(q.answers.map(a => ({ id: a.id, text: a.text, pourcentage: 0 })))
      setModeManuel(false)
    } else {
      setQuotas([])
      setModeManuel(true)
    }
  }

  function updateQuotaPourcentage(index, value) {
    setQuotas(prev => prev.map((q, i) => i === index ? { ...q, pourcentage: parseFloat(value) || 0 } : q))
  }

  function distribuerEquitablement() {
    if (quotas.length === 0) return
    const pct = Math.round((100 / quotas.length) * 10) / 10
    const reste = Math.round((100 - pct * (quotas.length - 1)) * 10) / 10
    setQuotas(prev => prev.map((q, i) => ({ ...q, pourcentage: i === prev.length - 1 ? reste : pct })))
  }

  function ajouterModalite() {
    const val = newModalite.trim()
    if (!val) return
    setQuotas(prev => [...prev, { text: val, pourcentage: 0 }])
    setNewModalite('')
  }

  function supprimerModalite(index) {
    setQuotas(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit() {
    if (!form.nom) return alert('Donnez un nom a la segmentation')
    if (!form.question_id && !modeManuel) return alert('Selectionnez une question')
    if (quotas.length === 0) return alert('Ajoutez au moins une modalite')
    const quotasToCreate = quotas.filter(q => q.pourcentage > 0)
    if (quotasToCreate.length === 0) return alert('Definissez les pourcentages (au moins un > 0)')
    if (!totalValide) {
      const ok = window.confirm(`Le total est ${totalPct.toFixed(1)}% (objectif 100%). Continuer quand meme ?`)
      if (!ok) return
    }
    setSaving(true)
    try {
      await onSave({ ...form, quotas: quotasToCreate, answer_options: quotas.map(q => ({ text: q.text })) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Nouvelle segmentation">
      <div className="space-y-4">
        {/* Question QuestionPro */}
        <div>
          <label className="block text-xs font-medium text-[#374151] mb-1.5">Question QuestionPro *</label>
          {loading ? (
            <div className="flex justify-center py-4"><Spinner /></div>
          ) : questions.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              Impossible de charger les questions QuestionPro. Utilisez le mode manuel.
            </div>
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

        {/* Nom */}
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
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-[#374151]">
              Modalites &amp; quotas ({quotas.length})
            </label>
            <div className="flex gap-2">
              {quotas.length > 0 && (
                <button
                  type="button"
                  onClick={distribuerEquitablement}
                  className="text-xs text-[#059669] hover:underline"
                >
                  Distribuer equitablement
                </button>
              )}
              <button
                type="button"
                onClick={() => setModeManuel(m => !m)}
                className="text-xs text-[#6B7280] hover:underline"
              >
                {modeManuel ? 'Fermer ajout manuel' : '+ Ajouter manuellement'}
              </button>
            </div>
          </div>

          {/* Ajouter une modalite manuellement */}
          {modeManuel && (
            <div className="flex gap-2 mb-2">
              <input
                value={newModalite}
                onChange={e => setNewModalite(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ajouterModalite()}
                placeholder="Ex: Cote d'Ivoire"
                className="flex-1 bg-white border border-[#D1D5DB] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
              />
              <button
                type="button"
                onClick={ajouterModalite}
                className="px-3 py-1.5 bg-[#059669] text-white rounded-lg text-sm hover:bg-[#047857]"
              >
                Ajouter
              </button>
            </div>
          )}

          {quotas.length === 0 ? (
            <p className="text-xs text-[#9CA3AF] text-center py-4 border border-dashed border-[#E5E7EB] rounded-lg">
              {form.question_id ? 'Aucune modalite trouvee pour cette question' : 'Selectionnez une question ou ajoutez des modalites manuellement'}
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto border border-[#E5E7EB] rounded-lg">
              {quotas.map((q, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-[#E5E7EB] last:border-b-0">
                  <span className="flex-1 text-sm text-[#374151] truncate" title={q.text}>{q.text}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={q.pourcentage}
                    onChange={e => updateQuotaPourcentage(i, e.target.value)}
                    className="w-16 bg-white border border-[#D1D5DB] rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#059669]"
                  />
                  <span className="text-xs text-[#6B7280] w-4">%</span>
                  {modeManuel && (
                    <button type="button" onClick={() => supprimerModalite(i)} className="text-[#DC2626] hover:text-red-800 text-xs">✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Indicateur total */}
          {quotas.length > 0 && (
            <div className={`mt-1.5 flex items-center justify-between text-xs px-2 py-1 rounded ${
              totalValide ? 'bg-green-50 text-green-700' : totalPct > 100 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
            }`}>
              <span>Total: <strong>{totalPct.toFixed(1)}%</strong></span>
              <span>{totalValide ? 'Parfait' : totalPct > 100 ? 'Depasse 100%' : `Manque ${(100 - totalPct).toFixed(1)}%`}</span>
            </div>
          )}
        </div>
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
    // Parser le texte: une ligne par quota, format "valeur: pourcentage" ou "valeur = pourcentage"
    const lines = quotasText.split('\n').filter(l => l.trim())
    const quotas = lines.map(line => {
      const match = line.match(/^(.+?)[\s]*[:=][\s]*(\d+(?:\.\d+)?)%?$/)
      if (match) {
        return { segment_value: match[1].trim(), pourcentage: parseFloat(match[2]) }
      }
      return null
    }).filter(Boolean)

    if (quotas.length === 0) {
      return alert('Format invalide. Utilisez: "Valeur: 30" ou "Valeur = 30" (pourcentage)')
    }

    setSaving(true)
    try {
      await createQuotasBulk({
        enquete_id: segmentation.enquete_id,
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
            Quotas en pourcentage (une ligne par valeur)
          </label>
          <textarea
            value={quotasText}
            onChange={e => setQuotasText(e.target.value)}
            rows={8}
            placeholder={`Cote d'Ivoire: 30\nSenegal: 25\nCameroun: 25\nBurkina Faso: 20`}
            className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#059669] resize-none"
          />
          <p className="mt-1 text-xs text-[#9CA3AF]">Format: "Valeur: 30" (pourcentage). Total recommande: 100%</p>
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
  const [migrating, setMigrating] = useState(false)
  const enqSort = useSortable('nom', 'asc')

  async function handleMigrate() {
    if (!confirm('Migrer tous les identifiants vers le format usr00001/adm00001 ?\n\nATTENTION : les enqueteurs devront utiliser leur nouvel identifiant pour se connecter.')) return
    setMigrating(true)
    try {
      const result = await migrateIdentifiants()
      alert(`Migration terminée : ${result.migres} identifiants mis à jour.`)
      onRefresh()
    } catch {
      alert('Erreur lors de la migration.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="p-6 animate-fadeIn max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Enqueteurs</h1>
          <p className="text-sm text-[#6B7280]">{total} enqueteurs enregistres</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleMigrate} loading={migrating}>
            Reformater les IDs
          </Button>
          <Button variant="primary" onClick={onAdd}>
            <PlusIcon />
            <span className="ml-2">Nouvel enqueteur</span>
          </Button>
        </div>
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
              <SortableHeader label="Enqueteur" k="nom" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} />
              <SortableHeader label="Contact" k="email" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} />
              <SortableHeader label="Enquetes" k="nb_enquetes" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} align="center" />
              <SortableHeader label="Questionnaires complétés" k="valides" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} align="center" />
              <SortableHeader label="Progression" k="pct" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} />
              <SortableHeader label="Connexion" k="connexion" sortKey={enqSort.sortKey} sortDir={enqSort.sortDir} onSort={enqSort.toggleSort} align="center" />
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {enqSort.sorted(enqueteurs, {
              nom: e => `${e.nom} ${e.prenom}`,
              email: e => e.email || '',
              nb_enquetes: e => e.nb_enquetes || 0,
              valides: e => e.total_completions_valides ?? e.total_completions ?? 0,
              pct: e => e.total_objectif > 0 ? Math.round(((e.total_completions_valides ?? e.total_completions ?? 0) / e.total_objectif) * 100) : 0,
              connexion: e => e.derniere_connexion ? new Date(e.derniere_connexion).getTime() : 0,
            }).map(e => {
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
  const [segmentations, setSegmentations] = useState([])
  const [historique, setHistorique] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedSegEnquete, setSelectedSegEnquete] = useState(null)

  useEffect(() => {
    loadDetails()
  }, [enqueteur.id])

  async function loadDetails() {
    setLoading(true)
    try {
      const [data, segs, hist] = await Promise.allSettled([
        getEnqueteur(enqueteur.id),
        getEnqueteurSegmentations(enqueteur.id),
        getHistoriqueEnqueteur(enqueteur.id)
      ])
      if (data.status === 'fulfilled') setDetails(data.value)
      if (segs.status === 'fulfilled') setSegmentations(segs.value || [])
      if (hist.status === 'fulfilled') setHistorique(hist.value || [])
    } finally { setLoading(false) }
  }

  if (loading) return <div className="h-full flex items-center justify-center"><Spinner size="lg" /></div>
  if (!details) return <div className="h-full flex items-center justify-center text-sm text-[#6B7280]">Erreur de chargement des donnees</div>

  const affectations = details?.affectations || []
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const totalClics = affectations.reduce((s, a) => s + (a.clics || 0), 0)
  const totalDemarre = affectations.reduce((s, a) => s + (a.demarre_total || 0), 0)
  const globalPct = Math.round((totalCompletions / Math.max(totalObjectif, 1)) * 100)
  const conversionRate = totalClics > 0 ? Math.round((totalCompletions / totalClics) * 100) : 0

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'enquetes', label: `Enquetes (${affectations.length})` },
  ]

  return (
    <div className="h-full flex flex-col animate-fadeIn">
      {/* Header */}
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

        {/* Onglets */}
        <div className="flex gap-1 mt-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#111827] text-white'
                  : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card className="p-4">
                <p className="text-2xl font-bold text-[#059669]">{totalCompletions}</p>
                <p className="text-xs text-[#6B7280]">Questionnaires complétés <span className="text-[#9CA3AF]">/ {totalObjectif}</span></p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-[#2563EB]">{totalObjectif}</p>
                <p className="text-xs text-[#6B7280]">Objectif</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-[#7C3AED]">{totalClics}</p>
                <p className="text-xs text-[#6B7280]">Clics uniques</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-[#0891B2]">{totalDemarre}</p>
                <p className="text-xs text-[#6B7280]">Demarres</p>
              </Card>
              <Card className="p-4">
                <p className="text-2xl font-bold text-[#D97706]">{conversionRate}%</p>
                <p className="text-xs text-[#6B7280]">Conversion</p>
              </Card>
            </div>

            {/* Progression + Courbe */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827]">Progression globale</h3>
                  <span className="text-2xl font-bold text-[#059669]">{globalPct}%</span>
                </div>
                <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden mb-2">
                  <div className="h-full rounded-full bg-[#059669] transition-all duration-700" style={{ width: `${Math.min(globalPct, 100)}%` }} />
                </div>
                <div className="flex justify-between text-xs text-[#6B7280]">
                  <span>{totalCompletions} completions</span>
                  <span>Objectif: {totalObjectif}</span>
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827]">Evolution (30 jours)</h3>
                  {historique.length > 0 && <span className="text-xs text-[#6B7280]">{historique.length} jours</span>}
                </div>
                <LineChart data={historique} height={100} color="#059669" />
              </Card>
            </div>

            {/* Segmentations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Liste enquetes */}
              <Card className="p-6">
                <h3 className="font-semibold text-[#111827] mb-4">Enquetes</h3>
                <div className="space-y-3">
                  {affectations.map(aff => {
                    const enq = aff.enquetes || {}
                    const comp = aff.completions_valides ?? aff.completions_total ?? 0
                    const pct = Math.round((comp / Math.max(aff.objectif_total, 1)) * 100)
                    return (
                      <div key={aff.id} className="p-3 rounded-lg bg-[#F9FAFB]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#E5E7EB] text-[#6B7280]">{enq.code}</span>
                            <span className="text-sm font-medium text-[#111827]">{enq.nom}</span>
                          </div>
                          <span className="text-sm font-semibold" style={{ color: getProgressColor(pct) }}>{pct}%</span>
                        </div>
                        <ProgressBar value={comp} max={aff.objectif_total} size="sm" />
                        <div className="flex justify-between mt-1 text-xs text-[#9CA3AF]">
                          <span>{comp} / {aff.objectif_total}</span>
                          <span>{aff.clics || 0} clics</span>
                        </div>
                      </div>
                    )
                  })}
                  {affectations.length === 0 && <p className="text-center text-[#9CA3AF] py-4">Aucune enquete</p>}
                </div>
              </Card>

              {/* Segmentations */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-[#111827]">Segmentations</h3>
                  {segmentations.length > 1 && (
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
                  {segmentations.length > 0 ? (() => {
                    const activeSeg = segmentations.find(s => s.enquete_id === selectedSegEnquete) || segmentations[0]
                    if (!activeSeg?.segments?.length) return <p className="text-center text-[#9CA3AF] py-4">Pas de donnees</p>
                    const maxComp = Math.max(...activeSeg.segments.map(s => s.completions || 0), 1)
                    return activeSeg.segments.map((seg, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-[#6B7280] w-24 truncate" title={seg.segment_value}>{seg.segment_value}</span>
                        <div className="flex-1 h-6 bg-[#F3F4F6] rounded-full overflow-hidden relative">
                          <div
                            className="h-full rounded-full bg-[#059669] transition-all duration-500"
                            style={{ width: `${Math.round(((seg.completions || 0) / maxComp) * 100)}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                            {seg.completions || 0}
                          </span>
                        </div>
                      </div>
                    ))
                  })() : <p className="text-center text-[#9CA3AF] py-4">Aucune segmentation</p>}
                </div>
              </Card>
            </div>
          </>
        ) : (
          /* Onglet Enquetes - liste detaillee */
          <div className="space-y-4">
            {affectations.map(aff => {
              const enquete = aff.enquetes || {}
              const completions = aff.completions_valides ?? aff.completions_total ?? 0
              const pct = Math.round((completions / Math.max(aff.objectif_total, 1)) * 100)
              const convRate = aff.clics > 0 ? Math.round((completions / aff.clics) * 100) : 0
              return (
                <Card key={aff.id} className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">{enquete.code}</span>
                        <Badge variant={pct >= 100 ? 'success' : pct >= 50 ? 'info' : 'warning'} size="sm">{pct}%</Badge>
                      </div>
                      <h4 className="text-lg font-medium text-[#111827]">{enquete.nom}</h4>
                      {enquete.cible && <p className="text-sm text-[#6B7280]">{enquete.cible}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: getProgressColor(pct) }}>{completions}</p>
                      <p className="text-xs text-[#9CA3AF]">/ {aff.objectif_total}</p>
                    </div>
                  </div>
                  <ProgressBar value={completions} max={aff.objectif_total} size="md" />
                  <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-[#E5E7EB]">
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#059669]">{completions}</p>
                      <p className="text-[10px] text-[#6B7280]">Complétés</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#0891B2]">{aff.demarre_total || 0}</p>
                      <p className="text-[10px] text-[#6B7280]">Demarres</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#7C3AED]">{aff.clics || 0}</p>
                      <p className="text-[10px] text-[#6B7280]">Clics</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-[#D97706]">{convRate}%</p>
                      <p className="text-[10px] text-[#6B7280]">Conv.</p>
                    </div>
                  </div>
                </Card>
              )
            })}
            {affectations.length === 0 && <div className="text-center py-12 text-[#9CA3AF]">Aucune enquete assignee</div>}
          </div>
        )}
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
    if (!form.nom || !form.prenom) return alert('Remplissez tous les champs obligatoires')
    setSaving(true)
    try {
      await onSave(form)
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={enqueteur ? 'Modifier l\'enqueteur' : 'Nouvel enqueteur'}>
      <div className="space-y-4">
        {enqueteur ? (
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Identifiant</label>
            <input
              value={form.identifiant}
              readOnly
              className="w-full bg-[#F3F4F6] border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm text-[#6B7280] cursor-not-allowed"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1.5">Mot de passe initial</label>
            <input
              value={form.mot_de_passe}
              onChange={e => setForm(f => ({ ...f, mot_de_passe: e.target.value }))}
              className="w-full bg-white border border-[#D1D5DB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#059669]"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">L'identifiant sera généré automatiquement</p>
          </div>
        )}
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
      {(affectation.lien_direct || affectation.lien_questionnaire) && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
          <p className="text-xs font-medium text-emerald-700 mb-1">Lien questionnaire</p>
          <a href={affectation.lien_direct || affectation.lien_questionnaire} target="_blank" rel="noopener noreferrer"
             className="text-xs text-emerald-600 hover:underline break-all">
            {affectation.lien_direct || affectation.lien_questionnaire}
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

/* ══════════════════════════════════════════════════════════════════════════════
   MES ENQUETES VIEW (pour les admins qui ont des affectations)
   ══════════════════════════════════════════════════════════════════════════════ */

function MesEnquetesView({ affectations, segmentations, historique, onSelect }) {
  const [activeTab, setActiveTab] = useState('list')

  // Calculs des stats
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_valides ?? a.completions_total ?? 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const totalClics = affectations.reduce((s, a) => s + (a.clics || 0), 0)
  const globalPct = Math.round((totalCompletions / Math.max(totalObjectif, 1)) * 100)
  const conversionRate = totalClics > 0 ? Math.min(100, Math.round((totalCompletions / totalClics) * 100)) : 0

  if (affectations.length === 0) {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#111827]">Mes enquetes</h1>
          <p className="text-sm text-[#6B7280]">Vos enquetes assignees en tant qu'enqueteur</p>
        </div>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mx-auto mb-4">
            <MyEnquetesIcon />
          </div>
          <p className="text-[#6B7280]">Aucune enquete assignee</p>
          <p className="text-sm text-[#9CA3AF] mt-1">Vous n'avez pas encore d'enquetes affectees en tant qu'enqueteur</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#111827]">Mes enquetes</h1>
        <p className="text-sm text-[#6B7280]">{affectations.length} enquete{affectations.length > 1 ? 's' : ''} assignee{affectations.length > 1 ? 's' : ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'list'
              ? 'bg-[#059669] text-white'
              : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
          }`}
        >
          Liste
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'stats'
              ? 'bg-[#059669] text-white'
              : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
          }`}
        >
          Statistiques
        </button>
      </div>

      {activeTab === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {affectations.map(aff => {
            const enquete = aff.enquetes || {}
            const status = STATUTS.find(s => s.value === aff.statut) || STATUTS[0]
            const completions = aff.completions_valides ?? aff.completions_total ?? 0
            const pct = Math.round((completions / Math.max(aff.objectif_total, 1)) * 100)
            const convRate = aff.clics > 0 ? Math.min(100, Math.round((completions / aff.clics) * 100)) : 0

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
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="p-2 rounded-lg bg-[#ECFDF5] text-center">
                    <p className="text-base font-bold text-[#059669]">{completions}</p>
                    <p className="text-[10px] text-[#059669]">Complétés</p>
                  </div>
                  <div className="p-2 rounded-lg bg-[#ECFEFF] text-center">
                    <p className="text-base font-bold text-[#0891B2]">{aff.demarre_total || 0}</p>
                    <p className="text-[10px] text-[#0891B2]">Demarres</p>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F5F3FF] text-center">
                    <p className="text-base font-bold text-[#7C3AED]">{aff.clics || 0}</p>
                    <p className="text-[10px] text-[#7C3AED]">Clics</p>
                  </div>
                  <div className="p-2 rounded-lg bg-[#FFFBEB] text-center">
                    <p className="text-base font-bold text-[#D97706]">{convRate}%</p>
                    <p className="text-[10px] text-[#D97706]">Conv.</p>
                  </div>
                </div>

                <ProgressBar value={completions} max={aff.objectif_total} size="md" />
                <p className="text-xs text-[#9CA3AF] mt-2 text-right">Objectif: {aff.objectif_total}</p>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4">
              <p className="text-2xl font-bold text-[#059669]">{totalCompletions}</p>
              <p className="text-xs text-[#6B7280]">Questionnaires complétés <span className="text-[#9CA3AF]">/ {totalObjectif}</span></p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-[#2563EB]">{totalObjectif}</p>
              <p className="text-xs text-[#6B7280]">Objectif total</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-[#7C3AED]">{totalClics}</p>
              <p className="text-xs text-[#6B7280]">Clics</p>
            </Card>
            <Card className="p-4">
              <p className="text-2xl font-bold text-[#D97706]">{conversionRate}%</p>
              <p className="text-xs text-[#6B7280]">Taux conversion</p>
            </Card>
          </div>

          {/* Progression globale + Courbe */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-[#111827]">Evolution (30 jours)</h3>
                {historique && historique.length > 0 && (
                  <span className="text-xs text-[#6B7280]">{historique.length} jours</span>
                )}
              </div>
              <LineChart data={historique} height={100} color="#059669" />
            </Card>
          </div>

          {/* Segmentations */}
          {segmentations && segmentations.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold text-[#111827] mb-4">Segmentations</h3>
              <div className="space-y-4">
                {segmentations.map(seg => (
                  <div key={seg.enquete_id}>
                    <p className="text-sm font-medium text-[#6B7280] mb-2">{seg.enquete_code} - {seg.enquete_nom}</p>
                    {seg.segmentations?.map(s => (
                      <div key={s.id} className="ml-4">
                        <p className="text-xs font-medium text-[#9CA3AF] mb-1">{s.nom}</p>
                        {s.quotas.map((q, i) => {
                          const pct = q.objectif > 0 ? Math.round(((q.valides || 0) / q.objectif) * 100) : 0
                          return (
                            <div key={i} className="flex items-center gap-3 mb-1">
                              <span className="w-24 text-xs text-[#4B5563] truncate">{q.segment_value}</span>
                              <div className="flex-1 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-[#059669]" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              <span className="text-xs font-mono text-[#9CA3AF] w-14 text-right">{q.valides || 0}/{q.objectif || 0}</span>
                              <span className="text-xs font-semibold w-8 text-right" style={{ color: pct >= 100 ? '#059669' : pct >= 50 ? '#D97706' : '#DC2626' }}>{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   MY ENQUETE DETAIL VIEW (detail d'une affectation pour l'admin)
   ══════════════════════════════════════════════════════════════════════════════ */

function MyEnqueteDetailView({ affectation, onBack }) {
  const enquete = affectation.enquetes || {}
  const status = STATUTS.find(s => s.value === affectation.statut) || STATUTS[0]
  const completions = affectation.completions_valides ?? affectation.completions_total ?? 0
  const pct = Math.round((completions / Math.max(affectation.objectif_total, 1)) * 100)
  const conversionRate = affectation.clics > 0 ? Math.round((completions / affectation.clics) * 100) : 0

  return (
    <div className="p-8 animate-fadeIn">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#6B7280] hover:text-[#111827] mb-4 transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#059669]">{completions}</p>
          <p className="text-xs text-[#6B7280]">Questionnaires complétés <span className="text-[#9CA3AF]">/ {affectation.objectif_total}</span></p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#2563EB]">{affectation.objectif_total}</p>
          <p className="text-xs text-[#6B7280]">Objectif</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#7C3AED]">{affectation.clics || 0}</p>
          <p className="text-xs text-[#6B7280]">Clics uniques</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#0891B2]">{affectation.demarre_total || 0}</p>
          <p className="text-xs text-[#6B7280]">Demarres</p>
        </Card>
        <Card className="p-4">
          <p className="text-2xl font-bold text-[#D97706]">{conversionRate}%</p>
          <p className="text-xs text-[#6B7280]">Conversion</p>
        </Card>
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
              {affectation.lien_direct || affectation.lien_questionnaire}
            </p>
            <CopyButton text={affectation.lien_direct || affectation.lien_questionnaire} />
          </div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => window.open(affectation.lien_direct || affectation.lien_questionnaire, '_blank')}
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
            {affectation.quotas?.length > 0 ? (
              [...affectation.quotas]
                .filter(q => q.completions > 0 || q.objectif > 0)
                .sort((a, b) => {
                  const pctA = a.completions / Math.max(a.objectif, 1)
                  const pctB = b.completions / Math.max(b.objectif, 1)
                  return pctB - pctA
                })
                .map((q, i) => {
                  const segPct = Math.min(Math.round((q.completions / Math.max(q.objectif, 1)) * 100), 100)
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
                        {q.completions}/{q.objectif}
                      </span>
                    </div>
                  )
                })
            ) : (
              <p className="text-sm text-[#9CA3AF] text-center py-6">Aucun quota defini</p>
            )}
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
              <p className="text-xs font-semibold text-[#92400E] mb-1">Note</p>
              <p className="text-sm text-[#78350F]">{affectation.commentaire_admin}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   DEMANDES VIEW
   ══════════════════════════════════════════════════════════════════════════════ */

function DemandesView({ demandes, onAccepter, onRefuser }) {
  const [filter, setFilter] = useState('en_attente')
  const [loadingId, setLoadingId] = useState(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [commentaire, setCommentaire] = useState('')
  const [objectif, setObjectif] = useState('')
  const [showCommentModal, setShowCommentModal] = useState(null) // {ids: [], action}
  const [selection, setSelection] = useState(new Set())

  const filtered = demandes.filter(d => filter === 'toutes' || d.statut === filter)
  const filteredEnAttente = filtered.filter(d => d.statut === 'en_attente')
  const allEnAttenteIds = filteredEnAttente.map(d => d.id)
  const selectionEnAttente = [...selection].filter(id => allEnAttenteIds.includes(id))
  const allSelected = allEnAttenteIds.length > 0 && allEnAttenteIds.every(id => selection.has(id))

  const STATUT_CONFIG = {
    en_attente: { label: 'En attente', color: 'bg-yellow-100 text-yellow-700' },
    acceptee:   { label: 'Acceptee',   color: 'bg-green-100 text-green-700' },
    refusee:    { label: 'Refusee',    color: 'bg-red-100 text-red-700' },
  }

  function toggleSelection(id) {
    setSelection(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelection(prev => {
        const next = new Set(prev)
        allEnAttenteIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelection(prev => new Set([...prev, ...allEnAttenteIds]))
    }
  }

  async function handleAction(ids, action) {
    const isBulk = ids.length > 1
    isBulk ? setBulkLoading(true) : setLoadingId(ids[0])
    try {
      await Promise.all(ids.map(id =>
        action === 'accepter' ? onAccepter(id, commentaire, parseInt(objectif) || 0) : onRefuser(id, commentaire)
      ))
      setShowCommentModal(null)
      setCommentaire('')
      setObjectif('')
      setSelection(new Set())
    } catch (e) {
      alert(e?.response?.data?.detail || 'Erreur')
    } finally {
      setBulkLoading(false)
      setLoadingId(null)
    }
  }

  const enAttente = demandes.filter(d => d.statut === 'en_attente').length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#111827]">Demandes d'affectation</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          {enAttente > 0
            ? `${enAttente} demande${enAttente > 1 ? 's' : ''} en attente de traitement`
            : 'Aucune demande en attente'}
        </p>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'en_attente', label: 'En attente' },
          { id: 'acceptee', label: 'Acceptees' },
          { id: 'refusee', label: 'Refusees' },
          { id: 'toutes', label: 'Toutes' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => { setFilter(f.id); setSelection(new Set()) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-[#111827] text-white' : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
            }`}
          >
            {f.label}
            {f.id === 'en_attente' && enAttente > 0 && (
              <span className="ml-2 bg-[#DC2626] text-white text-xs rounded-full px-1.5">{enAttente}</span>
            )}
          </button>
        ))}
      </div>

      {/* Barre d'actions groupees */}
      {allEnAttenteIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-[#059669]"
            />
            <span className="text-sm text-[#374151]">
              {allSelected ? 'Tout deselectioner' : 'Tout selectionner'}
              {selectionEnAttente.length > 0 && ` (${selectionEnAttente.length})`}
            </span>
          </label>

          {selectionEnAttente.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setShowCommentModal({ ids: selectionEnAttente, action: 'accepter' })}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#059669] text-white text-sm font-medium rounded-lg hover:bg-[#047857] disabled:opacity-50 transition-colors"
              >
                Accepter la selection ({selectionEnAttente.length})
              </button>
              <button
                onClick={() => setShowCommentModal({ ids: selectionEnAttente, action: 'refuser' })}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#FEF2F2] text-[#DC2626] text-sm font-medium rounded-lg hover:bg-[#FEE2E2] disabled:opacity-50 transition-colors"
              >
                Refuser la selection ({selectionEnAttente.length})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Liste */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-[#6B7280]">Aucune demande</Card>
        )}
        {filtered.map(d => {
          const enqueteur = d.enqueteurs
          const enquete = d.enquetes
          const cfg = STATUT_CONFIG[d.statut]
          const isSelected = selection.has(d.id)
          return (
            <Card key={d.id} className={`p-5 transition-colors ${isSelected ? 'ring-2 ring-[#059669] ring-offset-1' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {d.statut === 'en_attente' && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(d.id)}
                      className="mt-1 w-4 h-4 rounded accent-[#059669] flex-shrink-0"
                    />
                  )}
                  <div className="w-10 h-10 rounded-full bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-[#374151]">
                      {enqueteur?.prenom?.[0]}{enqueteur?.nom?.[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[#111827]">
                        {enqueteur?.prenom} {enqueteur?.nom}
                      </span>
                      <span className="text-xs text-[#9CA3AF]">{enqueteur?.email}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg?.color}`}>
                        {cfg?.label}
                      </span>
                    </div>
                    <p className="text-sm text-[#4B5563] mt-1">
                      Souhaite rejoindre <span className="font-medium">{enquete?.nom}</span>
                    </p>
                    {d.message && (
                      <p className="text-xs text-[#6B7280] mt-1 italic">"{d.message}"</p>
                    )}
                    {d.commentaire_admin && (
                      <p className="text-xs text-[#9CA3AF] mt-1">Commentaire : {d.commentaire_admin}</p>
                    )}
                    <p className="text-xs text-[#9CA3AF] mt-1">
                      {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {d.statut === 'en_attente' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => setShowCommentModal({ ids: [d.id], action: 'accepter' })}
                      disabled={loadingId === d.id || bulkLoading}
                      className="px-4 py-2 bg-[#059669] text-white text-sm font-medium rounded-lg hover:bg-[#047857] disabled:opacity-50 transition-colors"
                    >
                      Accepter
                    </button>
                    <button
                      onClick={() => setShowCommentModal({ ids: [d.id], action: 'refuser' })}
                      disabled={loadingId === d.id || bulkLoading}
                      className="px-4 py-2 bg-[#FEF2F2] text-[#DC2626] text-sm font-medium rounded-lg hover:bg-[#FEE2E2] disabled:opacity-50 transition-colors"
                    >
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Modal commentaire */}
      {showCommentModal && (
        <Modal
          isOpen={true}
          title={showCommentModal.action === 'accepter'
            ? `Accepter ${showCommentModal.ids.length > 1 ? `${showCommentModal.ids.length} demandes` : 'la demande'}`
            : `Refuser ${showCommentModal.ids.length > 1 ? `${showCommentModal.ids.length} demandes` : 'la demande'}`}
          onClose={() => { setShowCommentModal(null); setCommentaire(''); setObjectif('') }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[#6B7280]">
              {showCommentModal.action === 'accepter'
                ? `${showCommentModal.ids.length > 1 ? `${showCommentModal.ids.length} affectations seront creees` : "L'affectation sera creee"}.`
                : "Indiquez optionnellement la raison du refus."}
            </p>
            {showCommentModal.action === 'accepter' && (
              <Input
                label="Objectif (nombre de completions)"
                type="number"
                min="0"
                placeholder="ex: 50"
                value={objectif}
                onChange={e => setObjectif(e.target.value)}
              />
            )}
            <Input
              label="Commentaire (optionnel)"
              placeholder="..."
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
            />
            <div className="flex gap-3">
              <Button
                onClick={() => handleAction(showCommentModal.ids, showCommentModal.action)}
                loading={loadingId !== null || bulkLoading}
                variant={showCommentModal.action === 'accepter' ? 'primary' : 'danger'}
                fullWidth
              >
                {showCommentModal.action === 'accepter' ? 'Confirmer' : 'Confirmer le refus'}
              </Button>
              <Button onClick={() => { setShowCommentModal(null); setCommentaire('') }} variant="secondary" fullWidth>
                Annuler
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

