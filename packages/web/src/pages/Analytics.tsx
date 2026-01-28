/**
 * Analytics Dashboard
 *
 * Comprehensive analytics and reporting for broadcast operations.
 * Displays:
 * - Key performance indicators
 * - Connection quality trends
 * - Usage patterns by hour/day
 * - Top contributors by reliability
 * - Recent issues and errors
 * - Session history
 */

import { useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// =============================================================================
// Types
// =============================================================================

interface DashboardSummary {
  period: {
    start: string
    end: string
  }
  totalSessions: number
  totalParticipants: number
  totalDuration: number
  avgSessionDuration: number
  avgQualityScore: number
  totalIssues: number
  issueRate: number
  topContributors: ContributorStats[]
  usageByHour: UsagePattern[]
  usageByDay: UsagePattern[]
  recentIssues: SessionIssue[]
  qualityTrend: Array<{ date: string; avgScore: number }>
}

interface ContributorStats {
  participantId: string
  participantName: string
  sessionCount: number
  totalDuration: number
  avgSessionDuration: number
  avgQualityScore: number
  reliabilityScore: number
  issueCount: number
  lastActive: string
}

interface UsagePattern {
  period: string
  sessionCount: number
  participantCount: number
  totalDuration: number
  avgDuration: number
  peakConcurrent: number
}

interface SessionIssue {
  timestamp: string
  type: string
  participantId?: string
  participantName?: string
  description: string
  duration?: number
  resolved: boolean
}

// =============================================================================
// Sample Data (for demo - replace with API calls)
// =============================================================================

const sampleData: DashboardSummary = {
  period: {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
  },
  totalSessions: 247,
  totalParticipants: 89,
  totalDuration: 156.5,
  avgSessionDuration: 38,
  avgQualityScore: 4.2,
  totalIssues: 12,
  issueRate: 0.08,
  topContributors: [
    {
      participantId: '1',
      participantName: 'John Smith',
      sessionCount: 45,
      totalDuration: 28800,
      avgSessionDuration: 640,
      avgQualityScore: 4.8,
      reliabilityScore: 98,
      issueCount: 1,
      lastActive: new Date().toISOString(),
    },
    {
      participantId: '2',
      participantName: 'Sarah Johnson',
      sessionCount: 38,
      totalDuration: 25200,
      avgSessionDuration: 663,
      avgQualityScore: 4.6,
      reliabilityScore: 95,
      issueCount: 2,
      lastActive: new Date().toISOString(),
    },
    {
      participantId: '3',
      participantName: 'Mike Williams',
      sessionCount: 32,
      totalDuration: 19200,
      avgSessionDuration: 600,
      avgQualityScore: 4.5,
      reliabilityScore: 92,
      issueCount: 3,
      lastActive: new Date().toISOString(),
    },
    {
      participantId: '4',
      participantName: 'Emily Brown',
      sessionCount: 28,
      totalDuration: 16800,
      avgSessionDuration: 600,
      avgQualityScore: 4.3,
      reliabilityScore: 88,
      issueCount: 4,
      lastActive: new Date().toISOString(),
    },
    {
      participantId: '5',
      participantName: 'David Lee',
      sessionCount: 25,
      totalDuration: 15000,
      avgSessionDuration: 600,
      avgQualityScore: 4.1,
      reliabilityScore: 85,
      issueCount: 5,
      lastActive: new Date().toISOString(),
    },
  ],
  usageByHour: Array.from({ length: 24 }, (_, i) => ({
    period: `${i.toString().padStart(2, '0')}:00`,
    sessionCount: Math.floor(Math.random() * 20) + (i >= 9 && i <= 18 ? 10 : 2),
    participantCount: Math.floor(Math.random() * 50) + (i >= 9 && i <= 18 ? 20 : 5),
    totalDuration: Math.floor(Math.random() * 7200),
    avgDuration: Math.floor(Math.random() * 3600),
    peakConcurrent: Math.floor(Math.random() * 15) + (i >= 9 && i <= 18 ? 5 : 1),
  })),
  usageByDay: [
    { period: 'Sunday', sessionCount: 12, participantCount: 25, totalDuration: 7200, avgDuration: 600, peakConcurrent: 8 },
    { period: 'Monday', sessionCount: 45, participantCount: 82, totalDuration: 28800, avgDuration: 640, peakConcurrent: 18 },
    { period: 'Tuesday', sessionCount: 52, participantCount: 95, totalDuration: 32400, avgDuration: 623, peakConcurrent: 22 },
    { period: 'Wednesday', sessionCount: 48, participantCount: 88, totalDuration: 30000, avgDuration: 625, peakConcurrent: 20 },
    { period: 'Thursday', sessionCount: 50, participantCount: 90, totalDuration: 31200, avgDuration: 624, peakConcurrent: 21 },
    { period: 'Friday', sessionCount: 35, participantCount: 68, totalDuration: 21600, avgDuration: 617, peakConcurrent: 15 },
    { period: 'Saturday', sessionCount: 8, participantCount: 18, totalDuration: 4800, avgDuration: 600, peakConcurrent: 6 },
  ],
  recentIssues: [
    {
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      type: 'high_latency',
      participantName: 'Remote Studio A',
      description: 'High latency detected (RTT: 450ms)',
      resolved: true,
      duration: 120,
    },
    {
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      type: 'packet_loss',
      participantName: 'Field Reporter',
      description: 'Packet loss spike (8%)',
      resolved: true,
      duration: 45,
    },
    {
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      type: 'connection_lost',
      participantName: 'Guest Speaker',
      description: 'Connection dropped during live broadcast',
      resolved: true,
      duration: 30,
    },
  ],
  qualityTrend: Array.from({ length: 30 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (29 - i))
    return {
      date: date.toISOString().slice(0, 10),
      avgScore: 3.8 + Math.random() * 1.2,
    }
  }),
}

