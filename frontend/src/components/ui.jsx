import { useState } from 'react'

/* ══════════════════════════════════════════════════════════════════════════════
   DESIGN SYSTEM COMPONENTS - Light Theme
   ══════════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// BUTTON
// ─────────────────────────────────────────────────────────────────────────────

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  ...props
}) {
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-medium transition-all duration-150
    disabled:opacity-50 disabled:cursor-not-allowed
  `

  const variants = {
    primary: `
      bg-[#059669] text-white
      hover:bg-[#047857]
      shadow-sm hover:shadow
    `,
    secondary: `
      bg-white text-[#374151] border border-[#D1D5DB]
      hover:bg-[#F9FAFB] hover:border-[#9CA3AF]
    `,
    ghost: `
      text-[#6B7280]
      hover:text-[#111827] hover:bg-[#F3F4F6]
    `,
    danger: `
      bg-[#DC2626] text-white
      hover:bg-[#B91C1C]
    `,
  }

  const sizes = {
    sm: 'text-xs px-3 py-1.5 rounded-md',
    md: 'text-sm px-4 py-2 rounded-lg',
    lg: 'text-sm px-5 py-2.5 rounded-lg',
  }

  return (
    <button
      className={`
        ${baseStyles}
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT
// ─────────────────────────────────────────────────────────────────────────────

export function Input({
  label,
  error,
  hint,
  icon,
  ...props
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-[#374151]">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
            {icon}
          </div>
        )}
        <input
          className={`
            w-full bg-white border rounded-lg
            px-3 py-2.5 text-sm text-[#111827]
            placeholder:text-[#9CA3AF]
            transition-all duration-150
            focus:outline-none focus:ring-2 focus:ring-[#059669] focus:border-transparent
            ${icon ? 'pl-10' : ''}
            ${error
              ? 'border-[#DC2626]'
              : 'border-[#D1D5DB] hover:border-[#9CA3AF]'
            }
          `}
          {...props}
        />
      </div>
      {hint && !error && (
        <p className="text-xs text-[#6B7280]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[#DC2626]">{error}</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGE
// ─────────────────────────────────────────────────────────────────────────────

export function Badge({ children, variant = 'default', size = 'md', dot = false }) {
  const variants = {
    default: 'bg-[#F3F4F6] text-[#4B5563]',
    success: 'bg-[#ECFDF5] text-[#059669]',
    warning: 'bg-[#FFFBEB] text-[#D97706]',
    error: 'bg-[#FEF2F2] text-[#DC2626]',
    info: 'bg-[#EFF6FF] text-[#2563EB]',
    accent: 'bg-[#ECFDF5] text-[#059669]',
  }

  const sizes = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
  }

  return (
    <span className={`
      inline-flex items-center gap-1.5 font-medium rounded-full
      ${variants[variant]}
      ${sizes[size]}
    `}>
      {dot && (
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

export function ProgressBar({ value, max = 100, size = 'md', showLabel = false }) {
  const percentage = Math.min(Math.round((value / Math.max(max, 1)) * 100), 100)

  const getColor = () => {
    if (percentage >= 100) return '#059669'
    if (percentage >= 50) return '#059669'
    if (percentage >= 25) return '#D97706'
    return '#DC2626'
  }

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-2.5',
  }

  return (
    <div className="space-y-1">
      {showLabel && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#6B7280]">{value} / {max}</span>
          <span className="font-medium text-[#111827]">{percentage}%</span>
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-[#E5E7EB] rounded-full overflow-hidden`}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percentage}%`,
            backgroundColor: getColor(),
          }}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTA TABLE — tableau écart quota vs réalisé
// ─────────────────────────────────────────────────────────────────────────────

export function QuotaTable({ quotas = [], compact = false }) {
  if (quotas.length === 0) {
    return <p className="text-sm text-[#9CA3AF] text-center py-4">Aucun quota defini</p>
  }

  const sorted = [...quotas].sort((a, b) => (b.pourcentage || 0) - (a.pourcentage || 0))

  const getEcartColor = (ecart) => ecart >= 0 ? '#059669' : '#DC2626'
  const getAtteintColor = (pct) => pct >= 100 ? '#059669' : pct >= 60 ? '#D97706' : '#DC2626'

  if (compact) {
    // Version compacte pour le dashboard admin (segmentations overview)
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1F2937]">
              {['Segment', 'Quota %', 'Obj.', 'Réalisé', 'Écart', '% Atteint'].map(h => (
                <th key={h} className="px-2 py-1.5 text-[10px] font-semibold text-white text-center first:text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((q, i) => {
              const obj = q.objectif || 0
              const val = q.valides ?? q.completions ?? 0
              const ecart = val - obj
              const pctAtteint = obj > 0 ? Math.round((val / obj) * 100) : (val > 0 ? 999 : 0)
              return (
                <tr key={q.id || i} className={i % 2 === 0 ? 'bg-[#F9FAFB]' : 'bg-white'}>
                  <td className="px-2 py-1 text-xs text-[#111827] truncate max-w-[120px]" title={q.segment_value}>{q.segment_value}</td>
                  <td className="px-2 py-1 text-xs text-[#6B7280] text-center">{q.pourcentage || 0}%</td>
                  <td className="px-2 py-1 text-xs text-[#111827] text-center font-mono">{obj}</td>
                  <td className="px-2 py-1 text-xs font-mono text-center" style={{ color: '#059669' }}>{val}</td>
                  <td className="px-2 py-1 text-xs font-mono font-semibold text-center" style={{ color: getEcartColor(ecart) }}>{ecart > 0 ? '+' : ''}{ecart}</td>
                  <td className="px-2 py-1 text-xs font-semibold text-center" style={{ color: getAtteintColor(pctAtteint) }}>{pctAtteint}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Version complète avec barre de progression
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#1F2937]">
            {['Segment', 'Quota %', 'Objectif', 'Réalisé', 'Écart', '% Atteint', 'Progression'].map(h => (
              <th key={h} className="px-3 py-2 text-xs font-semibold text-white text-center first:text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((q, i) => {
            const obj = q.objectif || 0
            const val = q.valides ?? q.completions ?? 0
            const ecart = val - obj
            const pctAtteint = obj > 0 ? Math.round((val / obj) * 100) : (val > 0 ? 999 : 0)
            const barPct = Math.min(pctAtteint, 100)
            return (
              <tr key={q.id || i} className={`${i % 2 === 0 ? 'bg-[#F9FAFB]' : 'bg-white'} hover:bg-[#F3F4F6]`}>
                <td className="px-3 py-2 text-sm text-[#111827]">{q.segment_value}</td>
                <td className="px-3 py-2 text-sm text-[#6B7280] text-center">{q.pourcentage || 0}%</td>
                <td className="px-3 py-2 text-sm text-[#111827] text-center font-mono">{obj}</td>
                <td className="px-3 py-2 text-sm font-mono text-center" style={{ color: '#059669' }}>{val}</td>
                <td className="px-3 py-2 text-sm font-mono font-semibold text-center" style={{ color: getEcartColor(ecart) }}>
                  {ecart > 0 ? '+' : ''}{ecart}
                </td>
                <td className="px-3 py-2 text-sm font-semibold text-center" style={{ color: getAtteintColor(pctAtteint) }}>
                  {pctAtteint}%
                </td>
                <td className="px-3 py-2 w-32">
                  <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barPct}%`,
                        backgroundColor: getAtteintColor(pctAtteint),
                      }}
                    />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD
// ─────────────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', hover = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white border border-[#E5E7EB] rounded-xl
        ${hover ? 'hover:border-[#D1D5DB] hover:shadow-md cursor-pointer transition-all duration-150' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// COPY BUTTON
// ─────────────────────────────────────────────────────────────────────────────

export function CopyButton({ text, size = 'md' }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sizes = {
    sm: 'p-1.5',
    md: 'p-2',
  }

  return (
    <button
      onClick={handleCopy}
      className={`
        ${sizes[size]} rounded-md transition-all duration-150
        ${copied
          ? 'bg-[#ECFDF5] text-[#059669]'
          : 'bg-[#F3F4F6] text-[#6B7280] hover:text-[#111827] hover:bg-[#E5E7EB]'
        }
      `}
    >
      {copied ? (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative w-full max-w-lg mx-4 bg-white border border-[#E5E7EB] rounded-2xl shadow-xl animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING SPINNER
// ─────────────────────────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <svg className={`${sizes[size]} animate-spin text-[#059669]`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR
// ─────────────────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 'md' }) {
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  // Generate consistent color from name
  const colors = [
    { bg: '#ECFDF5', text: '#059669' },
    { bg: '#EFF6FF', text: '#2563EB' },
    { bg: '#F5F3FF', text: '#7C3AED' },
    { bg: '#FDF2F8', text: '#DB2777' },
    { bg: '#FFFBEB', text: '#D97706' },
  ]
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center font-semibold`}
      style={{ backgroundColor: colors[colorIndex].bg, color: colors[colorIndex].text }}
    >
      {initials}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LINE CHART
// ─────────────────────────────────────────────────────────────────────────────

export function LineChart({ data, height = 120, color = '#059669', showLabels = true }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[#9CA3AF] text-sm" style={{ height }}>
        Aucune donnee
      </div>
    )
  }

  const values = data.map(d => d.completions || 0)
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values)

  const width = 100
  const padding = { top: 10, right: 10, bottom: showLabels ? 25 : 10, left: 10 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Creer les points du graphique
  const points = values.map((v, i) => {
    const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartWidth
    const y = padding.top + chartHeight - ((v - minValue) / Math.max(maxValue - minValue, 1)) * chartHeight
    return { x, y, value: v, date: data[i]?.date }
  })

  // Creer le path pour la ligne
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  // Creer le path pour le remplissage
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`

  // Formater la date
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full" preserveAspectRatio="none">
        {/* Grille horizontale */}
        {[0, 0.5, 1].map((ratio, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={padding.top + chartHeight * (1 - ratio)}
            x2={width - padding.right}
            y2={padding.top + chartHeight * (1 - ratio)}
            stroke="#E5E7EB"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        ))}

        {/* Zone remplie */}
        <path d={areaPath} fill={color} fillOpacity="0.1" />

        {/* Ligne */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill={color} />
        ))}
      </svg>

      {/* Labels en bas */}
      {showLabels && data.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[8px] text-[#9CA3AF]">
          <span>{formatDate(data[0]?.date)}</span>
          <span>{formatDate(data[data.length - 1]?.date)}</span>
        </div>
      )}

      {/* Valeur max en haut a droite */}
      <div className="absolute top-0 right-1 text-[9px] text-[#6B7280]">
        max: {maxValue}
      </div>
    </div>
  )
}
