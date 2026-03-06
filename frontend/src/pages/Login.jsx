import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loginEnqueteur, loginAdmin } from '../lib/api'
import { Button, Input } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const [mode, setMode] = useState('enqueteur')
  const [identifiant, setIdentifiant] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'enqueteur') {
        const data = await loginEnqueteur(identifiant, password)
        sessionStorage.setItem('enqueteur', JSON.stringify(data))
        nav('/dashboard')
      } else {
        await loginAdmin(password)
        sessionStorage.setItem('admin', 'true')
        nav('/admin')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Identifiants incorrects')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      {/* Left - Branding Panel */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden bg-[#059669]">
        {/* Pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg">Marketym by H&C</span>
          </div>

          {/* Hero text */}
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold text-white leading-tight mb-4">
              Plateforme de suivi des enquetes
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Suivez en temps reel la progression de vos collectes de donnees
              et synchronisez automatiquement avec QuestionPro.
            </p>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-10">
            {[
              { value: '12', label: 'Enqueteurs' },
              { value: '3', label: 'Enquetes' },
              { value: '14', label: 'Pays' },
            ].map((stat, i) => (
              <div key={i}>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/60">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm animate-fadeIn">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            <span className="text-[#111827] font-semibold text-lg">Marketym by H&C</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-[#111827] mb-1">
              Connexion
            </h2>
            <p className="text-[#6B7280]">
              Accedez a votre espace de suivi
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex p-1 mb-8 bg-[#F3F4F6] rounded-lg">
            {[
              { id: 'enqueteur', label: 'Enqueteur' },
              { id: 'admin', label: 'Administrateur' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setMode(tab.id); setError('') }}
                className={`
                  flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150
                  ${mode === tab.id
                    ? 'bg-white text-[#111827] shadow-sm'
                    : 'text-[#6B7280] hover:text-[#374151]'
                  }
                `}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'enqueteur' && (
              <div className="animate-fadeIn">
                <Input
                  label="Identifiant"
                  value={identifiant}
                  onChange={(e) => setIdentifiant(e.target.value.toUpperCase())}
                  placeholder="Ex: ACQ1, GENZ2, TR1..."
                  required
                  hint="Votre identifiant unique"
                  icon={
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  }
                />
              </div>
            )}

            <Input
              type="password"
              label="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Entrez votre mot de passe"
              required
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              }
            />

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[#FEF2F2] border border-[#FECACA] animate-scaleIn">
                <svg className="w-4 h-4 text-[#DC2626] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-[#DC2626]">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
            >
              Se connecter
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-[#9CA3AF]">
            En cas de probleme, contactez votre administrateur
          </p>
        </div>
      </div>
    </div>
  )
}
