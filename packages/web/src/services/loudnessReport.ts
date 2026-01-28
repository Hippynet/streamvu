/**
 * Loudness Compliance Report Service
 *
 * Generates PDF compliance reports for EBU R128 / ATSC A/85 loudness standards.
 * Includes:
 * - Integrated loudness (LUFS/LKFS)
 * - Loudness range (LRA)
 * - True peak measurements
 * - Short-term and momentary loudness graphs
 * - Compliance status against target
 */

export interface LoudnessMeasurement {
  timestamp: number
  integrated: number // LUFS
  shortTerm: number // LUFS
  momentary: number // LUFS
  truePeak: number // dBTP
  lra: number // LU (loudness units)
}

export interface LoudnessReportData {
  // Session info
  sessionName: string
  roomName: string
  startTime: Date
  endTime: Date
  duration: number // seconds

  // Target standard
  standard: 'EBU_R128' | 'ATSC_A85' | 'CUSTOM'
  targetLoudness: number // LUFS
  targetTruePeak: number // dBTP
  toleranceLU: number // Loudness units tolerance

  // Final measurements
  integratedLoudness: number // LUFS
  loudnessRange: number // LU
  maxTruePeak: number // dBTP
  maxMomentary: number // LUFS
  maxShortTerm: number // LUFS

  // Time series data (for graphs)
  measurements: LoudnessMeasurement[]

  // Compliance
  isCompliant: boolean
  violations: LoudnessViolation[]
}

export interface LoudnessViolation {
  timestamp: number
  type: 'INTEGRATED_LOW' | 'INTEGRATED_HIGH' | 'TRUE_PEAK_EXCEEDED' | 'LRA_EXCEEDED'
  value: number
  threshold: number
  description: string
}

// Standard presets
export const LOUDNESS_STANDARDS = {
  EBU_R128: {
    name: 'EBU R128',
    targetLoudness: -23,
    toleranceLU: 1,
    maxTruePeak: -1,
    maxLRA: 20,
    description: 'European Broadcasting Union standard for broadcast audio',
  },
  ATSC_A85: {
    name: 'ATSC A/85',
    targetLoudness: -24,
    toleranceLU: 2,
    maxTruePeak: -2,
    maxLRA: null, // Not specified
    description: 'US broadcast standard for loudness and true-peak',
  },
  STREAMING: {
    name: 'Streaming Platforms',
    targetLoudness: -14,
    toleranceLU: 1,
    maxTruePeak: -1,
    maxLRA: null,
    description: 'Common target for streaming platforms (Spotify, YouTube)',
  },
} as const

/**
 * Calculate compliance violations from measurements
 */
export function analyzeCompliance(
  data: LoudnessReportData
): LoudnessViolation[] {
  const violations: LoudnessViolation[] = []
  const { targetLoudness, toleranceLU, targetTruePeak } = data

  // Check integrated loudness
  const loudnessDiff = data.integratedLoudness - targetLoudness
  if (Math.abs(loudnessDiff) > toleranceLU) {
    violations.push({
      timestamp: 0,
      type: loudnessDiff < 0 ? 'INTEGRATED_LOW' : 'INTEGRATED_HIGH',
      value: data.integratedLoudness,
      threshold: targetLoudness,
      description:
        loudnessDiff < 0
          ? `Integrated loudness ${data.integratedLoudness.toFixed(1)} LUFS is below target ${targetLoudness} LUFS (tolerance: ${toleranceLU} LU)`
          : `Integrated loudness ${data.integratedLoudness.toFixed(1)} LUFS exceeds target ${targetLoudness} LUFS (tolerance: ${toleranceLU} LU)`,
    })
  }

  // Check true peak
  if (data.maxTruePeak > targetTruePeak) {
    // Find all peak violations in measurements
    const peakViolations = data.measurements.filter(
      (m) => m.truePeak > targetTruePeak
    )
    for (const v of peakViolations) {
      violations.push({
        timestamp: v.timestamp,
        type: 'TRUE_PEAK_EXCEEDED',
        value: v.truePeak,
        threshold: targetTruePeak,
        description: `True peak ${v.truePeak.toFixed(1)} dBTP exceeds limit ${targetTruePeak} dBTP`,
      })
    }
  }

  return violations
}

/**
 * Generate HTML for the loudness report
 * This can be converted to PDF using browser print or a PDF library
 */
