import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authRegister } from '../lib/api'
import { Button, Input } from '../components/ui'

export default function Register() {
  const nav = useNavigate()
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caracteres'
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une majuscule'
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une minuscule'
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre'
    return null
  }

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validations
    if (!formData.nom.trim() || !formData.prenom.trim()) {
      setError('Nom et prenom sont requis')
      return
    }

    const passwordError = validatePassword(formData.password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    try {
      await authRegister({
        email: formData.email,
        password: formData.password,
        nom: formData.nom,
        prenom: formData.prenom,
        telephone: formData.telephone
      })
      setSuccess(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur lors de l\'inscription')
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
          <h2 className="text-2xl font-semibold text-[#111827] mb-2">Inscription reussie</h2>
          <p className="text-[#6B7280] mb-6">
            Votre compte a ete cree. Connectez-vous pour l'activer.
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
              Rejoignez Marketym
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Creez votre compte pour acceder a la plateforme de suivi des enquetes.
            </p>
          </div>
          <p className="text-sm text-white/60">
            Plateforme securisee de suivi des collectes
          </p>
        </div>
      </div>

      {/* Right - Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-sm animate-fadeIn">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-[#059669] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            <span className="text-[#111827] font-semibold text-lg">Marketym by H&C</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-[#111827] mb-1">
              Inscription
            </h2>
            <p className="text-[#6B7280]">
              Creez votre compte enqueteur
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nom"
                value={formData.nom}
                onChange={handleChange('nom')}
                placeholder="DUPONT"
                required
              />
              <Input
                label="Prenom"
                value={formData.prenom}
                onChange={handleChange('prenom')}
                placeholder="Jean"
                required
              />
            </div>

            <Input
              type="email"
              label="Email"
              value={formData.email}
              onChange={handleChange('email')}
              placeholder="votre@email.com"
              required
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              }
            />

            <Input
              type="tel"
              label="Telephone (optionnel)"
              value={formData.telephone}
              onChange={handleChange('telephone')}
              placeholder="+221 77 123 45 67"
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              }
            />

            {/* Password requirements */}
            <div className="p-3 rounded-lg bg-[#F3F4F6] text-sm text-[#6B7280]">
              <p className="font-medium text-[#374151] mb-2">Le mot de passe doit contenir :</p>
              <ul className="space-y-1 text-xs">
                <li className={`flex items-center gap-2 ${formData.password.length >= 8 ? 'text-[#059669]' : ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${formData.password.length >= 8 ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                  8 caracteres minimum
                </li>
                <li className={`flex items-center gap-2 ${/[A-Z]/.test(formData.password) ? 'text-[#059669]' : ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(formData.password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                  Une majuscule
                </li>
                <li className={`flex items-center gap-2 ${/[a-z]/.test(formData.password) ? 'text-[#059669]' : ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(formData.password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                  Une minuscule
                </li>
                <li className={`flex items-center gap-2 ${/[0-9]/.test(formData.password) ? 'text-[#059669]' : ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(formData.password) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                  Un chiffre
                </li>
              </ul>
            </div>

            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                label="Mot de passe"
                value={formData.password}
                onChange={handleChange('password')}
                placeholder="Votre mot de passe"
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
              value={formData.confirmPassword}
              onChange={handleChange('confirmPassword')}
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
              S'inscrire
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </Button>

            <p className="text-center text-sm text-[#6B7280]">
              Deja un compte ?{' '}
              <button
                type="button"
                onClick={() => nav('/')}
                className="text-[#059669] hover:text-[#047857] font-medium transition-colors"
              >
                Se connecter
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
