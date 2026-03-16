import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// Intercepteur pour ajouter automatiquement le token JWT
API.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('jwt_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

// Nouvelle authentification avec email + password + OTP
export const authLogin = (email, password) =>
  API.post('/auth/login', { email, password }).then(r => r.data)

export const authVerifyOtp = (email, code) =>
  API.post('/auth/verify-otp', { email, code }).then(r => r.data)

export const authSetupPassword = (token, password) =>
  API.post('/auth/setup-password', { token, password }).then(r => r.data)

export const authForgotPassword = (email) =>
  API.post('/auth/forgot-password', { email }).then(r => r.data)

export const authResetPassword = (email, code, newPassword) =>
  API.post('/auth/reset-password', { email, code, new_password: newPassword }).then(r => r.data)

export const authChangePassword = (currentPassword, newPassword, jwtToken) =>
  API.post('/auth/change-password',
    { current_password: currentPassword, new_password: newPassword },
    { headers: { Authorization: `Bearer ${jwtToken}` } }
  ).then(r => r.data)

export const authSendInvitation = (enqueteurId, jwtToken) =>
  API.post('/auth/send-invitation',
    { enqueteur_id: enqueteurId },
    { headers: { Authorization: `Bearer ${jwtToken}` } }
  ).then(r => r.data)

export const authRegister = (data) =>
  API.post('/auth/register', data).then(r => r.data)

export const authRequestProfileOTP = () =>
  API.post('/auth/request-profile-otp').then(r => r.data)

export const authUpdateProfile = (code, profileData) =>
  API.post('/auth/update-profile', { code, ...profileData }).then(r => r.data)

// Gestion des roles (super admin uniquement)
export const updateEnqueteurRole = (id, role) =>
  API.put(`/admin/enqueteurs/${id}/role`, { role }).then(r => r.data)

// Legacy - garder pour compatibilite temporaire
export const loginEnqueteur = (identifiant, mot_de_passe) =>
  API.post('/enqueteur/login', { identifiant, mot_de_passe }).then(r => r.data)

export const loginAdmin = (mot_de_passe) =>
  API.post('/admin/login', { mot_de_passe }).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ENQUETEUR
// ══════════════════════════════════════════════════════════════════════════════

export const getEnqueteur = (id) =>
  API.get(`/enqueteur/${id}`).then(r => r.data)

export const getAffectationDetail = (enqueteurId, affectationId) =>
  API.get(`/enqueteur/${enqueteurId}/affectation/${affectationId}`).then(r => r.data)

export const syncEnqueteur = (enqueteurId) =>
  API.post(`/enqueteur/${enqueteurId}/sync`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export const getDashboard = () =>
  API.get('/admin/dashboard').then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - ENQUETES
// ══════════════════════════════════════════════════════════════════════════════

export const listEnquetes = () =>
  API.get('/admin/enquetes').then(r => r.data)

export const getEnquete = (id) =>
  API.get(`/admin/enquetes/${id}`).then(r => r.data)

export const createEnquete = (data) =>
  API.post('/admin/enquetes', data).then(r => r.data)

export const updateEnquete = (id, data) =>
  API.put(`/admin/enquetes/${id}`, data).then(r => r.data)

export const deleteEnquete = (id) =>
  API.delete(`/admin/enquetes/${id}`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - ENQUETEURS
// ══════════════════════════════════════════════════════════════════════════════

export const listEnqueteurs = () =>
  API.get('/admin/enqueteurs').then(r => r.data)

export const createEnqueteur = (data) =>
  API.post('/admin/enqueteurs', data).then(r => r.data)

export const updateEnqueteur = (id, data) =>
  API.put(`/admin/enqueteurs/${id}`, data).then(r => r.data)

export const deleteEnqueteur = (id) =>
  API.delete(`/admin/enqueteurs/${id}`).then(r => r.data)

export const migrateIdentifiants = () =>
  API.post('/admin/enqueteurs/migrate-identifiants').then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - AFFECTATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const listAffectations = () =>
  API.get('/admin/affectations').then(r => r.data)

export const listAffectationsByEnquete = (enqueteId) =>
  API.get(`/admin/affectations/by-enquete/${enqueteId}`).then(r => r.data)

export const createAffectation = (data) =>
  API.post('/admin/affectations', data).then(r => r.data)

export const updateAffectation = (id, data) =>
  API.put(`/admin/affectations/${id}`, data).then(r => r.data)

export const deleteAffectation = (id) =>
  API.delete(`/admin/affectations/${id}`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - SEGMENTATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const getSegmentationsByEnquete = (enqueteId) =>
  API.get(`/admin/segmentations/by-enquete/${enqueteId}`).then(r => r.data)

export const createSegmentation = (data) =>
  API.post('/admin/segmentations', data).then(r => r.data)

export const updateSegmentation = (id, data) =>
  API.put(`/admin/segmentations/${id}`, data).then(r => r.data)

export const deleteSegmentation = (id) =>
  API.delete(`/admin/segmentations/${id}`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - QUOTAS
// ══════════════════════════════════════════════════════════════════════════════

export const getQuotasBySegmentation = (segmentationId) =>
  API.get(`/admin/quotas/by-segmentation/${segmentationId}`).then(r => r.data)

export const getQuotasByEnquete = (enqueteId) =>
  API.get(`/admin/quotas/by-enquete/${enqueteId}`).then(r => r.data)

export const getQuotasByAffectation = (affectationId) =>
  API.get(`/admin/quotas/by-affectation/${affectationId}`).then(r => r.data)

export const createQuota = (data) =>
  API.post('/admin/quotas', data).then(r => r.data)

export const createQuotasBulk = (data) =>
  API.post('/admin/quotas/bulk', data).then(r => r.data)

export const updateQuota = (id, data) =>
  API.put(`/admin/quotas/${id}`, data).then(r => r.data)

export const deleteQuota = (id) =>
  API.delete(`/admin/quotas/${id}`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - QUOTAS CROISES
// ══════════════════════════════════════════════════════════════════════════════

export const getQuotaConfigsByEnquete = (enqueteId) =>
  API.get(`/admin/quota-configs/by-enquete/${enqueteId}`).then(r => r.data)

export const createQuotaConfig = (data) =>
  API.post('/admin/quota-configs', data).then(r => r.data)

export const deleteQuotaConfig = (id) =>
  API.delete(`/admin/quota-configs/${id}`).then(r => r.data)

export const generateCombinations = (configId) =>
  API.post(`/admin/quota-configs/${configId}/generate-combinations`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - QUESTIONPRO
// ══════════════════════════════════════════════════════════════════════════════

export const getSurveyInfo = (surveyId) =>
  API.get(`/admin/questionpro/survey/${surveyId}`).then(r => r.data)

export const getSurveyQuestions = (surveyId) =>
  API.get(`/admin/questionpro/survey/${surveyId}/questions`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - SYNC
// ══════════════════════════════════════════════════════════════════════════════

export const syncAll = () =>
  API.post('/admin/sync').then(r => r.data)

export const syncAffectation = (affectationId) =>
  API.post(`/admin/sync/${affectationId}`).then(r => r.data)

export const migrateLinks = () =>
  API.post('/admin/affectations/migrate-links').then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN - STATS
// ══════════════════════════════════════════════════════════════════════════════

export const getStatsPays = () =>
  API.get('/admin/stats-pays').then(r => r.data)

export const getStatsSegments = () =>
  API.get('/admin/stats-segments').then(r => r.data)

export const listPays = () =>
  API.get('/admin/pays').then(r => r.data)

export const listZones = () =>
  API.get('/admin/zones').then(r => r.data)

export const getSegmentationsStats = () =>
  API.get('/admin/segmentations-stats').then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// ENQUETEUR - SEGMENTATIONS
// ══════════════════════════════════════════════════════════════════════════════

export const getEnqueteurSegmentations = (enqueteurId) =>
  API.get(`/enqueteur/${enqueteurId}/segmentations`).then(r => r.data)

// ══════════════════════════════════════════════════════════════════════════════
// HISTORIQUE
// ══════════════════════════════════════════════════════════════════════════════

export const getHistoriqueGlobal = ({ from_date, to_date } = {}) => {
  const params = new URLSearchParams()
  if (from_date) params.set('from_date', from_date)
  if (to_date) params.set('to_date', to_date)
  return API.get(`/admin/historique?${params}`).then(r => r.data)
}

export const getHistoriqueEnquete = (enqueteId, { from_date, to_date } = {}) => {
  const params = new URLSearchParams()
  if (from_date) params.set('from_date', from_date)
  if (to_date) params.set('to_date', to_date)
  return API.get(`/admin/historique/enquete/${enqueteId}?${params}`).then(r => r.data)
}

export const getHistoriqueEnqueteur = (enqueteurId, { from_date, to_date } = {}) => {
  const params = new URLSearchParams()
  if (from_date) params.set('from_date', from_date)
  if (to_date) params.set('to_date', to_date)
  return API.get(`/enqueteur/${enqueteurId}/historique?${params}`).then(r => r.data)
}

// ══════════════════════════════════════════════════════════════════════════════
// DEMANDES D'AFFECTATION
// ══════════════════════════════════════════════════════════════════════════════

export const getEnquetesDisponibles = () =>
  API.get('/enquetes/disponibles').then(r => r.data)

export const creerDemande = (enqueteurId, enqueteId, message = '') =>
  API.post(`/enqueteur/${enqueteurId}/demandes`, { enquete_id: enqueteId, message }).then(r => r.data)

export const getDemandesEnqueteur = (enqueteurId) =>
  API.get(`/enqueteur/${enqueteurId}/demandes`).then(r => r.data)

export const getDemandesAdmin = (statut = null) =>
  API.get('/admin/demandes', { params: statut ? { statut } : {} }).then(r => r.data)

export const accepterDemande = (demandeId, commentaire = '') =>
  API.put(`/admin/demandes/${demandeId}/accepter`, { commentaire }).then(r => r.data)

export const refuserDemande = (demandeId, commentaire = '') =>
  API.put(`/admin/demandes/${demandeId}/refuser`, { commentaire }).then(r => r.data)
