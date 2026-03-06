import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
})

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

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
// ADMIN - SYNC
// ══════════════════════════════════════════════════════════════════════════════

export const syncAll = () =>
  API.post('/admin/sync').then(r => r.data)