// =============================================================================
// Components
// =============================================================================

function KPICard({
  title,
  value,
  unit,
  trend,
  color = 'blue',
}: {
  title: string
  value: string | number
  unit?: string
  trend?: number
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
}) {
  const colorClasses = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    green: 'bg-green-500/20 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/20 border-red-500/30 text-red-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
  }

  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="text-sm opacity-75">{title}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        {unit && <span className="text-sm opacity-75">{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className={`mt-1 text-xs ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? '+' : ''}{trend.toFixed(1)}% vs last period
        </div>
      )}
    </div>
  )
}

function QualityScoreBadge({ score }: { score: number }) {
  let color = 'bg-green-500'
  let label = 'Excellent'

  if (score < 2) {
    color = 'bg-red-500'
    label = 'Poor'
  } else if (score < 3) {
    color = 'bg-orange-500'
    label = 'Fair'
  } else if (score < 4) {
    color = 'bg-yellow-500'
    label = 'Good'
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-sm">{score.toFixed(1)}</span>
      <span className="text-xs text-gray-400">({label})</span>
    </div>
  )
}

function ReliabilityBadge({ score }: { score: number }) {
  let color = 'text-green-400 bg-green-500/20'

  if (score < 70) {
    color = 'text-red-400 bg-red-500/20'
  } else if (score < 85) {
    color = 'text-yellow-400 bg-yellow-500/20'
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {score}%
    </span>
  )
}

function IssueTypeBadge({ type }: { type: string }) {
  const typeColors: Record<string, string> = {
    connection_lost: 'text-red-400 bg-red-500/20',
    high_latency: 'text-yellow-400 bg-yellow-500/20',
    packet_loss: 'text-orange-400 bg-orange-500/20',
    audio_dropout: 'text-purple-400 bg-purple-500/20',
    codec_error: 'text-blue-400 bg-blue-500/20',
  }

  const labels: Record<string, string> = {
    connection_lost: 'Connection Lost',
    high_latency: 'High Latency',
    packet_loss: 'Packet Loss',
    audio_dropout: 'Audio Dropout',
    codec_error: 'Codec Error',
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[type] || 'text-gray-400 bg-gray-500/20'}`}>
      {labels[type] || type}
    </span>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export default function Analytics() {
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodDays, setPeriodDays] = useState(30)
  const [activeTab, setActiveTab] = useState<'overview' | 'contributors' | 'usage' | 'issues'>('overview')

  useEffect(() => {
    // In production, fetch from API:
    // const response = await fetch(`/api/analytics/dashboard?days=${periodDays}`)
    // const data = await response.json()
    // setData(data)

    // For demo, use sample data
    setLoading(true)
    setTimeout(() => {
      setData(sampleData)
      setLoading(false)
    }, 500)
  }, [periodDays])

  if (loading || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    )
  }

  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics Dashboard</h1>
          <p className="text-gray-400">
            {new Date(data.period.start).toLocaleDateString()} - {new Date(data.period.end).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="rounded bg-gray-800 px-3 py-2 text-sm text-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Export Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-800 p-1">
        {(['overview', 'contributors', 'usage', 'issues'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              title="Total Sessions"
              value={data.totalSessions}
              color="blue"
              trend={12.5}
            />
            <KPICard
              title="Total Participants"
              value={data.totalParticipants}
              color="green"
              trend={8.3}
            />
            <KPICard
              title="Total Broadcast Time"
              value={data.totalDuration.toFixed(1)}
              unit="hours"
              color="purple"
              trend={15.2}
            />
            <KPICard
              title="Avg Quality Score"
              value={data.avgQualityScore.toFixed(1)}
              unit="/ 5"
              color={data.avgQualityScore >= 4 ? 'green' : data.avgQualityScore >= 3 ? 'yellow' : 'red'}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Quality Trend */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-4 text-lg font-medium text-white">Quality Score Trend</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.qualityTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickFormatter={(value: string) => value.slice(5)}
                    />
                    <YAxis
                      domain={[1, 5]}
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="avgScore"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Usage by Day */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-4 text-lg font-medium text-white">Sessions by Day of Week</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.usageByDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="period"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickFormatter={(value: string) => value.slice(0, 3)}
                    />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="sessionCount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Issues */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h3 className="mb-4 text-lg font-medium text-white">Recent Issues</h3>
            {data.recentIssues.length === 0 ? (
              <p className="text-center text-gray-400">No recent issues</p>
            ) : (
              <div className="space-y-2">
                {data.recentIssues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-gray-700 bg-gray-900 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <IssueTypeBadge type={issue.type} />
                      <div>
                        <div className="text-sm text-white">{issue.description}</div>
                        <div className="text-xs text-gray-400">
                          {issue.participantName} - {new Date(issue.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {issue.duration && (
                        <span className="text-xs text-gray-400">
                          Duration: {issue.duration}s
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          issue.resolved
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {issue.resolved ? 'Resolved' : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contributors Tab */}
      {activeTab === 'contributors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Top Contributors List */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 lg:col-span-2">
              <h3 className="mb-4 text-lg font-medium text-white">Top Contributors</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-400">
                      <th className="pb-3">Contributor</th>
                      <th className="pb-3">Sessions</th>
                      <th className="pb-3">Total Time</th>
                      <th className="pb-3">Quality</th>
                      <th className="pb-3">Reliability</th>
                      <th className="pb-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topContributors.map((contributor, i) => (
                      <tr key={contributor.participantId} className="border-t border-gray-700">
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-sm font-medium text-white">
                              {i + 1}
                            </div>
                            <span className="text-white">{contributor.participantName}</span>
                          </div>
                        </td>
                        <td className="py-3 text-gray-300">{contributor.sessionCount}</td>
                        <td className="py-3 text-gray-300">
                          {Math.round(contributor.totalDuration / 3600)}h
                        </td>
                        <td className="py-3">
                          <QualityScoreBadge score={contributor.avgQualityScore} />
                        </td>
                        <td className="py-3">
                          <ReliabilityBadge score={contributor.reliabilityScore} />
                        </td>
                        <td className="py-3 text-gray-300">{contributor.issueCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Reliability Distribution */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-4 text-lg font-medium text-white">Reliability Distribution</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Excellent (90+)', value: 3, color: '#10b981' },
                        { name: 'Good (80-89)', value: 5, color: '#3b82f6' },
                        { name: 'Fair (70-79)', value: 2, color: '#f59e0b' },
                        { name: 'Poor (<70)', value: 1, color: '#ef4444' },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {CHART_COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                      labelStyle={{ color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Usage Tab */}
      {activeTab === 'usage' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              title="Avg Session Duration"
              value={data.avgSessionDuration}
              unit="min"
              color="blue"
            />
            <KPICard
              title="Peak Concurrent"
              value={Math.max(...data.usageByHour.map(u => u.peakConcurrent))}
              unit="participants"
              color="purple"
            />
            <KPICard
              title="Busiest Day"
              value={data.usageByDay.reduce((a, b) => a.sessionCount > b.sessionCount ? a : b).period}
              color="green"
            />
            <KPICard
              title="Busiest Hour"
              value={data.usageByHour.reduce((a, b) => a.sessionCount > b.sessionCount ? a : b).period}
              color="yellow"
            />
          </div>

          {/* Hourly Usage */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h3 className="mb-4 text-lg font-medium text-white">Sessions by Hour</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.usageByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="sessionCount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Peak Concurrent by Hour */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h3 className="mb-4 text-lg font-medium text-white">Peak Concurrent Participants by Hour</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.usageByHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="period"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="peakConcurrent"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Issues Tab */}
      {activeTab === 'issues' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              title="Total Issues"
              value={data.totalIssues}
              color="red"
            />
            <KPICard
              title="Issue Rate"
              value={data.issueRate.toFixed(2)}
              unit="per hour"
              color={data.issueRate < 0.1 ? 'green' : 'yellow'}
            />
            <KPICard
              title="Resolved Issues"
              value={data.recentIssues.filter(i => i.resolved).length}
              color="green"
            />
            <KPICard
              title="Active Issues"
              value={data.recentIssues.filter(i => !i.resolved).length}
              color={data.recentIssues.filter(i => !i.resolved).length === 0 ? 'green' : 'red'}
            />
          </div>

          {/* Issue Types Breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-4 text-lg font-medium text-white">Issues by Type</h3>
              <div className="space-y-4">
                {[
                  { type: 'high_latency', count: 5, label: 'High Latency' },
                  { type: 'packet_loss', count: 4, label: 'Packet Loss' },
                  { type: 'connection_lost', count: 2, label: 'Connection Lost' },
                  { type: 'audio_dropout', count: 1, label: 'Audio Dropout' },
                ].map((item) => (
                  <div key={item.type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IssueTypeBadge type={item.type} />
                      <span className="text-gray-300">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-700">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${(item.count / 5) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-400">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h3 className="mb-4 text-lg font-medium text-white">Resolution Time</h3>
              <div className="flex h-48 items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl font-bold text-white">45s</div>
                  <div className="text-gray-400">Average resolution time</div>
                </div>
              </div>
            </div>
          </div>

          {/* All Issues */}
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
            <h3 className="mb-4 text-lg font-medium text-white">All Recent Issues</h3>
            {data.recentIssues.length === 0 ? (
              <p className="py-8 text-center text-gray-400">No issues recorded</p>
            ) : (
              <div className="space-y-2">
                {data.recentIssues.map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-gray-700 bg-gray-900 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <IssueTypeBadge type={issue.type} />
                      <div>
                        <div className="text-sm text-white">{issue.description}</div>
                        <div className="text-xs text-gray-400">
                          {issue.participantName && `${issue.participantName} - `}
                          {new Date(issue.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {issue.duration !== undefined && (
                        <span className="text-xs text-gray-400">
                          Duration: {issue.duration}s
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          issue.resolved
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {issue.resolved ? 'Resolved' : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
