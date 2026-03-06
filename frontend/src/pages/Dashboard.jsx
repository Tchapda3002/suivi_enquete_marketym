import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEnqueteur } from '../lib/api'
import { Card, Badge, ProgressBar, CopyButton, Spinner, Avatar, Button } from '../components/ui'

const STATUT_CONFIG = {
  en_cours:  { label: 'En cours',  variant: 'info' },
  en_retard: { label: 'En retard', variant: 'warning' },
  termine:   { label: 'Termine',   variant: 'success' },
}

export default function Dashboard() {
  const nav = useNavigate()
  const [enq, setEnq] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('enqueteur')
    if (!stored) return nav('/')
    const data = JSON.parse(stored)
    setEnq(data)
    setLoading(false)

    const refresh = async () => {
      try {
        const fresh = await getEnqueteur(data.id)
        setEnq(fresh)
        sessionStorage.setItem('enqueteur', JSON.stringify(fresh))
      } catch {}
    }
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [nav])

  useEffect(() => {
    if (enq?.affectations?.length > 0 && !selectedId) {
      setSelectedId(enq.affectations[0].id)
    }
  }, [enq, selectedId])

  if (loading || !enq) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <Spinner size="lg" />
      </div>
    )
  }

  const affectations = enq.affectations || []
  const selectedAff = affectations.find(a => a.id === selectedId)
  const totalCompletions = affectations.reduce((s, a) => s + (a.completions_total || 0), 0)
  const totalObjectif = affectations.reduce((s, a) => s + (a.objectif_total || 0), 0)
  const globalPct = Math.round((totalCompletions / Math.max(totalObjectif, 1)) * 100)

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
              <span className="text-[#111827] font-semibold text-sm">Marketym by H&C</span>
            )}
          </div>
        </div>

        {/* User info */}
        <div className="p-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-3">
            <Avatar name={`${enq.prenom} ${enq.nom}`} size="md" />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#111827] truncate">
                  {enq.prenom} {enq.nom}
                </p>
                <p className="text-xs font-mono text-[#6B7280]">{enq.identifiant}</p>
              </div>
            )}
          </div>
        </div>

        {/* Global Progress */}
        {!sidebarCollapsed && (
          <div className="p-4 border-b border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#6B7280]">Progression globale</span>
              <span className="text-sm font-semibold text-[#059669]">{globalPct}%</span>
            </div>
            <ProgressBar value={totalCompletions} max={totalObjectif} size="sm" />
            <p className="text-xs text-[#9CA3AF] mt-2">
              {totalCompletions} / {totalObjectif} completions
            </p>
          </div>
        )}

        {/* Enquetes List */}
        <div className="flex-1 overflow-y-auto py-2">
          {!sidebarCollapsed && (
            <p className="px-4 py-2 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              Mes enquetes
            </p>
          )}
          {affectations.map((aff, index) => {
            const enquete = aff.enquetes || {}
            const isSelected = aff.id === selectedId
            const pct = Math.round((aff.completions_total / Math.max(aff.objectif_total, 1)) * 100)

            return (
              <button
                key={aff.id}
                onClick={() => setSelectedId(aff.id)}
                className={`
                  w-full text-left transition-all duration-150 animate-slideIn
                  ${sidebarCollapsed ? 'px-3 py-3' : 'px-4 py-3'}
                  ${isSelected
                    ? 'bg-[#F3F4F6] border-l-2 border-l-[#059669]'
                    : 'border-l-2 border-l-transparent hover:bg-[#F9FAFB]'
                  }
                `}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {sidebarCollapsed ? (
                  <div className={`
                    w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold mx-auto
                    ${isSelected ? 'bg-[#059669] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}
                  `}>
                    {enquete.code?.slice(0, 2)}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F3F4F6] text-[#6B7280]">
                        {enquete.code}
                      </span>
                      <span className={`text-xs font-semibold ${pct >= 100 ? 'text-[#059669]' : 'text-[#6B7280]'}`}>
                        {pct}%
                      </span>
                    </div>
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#111827]' : 'text-[#4B5563]'}`}>
                      {enquete.nom}
                    </p>
                    <div className="mt-2">
                      <ProgressBar value={aff.completions_total} max={aff.objectif_total} size="sm" />
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#E5E7EB] space-y-1">
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
        {selectedAff ? (
          <EnqueteDetail affectation={selectedAff} />
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
   ENQUETE DETAIL COMPONENT
   ══════════════════════════════════════════════════════════════════════════════ */

function EnqueteDetail({ affectation }) {
  const enquete = affectation.enquetes || {}
  const status = STATUT_CONFIG[affectation.statut] || STATUT_CONFIG.en_cours
  const pct = Math.round((affectation.completions_total / Math.max(affectation.objectif_total, 1)) * 100)
  const conversionRate = affectation.clics > 0
    ? Math.round((affectation.completions_total / affectation.clics) * 100)
    : 0

  return (
    <div className="p-8 max-w-4xl animate-fadeIn">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono px-2 py-1 rounded bg-[#F3F4F6] text-[#6B7280]">
              {enquete.code}
            </span>
            <Badge variant={status.variant} dot>
              {status.label}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold text-[#111827] mb-1">{enquete.nom}</h1>
          <p className="text-[#6B7280]">{enquete.cible}</p>
        </div>

        <div className="text-right">
          <p className="text-4xl font-bold text-[#111827]">{pct}%</p>
          <p className="text-sm text-[#9CA3AF]">progression</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatBlock
          label="Completions"
          value={affectation.completions_total}
          subValue={`/ ${affectation.objectif_total}`}
          color="#059669"
        />
        <StatBlock
          label="Objectif"
          value={affectation.objectif_total}
          subValue="reponses"
          color="#2563EB"
        />
        <StatBlock
          label="Clics"
          value={affectation.clics || 0}
          subValue="ouvertures"
          color="#7C3AED"
        />
        <StatBlock
          label="Conversion"
          value={`${conversionRate}%`}
          subValue="taux"
          color="#D97706"
        />
      </div>

      {/* Progress Section */}
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#111827]">Progression globale</h3>
          <span className="text-sm font-mono text-[#6B7280]">
            {affectation.completions_total} / {affectation.objectif_total}
          </span>
        </div>
        <div className="h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(pct, 100)}%`,
              backgroundColor: '#059669',
            }}
          />
        </div>
      </Card>

      {/* Two Column Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* Questionnaire Link */}
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

        {/* Country Progress */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-[#111827] mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#059669]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Progression par pays
          </h3>

          <div className="space-y-2.5 max-h-[200px] overflow-y-auto">
            {affectation.completions_pays?.length > 0 ? (
              [...affectation.completions_pays]
                .sort((a, b) => {
                  const pctA = a.completions / Math.max(a.objectif, 1)
                  const pctB = b.completions / Math.max(b.objectif, 1)
                  return pctB - pctA
                })
                .map((cp, i) => (
                  <CountryRow
                    key={i}
                    pays={cp.pays?.nom || 'Inconnu'}
                    completions={cp.completions}
                    objectif={cp.objectif}
                  />
                ))
            ) : (
              <p className="text-sm text-[#9CA3AF] text-center py-6">
                Aucune donnee disponible
              </p>
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
              <p className="text-xs font-semibold text-[#92400E] mb-1">
                Message de l'administrateur
              </p>
              <p className="text-sm text-[#78350F]">{affectation.commentaire_admin}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ══════════════════════════════════════════════════════════════════════════════ */

function StatBlock({ label, value, subValue, color }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color }}>
        {value}
        {subValue && <span className="text-sm font-normal text-[#9CA3AF] ml-1">{subValue}</span>}
      </p>
    </Card>
  )
}

function CountryRow({ pays, completions, objectif }) {
  const pct = Math.min(Math.round((completions / Math.max(objectif, 1)) * 100), 100)
  const isComplete = pct >= 100

  return (
    <div className="flex items-center gap-3">
      <span className={`w-20 text-sm truncate ${isComplete ? 'text-[#059669] font-medium' : 'text-[#4B5563]'}`}>
        {pays}
      </span>
      <div className="flex-1 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: isComplete ? '#059669' : '#059669',
          }}
        />
      </div>
      <span className="text-xs font-mono text-[#9CA3AF] w-12 text-right">
        {completions}/{objectif}
      </span>
    </div>
  )
}
