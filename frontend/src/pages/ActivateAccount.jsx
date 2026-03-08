import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { authSetupPassword } from '../lib/api'
import { Button, Input } from '../components/ui'

export default function ActivateAccount() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Pas besoin d'erreur si pas de token, on affiche les instructions

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caracteres'
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une majuscule'
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une minuscule'
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validations
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    try {
      await authSetupPassword(token, password)
      setSuccess(true)
      setTimeout(() => nav('/'), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'activation')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-8">
        <div className="w-full max-w-sm text-center animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-[#D1FAE5] flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#059669]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-[#111827] mb-2">Compte active</h2>
          <p className="text-[#6B7280] mb-6">
            Votre compte a ete configure avec succes. Vous allez etre redirige vers la page de connexion.
          </p>
          <Button onClick={() => nav('/')} fullWidth>
            Aller a la connexion
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex bg-[#F9FAFB]">
      {/* Left - Branding Panel */}
      <div className="hidden lg:flex lg:w-[50%] relative overflow-hidden bg-[#059669]">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            <span className="text-white font-semibold text-lg">Marketym by H&C</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold text-white leading-tight mb-4">
              Activez votre compte
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Definissez votre mot de passe pour acceder a la plateforme de suivi des enquetes.
            </p>
          </div>
          <p className="text-sm text-white/60">
            Plateforme securisee de suivi des collectes
          </p>
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
              Creez votre mot de passe
            </h2>
            <p className="text-[#6B7280]">
              Choisissez un mot de passe securise pour votre compte
            </p>
          </div>

          {!token ? (
            <div className="space-y-6">
              <div className="p-4 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0]">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#059669] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <p className="font-medium text-[#166534] mb-1">Comment activer votre compte ?</p>
                    <ol className="text-sm text-[#166534] space-y-1 list-decimal list-inside">
                      <li>Verifiez votre boite email</li>
                      <li>Ouvrez l'email d'invitation de Marketym</li>
                      <li>Cliquez sur le bouton "Activer mon compte"</li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#FEF3C7] border border-[#FDE68A]">
                <p className="text-sm text-[#92400E]">
                  <strong>Pas recu d'email ?</strong> Verifiez vos spams ou contactez votre administrateur pour renvoyer l'invitation.
                </p>
              </div>

              <Button onClick={() => nav('/')} fullWidth variant="secondary">
                Retour a la connexion
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Password requirements */}
              <div className="p-3 rounded-lg bg-[#F3F4F6] text-sm text-[#6B7280]">
                <p className="font-medium text-[#374151] mb-2">Le mot de passe doit contenir :</p>
                <ul className="space-y-1">
                  <li className={`flex items-center gap-2 ${password.length >= 8 ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${password.length >= 8 ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Au moins 8 caracteres
                  </li>
                  <li className={`flex items-center gap-2 ${/[A-Z]/.test(password) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Une majuscule
                  </li>
                  <li className={`flex items-center gap-2 ${/[a-z]/.test(password) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Une minuscule
                  </li>
                  <li className={`flex items-center gap-2 ${/[0-9]/.test(password) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Un chiffre
                  </li>
                </ul>
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[38px] text-[#6B7280] hover:text-[#111827] transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <Input
                type={showPassword ? "text" : "password"}
                label="Confirmer le mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
                required
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                }
              />

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

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Activer mon compte
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </form>
          )}

          <p className="mt-8 text-center text-xs text-[#9CA3AF]">
            En cas de probleme, contactez votre administrateur
          </p>
        </div>
      </div>
    </div>
  )
}
