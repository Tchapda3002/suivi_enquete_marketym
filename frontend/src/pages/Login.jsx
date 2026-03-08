import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authLogin, authVerifyOtp, authForgotPassword, authResetPassword } from '../lib/api'
import { Button, Input } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const [step, setStep] = useState('credentials') // 'credentials' | 'otp' | 'forgot' | 'forgot-otp' | 'forgot-newpass'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return 'Le mot de passe doit contenir au moins 8 caracteres'
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une majuscule'
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une minuscule'
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre'
    return null
  }

  async function handleSubmitCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const response = await authLogin(email, password)

      if (response.status === 'authenticated') {
        sessionStorage.setItem('user', JSON.stringify(response.user))
        sessionStorage.setItem('jwt_token', response.access_token)

        if (response.user.is_admin) {
          nav('/admin')
        } else {
          nav('/dashboard')
        }
      } else if (response.status === 'otp_required') {
        setStep('otp')
        setSuccess('Code de verification envoye par email')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await authVerifyOtp(email, otpCode)
      sessionStorage.setItem('user', JSON.stringify(data.user))
      sessionStorage.setItem('jwt_token', data.access_token)

      if (data.user.is_admin) {
        nav('/admin')
      } else {
        nav('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Code incorrect')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authForgotPassword(email)
      setStep('forgot-otp')
      setOtpCode('')
      setSuccess('Code de verification envoye par email')
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyForgotOtp(e) {
    e.preventDefault()
    setError('')
    // Passer directement a l'etape de nouveau mot de passe
    setStep('forgot-newpass')
    setSuccess('')
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')

    // Validations
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    setLoading(true)
    try {
      await authResetPassword(email, otpCode, newPassword)
      setSuccess('Mot de passe modifie avec succes')
      setTimeout(() => {
        resetForm()
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendOtp() {
    setError('')
    setLoading(true)
    try {
      if (step === 'otp') {
        await authLogin(email, password)
      } else {
        await authForgotPassword(email)
      }
      setSuccess('Nouveau code envoye')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setStep('credentials')
    setEmail('')
    setPassword('')
    setOtpCode('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess('')
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
              Plateforme de suivi des enquetes
            </h1>
            <p className="text-white/80 text-lg leading-relaxed">
              Suivez en temps reel la progression de vos collectes de donnees
              et synchronisez automatiquement avec QuestionPro.
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
              {step === 'otp' ? 'Verification'
                : step === 'forgot' ? 'Mot de passe oublie'
                : step === 'forgot-otp' ? 'Verification'
                : step === 'forgot-newpass' ? 'Nouveau mot de passe'
                : 'Connexion'}
            </h2>
            <p className="text-[#6B7280]">
              {step === 'otp'
                ? 'Entrez le code recu par email pour valider votre compte'
                : step === 'forgot'
                ? 'Entrez votre email pour recevoir un code de verification'
                : step === 'forgot-otp'
                ? 'Entrez le code recu par email'
                : step === 'forgot-newpass'
                ? 'Definissez votre nouveau mot de passe'
                : 'Accedez a votre espace de suivi'}
            </p>
          </div>

          {/* Step: Forgot Password - Enter Email */}
          {step === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4 animate-fadeIn">
              <Input
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                placeholder="votre@email.com"
                required
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
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
                Envoyer le code
              </Button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setError(''); setSuccess('') }}
                className="w-full text-sm text-[#6B7280] hover:text-[#059669] transition-colors"
              >
                Retour a la connexion
              </button>
            </form>
          )}

          {/* Step: Forgot Password - Enter OTP */}
          {step === 'forgot-otp' && (
            <form onSubmit={handleVerifyForgotOtp} className="space-y-4 animate-fadeIn">
              <div className="p-3 rounded-lg bg-[#F3F4F6] text-sm text-[#6B7280]">
                <p>Un code de verification a ete envoye a :</p>
                <p className="font-medium text-[#111827]">{email}</p>
              </div>

              <Input
                type="text"
                label="Code de verification"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                maxLength={6}
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

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#D1FAE5] border border-[#A7F3D0] animate-scaleIn">
                  <svg className="w-4 h-4 text-[#059669] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-[#059669]">{success}</p>
                </div>
              )}

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Continuer
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-[#059669] hover:text-[#047857] transition-colors disabled:opacity-50"
                >
                  Renvoyer le code
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[#6B7280] hover:text-[#374151] transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Step: Forgot Password - New Password */}
          {step === 'forgot-newpass' && (
            <form onSubmit={handleResetPassword} className="space-y-4 animate-fadeIn">
              {/* Password requirements */}
              <div className="p-3 rounded-lg bg-[#F3F4F6] text-sm text-[#6B7280]">
                <p className="font-medium text-[#374151] mb-2">Le mot de passe doit contenir :</p>
                <ul className="space-y-1 text-xs">
                  <li className={`flex items-center gap-2 ${newPassword.length >= 8 ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    8 caracteres minimum
                  </li>
                  <li className={`flex items-center gap-2 ${/[A-Z]/.test(newPassword) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[A-Z]/.test(newPassword) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Une majuscule
                  </li>
                  <li className={`flex items-center gap-2 ${/[a-z]/.test(newPassword) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[a-z]/.test(newPassword) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Une minuscule
                  </li>
                  <li className={`flex items-center gap-2 ${/[0-9]/.test(newPassword) ? 'text-[#059669]' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-[#059669]' : 'bg-[#9CA3AF]'}`} />
                    Un chiffre
                  </li>
                </ul>
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  label="Nouveau mot de passe"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Votre nouveau mot de passe"
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

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#D1FAE5] border border-[#A7F3D0] animate-scaleIn">
                  <svg className="w-4 h-4 text-[#059669] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-[#059669]">{success}</p>
                </div>
              )}

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Changer le mot de passe
              </Button>

              <button
                type="button"
                onClick={resetForm}
                className="w-full text-sm text-[#6B7280] hover:text-[#059669] transition-colors"
              >
                Annuler
              </button>
            </form>
          )}

          {/* Step: OTP Verification (First Login) */}
          {step === 'otp' && (
            <form onSubmit={handleSubmitOtp} className="space-y-4 animate-fadeIn">
              <div className="p-3 rounded-lg bg-[#F0FDF4] border border-[#BBF7D0] text-sm">
                <p className="text-[#166534] font-medium mb-1">Premiere connexion</p>
                <p className="text-[#166534]">Un code de verification a ete envoye a <span className="font-medium">{email}</span></p>
              </div>

              <Input
                type="text"
                label="Code de verification"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                maxLength={6}
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

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[#D1FAE5] border border-[#A7F3D0] animate-scaleIn">
                  <svg className="w-4 h-4 text-[#059669] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-sm text-[#059669]">{success}</p>
                </div>
              )}

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Valider mon compte
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-[#059669] hover:text-[#047857] transition-colors disabled:opacity-50"
                >
                  Renvoyer le code
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[#6B7280] hover:text-[#374151] transition-colors"
                >
                  Changer d'email
                </button>
              </div>
            </form>
          )}

          {/* Step: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleSubmitCredentials} className="space-y-4">
              <Input
                type="email"
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                placeholder="votre@email.com"
                required
                icon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                }
              />

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
                Se connecter
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>

              <button
                type="button"
                onClick={() => { setStep('forgot'); setError('') }}
                className="w-full text-sm text-[#6B7280] hover:text-[#059669] transition-colors"
              >
                Mot de passe oublie ?
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#E5E7EB]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-[#6B7280]">ou</span>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                fullWidth
                size="lg"
                onClick={() => nav('/inscription')}
              >
                Creer un compte
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
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