export function generateReportHTML(data: LoudnessReportData): string {
  const standard = data.standard in LOUDNESS_STANDARDS
    ? LOUDNESS_STANDARDS[data.standard as keyof typeof LOUDNESS_STANDARDS]
    : { name: 'Custom', description: 'Custom loudness target' }

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`
  }

  const complianceStatus = data.isCompliant
    ? '<span style="color: #22c55e; font-weight: bold;">COMPLIANT</span>'
    : '<span style="color: #ef4444; font-weight: bold;">NON-COMPLIANT</span>'

  const violationsHTML =
    data.violations.length > 0
      ? data.violations
          .map(
            (v) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #333;">${formatTime(v.timestamp)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #333;">${v.type.replace(/_/g, ' ')}</td>
          <td style="padding: 8px; border-bottom: 1px solid #333;">${v.value.toFixed(1)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #333;">${v.threshold.toFixed(1)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #333;">${v.description}</td>
        </tr>
      `
          )
          .join('')
      : '<tr><td colspan="5" style="padding: 16px; text-align: center; color: #22c55e;">No violations detected</td></tr>'

  // Generate SVG graph for loudness over time
  const graphSVG = generateLoudnessGraph(data.measurements, data.targetLoudness)

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Loudness Compliance Report - ${data.sessionName}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #fff;
      margin: 0;
      padding: 20px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #333;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #3b82f6;
    }
    .report-title {
      font-size: 28px;
      margin: 0 0 10px 0;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      border-bottom: 1px solid #333;
      padding-bottom: 8px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }
    .metric {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .metric-label {
      font-size: 12px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .metric-value {
      font-size: 32px;
      font-weight: bold;
      margin: 8px 0;
    }
    .metric-unit {
      font-size: 14px;
      color: #666;
    }
    .compliant { color: #22c55e; }
    .warning { color: #eab308; }
    .error { color: #ef4444; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1a1a1a;
      border-radius: 8px;
      overflow: hidden;
    }
    th {
      background: #262626;
      padding: 12px 8px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #888;
    }
    .graph-container {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #333;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #333;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">StreamVU</div>
      <div style="color: #666; font-size: 14px;">Loudness Compliance Report</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 14px; color: #888;">Generated</div>
      <div>${new Date().toLocaleString()}</div>
    </div>
  </div>

  <h1 class="report-title">${data.sessionName}</h1>
  <p style="color: #888; margin-top: 0;">
    Room: ${data.roomName} | Duration: ${formatTime(data.duration)} |
    Standard: ${standard.name}
  </p>

  <div class="section">
    <div class="section-title">Compliance Status</div>
    <div style="font-size: 24px; margin-bottom: 10px;">${complianceStatus}</div>
    <p style="color: #888; margin: 0;">
      Target: ${data.targetLoudness} LUFS (±${data.toleranceLU} LU) |
      Max True Peak: ${data.targetTruePeak} dBTP
    </p>
  </div>

  <div class="section">
    <div class="section-title">Measurements</div>
    <div class="metric-grid">
      <div class="metric">
        <div class="metric-label">Integrated Loudness</div>
        <div class="metric-value ${Math.abs(data.integratedLoudness - data.targetLoudness) <= data.toleranceLU ? 'compliant' : 'error'}">
          ${data.integratedLoudness.toFixed(1)}
        </div>
        <div class="metric-unit">LUFS</div>
      </div>
      <div class="metric">
        <div class="metric-label">Loudness Range</div>
        <div class="metric-value">${data.loudnessRange.toFixed(1)}</div>
        <div class="metric-unit">LU</div>
      </div>
      <div class="metric">
        <div class="metric-label">Max True Peak</div>
        <div class="metric-value ${data.maxTruePeak <= data.targetTruePeak ? 'compliant' : 'error'}">
          ${data.maxTruePeak.toFixed(1)}
        </div>
        <div class="metric-unit">dBTP</div>
      </div>
      <div class="metric">
        <div class="metric-label">Max Momentary</div>
        <div class="metric-value">${data.maxMomentary.toFixed(1)}</div>
        <div class="metric-unit">LUFS</div>
      </div>
      <div class="metric">
        <div class="metric-label">Max Short-Term</div>
        <div class="metric-value">${data.maxShortTerm.toFixed(1)}</div>
        <div class="metric-unit">LUFS</div>
      </div>
      <div class="metric">
        <div class="metric-label">Session Duration</div>
        <div class="metric-value">${formatTime(data.duration)}</div>
        <div class="metric-unit">HH:MM:SS</div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Loudness Over Time</div>
    <div class="graph-container">
      ${graphSVG}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Violations (${data.violations.length})</div>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Type</th>
          <th>Value</th>
          <th>Threshold</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${violationsHTML}
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>
      StreamVU Loudness Compliance Report | Standard: ${standard.name}<br>
      ${standard.description}
    </p>
  </div>
</body>
</html>
  `
}

/**
 * Generate SVG graph for loudness measurements
 */
function generateLoudnessGraph(
  measurements: LoudnessMeasurement[],
  targetLoudness: number
): string {
  if (measurements.length === 0) {
    return '<p style="text-align: center; color: #666;">No measurement data available</p>'
  }

  const width = 800
  const height = 200
  const padding = { top: 20, right: 40, bottom: 30, left: 50 }
  const graphWidth = width - padding.left - padding.right
  const graphHeight = height - padding.top - padding.bottom

  // Calculate scales
  const minTime = measurements[0].timestamp
  const maxTime = measurements[measurements.length - 1].timestamp
  const timeRange = maxTime - minTime || 1

  // Find loudness range (typically -50 to 0 LUFS)
  const minLoudness = -50
  const maxLoudness = 0
  const loudnessRange = maxLoudness - minLoudness

  // Create path for short-term loudness
  const shortTermPath = measurements
    .map((m, i) => {
      const x = padding.left + ((m.timestamp - minTime) / timeRange) * graphWidth
      const y =
        padding.top +
        ((maxLoudness - m.shortTerm) / loudnessRange) * graphHeight
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  // Create path for momentary loudness
  const momentaryPath = measurements
    .map((m, i) => {
      const x = padding.left + ((m.timestamp - minTime) / timeRange) * graphWidth
      const y =
        padding.top +
        ((maxLoudness - m.momentary) / loudnessRange) * graphHeight
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')

  // Target line y position
  const targetY =
    padding.top + ((maxLoudness - targetLoudness) / loudnessRange) * graphHeight

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="shortTermGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:0" />
        </linearGradient>
      </defs>

      <!-- Grid lines -->
      ${[-40, -30, -20, -10]
        .map((db) => {
          const y =
            padding.top + ((maxLoudness - db) / loudnessRange) * graphHeight
          return `
          <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"
                stroke="#333" stroke-width="1" stroke-dasharray="4,4" />
          <text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" fill="#666" font-size="10">${db}</text>
        `
        })
        .join('')}

      <!-- Target line -->
      <line x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}"
            stroke="#22c55e" stroke-width="2" stroke-dasharray="8,4" />
      <text x="${width - padding.right + 5}" y="${targetY + 4}" fill="#22c55e" font-size="10">Target</text>

      <!-- Momentary loudness (background) -->
      <path d="${momentaryPath}" fill="none" stroke="#666" stroke-width="1" opacity="0.5" />

      <!-- Short-term loudness -->
      <path d="${shortTermPath}" fill="none" stroke="#3b82f6" stroke-width="2" />

      <!-- Axis labels -->
      <text x="${padding.left}" y="${height - 5}" fill="#666" font-size="10">0:00</text>
      <text x="${width - padding.right}" y="${height - 5}" text-anchor="end" fill="#666" font-size="10">
        ${Math.floor((maxTime - minTime) / 60)}:${((maxTime - minTime) % 60).toString().padStart(2, '0')}
      </text>
      <text x="${padding.left / 2}" y="${height / 2}" transform="rotate(-90, ${padding.left / 2}, ${height / 2})"
            text-anchor="middle" fill="#666" font-size="10">LUFS</text>

      <!-- Legend -->
      <rect x="${width - 150}" y="10" width="12" height="3" fill="#3b82f6" />
      <text x="${width - 133}" y="14" fill="#888" font-size="10">Short-term</text>
      <rect x="${width - 150}" y="22" width="12" height="1" fill="#666" />
      <text x="${width - 133}" y="26" fill="#888" font-size="10">Momentary</text>
    </svg>
  `
}

/**
 * Trigger browser print dialog for PDF export
 * Uses an iframe to avoid document.write security issues
 */
export function printReport(data: LoudnessReportData): void {
  const html = generateReportHTML(data)

  // Create a hidden iframe for printing
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = 'none'
  document.body.appendChild(iframe)

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
  if (iframeDoc) {
    iframeDoc.open()
    iframeDoc.write(html)
    iframeDoc.close()

    iframe.onload = () => {
      iframe.contentWindow?.print()
      // Remove iframe after print dialog closes
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    }
  }
}

/**
 * Download report as HTML file (can be opened and printed to PDF)
 */
export function downloadReportHTML(data: LoudnessReportData): void {
  const html = generateReportHTML(data)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `loudness-report-${data.sessionName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Export report data as JSON
 */
export function downloadReportJSON(data: LoudnessReportData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `loudness-report-${data.sessionName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
