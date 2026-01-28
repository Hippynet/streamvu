/**
 * TemplateManager - Save and recall mixer configurations
 *
 * Allows producers to save complete mixer setups including:
 * - Channel count and names
 * - EQ, compression, gate settings per channel
 * - Bus routing matrix
 * - Aux send levels
 * - Return feed URL
 *
 * Templates are stored in localStorage and can be exported/imported as JSON.
 */

import { useState, useEffect, useCallback } from 'react'

// Template schema version for compatibility
const TEMPLATE_VERSION = 1

export interface ChannelTemplate {
  label: string
  inputGain: number
  eq: {
    hpfEnabled: boolean
    hpfFreq: number
    lowGain: number
    lowFreq: number
    midGain: number
    midFreq: number
    midQ: number
    highGain: number
    highFreq: number
  }
  compressor: {
    enabled: boolean
    threshold: number
    ratio: number
    attack: number
    release: number
    makeupGain: number
  }
  ducking: {
    sourceType: 'voice' | 'music' | 'sfx' | 'none'
    enabled: boolean
    amount: number
    threshold: number
    attack: number
    release: number
  }
  auxSends: [number, number, number, number]
  pan: number
  fader: number
  mute: boolean
  busAssignment: string[]
}

export interface MasterTemplate {
  pgmFader: number
  pgmMute: boolean
  tbFader: number
  tbMute: boolean
  auxMasters: [number, number, number, number]
  limiterEnabled: boolean
  limiterThreshold: number
  monitorSource: string
  monitorLevel: number
}

export interface SessionTemplate {
  id: string
  name: string
  description: string
  version: number
  createdAt: string
  updatedAt: string
  channels: ChannelTemplate[]
  master: MasterTemplate
  returnFeedUrl?: string
  isBuiltIn?: boolean
}

// Built-in templates
const BUILT_IN_TEMPLATES: SessionTemplate[] = [
  {
    id: 'sports-commentary',
    name: 'Sports Commentary',
    description: '2 hosts + 6 contributors, TB routing for coordination',
    version: TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltIn: true,
    channels: [
      {
        label: 'Host 1',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 2, midFreq: 2500, midQ: 1.5, highGain: 1, highFreq: 8000 },
        compressor: { enabled: true, threshold: -18, ratio: 4, attack: 10, release: 100, makeupGain: 3 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.8, 0, 0, 0],
        pan: -0.3,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM', 'TB'],
      },
      {
        label: 'Host 2',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 2, midFreq: 2500, midQ: 1.5, highGain: 1, highFreq: 8000 },
        compressor: { enabled: true, threshold: -18, ratio: 4, attack: 10, release: 100, makeupGain: 3 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.8, 0, 0, 0],
        pan: 0.3,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM', 'TB'],
      },
    ],
    master: {
      pgmFader: 1.0,
      pgmMute: false,
      tbFader: 0.8,
      tbMute: false,
      auxMasters: [0.8, 0.8, 0.8, 0.8],
      limiterEnabled: true,
      limiterThreshold: -3,
      monitorSource: 'PGM',
      monitorLevel: 0.8,
    },
  },
  {
    id: 'interview',
    name: 'Interview',
    description: '1 host + 1 guest, clean setup for dialogue',
    version: TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltIn: true,
    channels: [
      {
        label: 'Host',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 100, lowGain: -2, lowFreq: 100, midGain: 0, midFreq: 1000, midQ: 1.5, highGain: 2, highFreq: 8000 },
        compressor: { enabled: true, threshold: -20, ratio: 3, attack: 15, release: 150, makeupGain: 2 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.5, 0, 0, 0],
        pan: -0.2,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM'],
      },
      {
        label: 'Guest',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 0, midFreq: 1000, midQ: 1.5, highGain: 0, highFreq: 8000 },
        compressor: { enabled: true, threshold: -20, ratio: 3, attack: 15, release: 150, makeupGain: 2 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.5, 0, 0, 0],
        pan: 0.2,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM'],
      },
    ],
    master: {
      pgmFader: 1.0,
      pgmMute: false,
      tbFader: 0.8,
      tbMute: false,
      auxMasters: [0.8, 0.8, 0.8, 0.8],
      limiterEnabled: true,
      limiterThreshold: -3,
      monitorSource: 'PGM',
      monitorLevel: 0.8,
    },
  },
  {
    id: 'panel-discussion',
    name: 'Panel Discussion',
    description: '1 moderator + 4 panelists with ducking on music bed',
    version: TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltIn: true,
    channels: [
      {
        label: 'Moderator',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 1, midFreq: 2000, midQ: 1.5, highGain: 1, highFreq: 8000 },
        compressor: { enabled: true, threshold: -18, ratio: 4, attack: 10, release: 100, makeupGain: 3 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.8, 0, 0, 0],
        pan: 0,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM', 'TB'],
      },
    ],
    master: {
      pgmFader: 1.0,
      pgmMute: false,
      tbFader: 0.8,
      tbMute: false,
      auxMasters: [0.8, 0.8, 0.8, 0.8],
      limiterEnabled: true,
      limiterThreshold: -3,
      monitorSource: 'PGM',
      monitorLevel: 0.8,
    },
  },
  {
    id: 'music-show',
    name: 'Music Show',
    description: 'Host + music bed + phone-ins with ducking',
    version: TEMPLATE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isBuiltIn: true,
    channels: [
      {
        label: 'Host',
        inputGain: 0,
        eq: { hpfEnabled: true, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 2, midFreq: 3000, midQ: 1.5, highGain: 2, highFreq: 8000 },
        compressor: { enabled: true, threshold: -16, ratio: 5, attack: 8, release: 80, makeupGain: 4 },
        ducking: { sourceType: 'voice', enabled: false, amount: -12, threshold: 0.1, attack: 10, release: 500 },
        auxSends: [0.5, 0, 0, 0],
        pan: 0,
        fader: 1.0,
        mute: false,
        busAssignment: ['PGM'],
      },
      {
        label: 'Music Bed',
        inputGain: -6,
        eq: { hpfEnabled: false, hpfFreq: 80, lowGain: 0, lowFreq: 100, midGain: 0, midFreq: 1000, midQ: 1.5, highGain: 0, highFreq: 8000 },
        compressor: { enabled: false, threshold: -20, ratio: 4, attack: 10, release: 100, makeupGain: 0 },
        ducking: { sourceType: 'music', enabled: true, amount: -12, threshold: 0.15, attack: 10, release: 500 },
        auxSends: [0, 0, 0, 0],
        pan: 0,
        fader: 0.7,
        mute: false,
        busAssignment: ['PGM'],
      },
    ],
    master: {
      pgmFader: 1.0,
      pgmMute: false,
      tbFader: 0.8,
      tbMute: false,
      auxMasters: [0.8, 0.8, 0.8, 0.8],
      limiterEnabled: true,
      limiterThreshold: -3,
      monitorSource: 'PGM',
      monitorLevel: 0.8,
    },
  },
]

const STORAGE_KEY = 'streamvu-session-templates'

function loadTemplates(): SessionTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return [...BUILT_IN_TEMPLATES, ...JSON.parse(stored)]
    }
  } catch {
    console.error('Failed to load templates from localStorage')
  }
  return BUILT_IN_TEMPLATES
}

function saveTemplates(templates: SessionTemplate[]) {
  try {
    // Only save user templates, not built-in
    const userTemplates = templates.filter(t => !t.isBuiltIn)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userTemplates))
  } catch {
    console.error('Failed to save templates to localStorage')
  }
}

interface TemplateManagerProps {
  isOpen: boolean
  onClose: () => void
  onApplyTemplate: (template: SessionTemplate) => void
  onSaveCurrentAsTemplate: () => SessionTemplate | null
  currentTemplate?: SessionTemplate
}

export function TemplateManager({
  isOpen,
  onClose,
  onApplyTemplate,
  onSaveCurrentAsTemplate,
  currentTemplate,
}: TemplateManagerProps) {
  const [templates, setTemplates] = useState<SessionTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<SessionTemplate | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDescription, setNewTemplateDescription] = useState('')

  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  const handleSaveTemplate = useCallback(() => {
    if (!newTemplateName.trim()) return

    const templateData = onSaveCurrentAsTemplate()
    if (!templateData) return

    const newTemplate: SessionTemplate = {
      ...templateData,
      id: `user-${Date.now()}`,
      name: newTemplateName.trim(),
      description: newTemplateDescription.trim(),
      version: TEMPLATE_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBuiltIn: false,
    }

    const updatedTemplates = [...templates, newTemplate]
    setTemplates(updatedTemplates)
    saveTemplates(updatedTemplates)

    setShowSaveDialog(false)
    setNewTemplateName('')
    setNewTemplateDescription('')
  }, [newTemplateName, newTemplateDescription, templates, onSaveCurrentAsTemplate])

  const handleDeleteTemplate = useCallback((templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template?.isBuiltIn) return

    const updatedTemplates = templates.filter(t => t.id !== templateId)
    setTemplates(updatedTemplates)
    saveTemplates(updatedTemplates)

    if (selectedTemplate?.id === templateId) {
      setSelectedTemplate(null)
    }
  }, [templates, selectedTemplate])

  const handleExportTemplate = useCallback((template: SessionTemplate) => {
    const exportData = { ...template, isBuiltIn: undefined }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.name.toLowerCase().replace(/\s+/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleImportTemplate = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string) as SessionTemplate
        if (!imported.name || !imported.channels || !imported.master) {
          throw new Error('Invalid template format')
        }

        const newTemplate: SessionTemplate = {
          ...imported,
          id: `imported-${Date.now()}`,
          isBuiltIn: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const updatedTemplates = [...templates, newTemplate]
        setTemplates(updatedTemplates)
        saveTemplates(updatedTemplates)
      } catch {
        alert('Failed to import template. Invalid format.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [templates])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-lg border border-gray-700 bg-gray-900 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-white">Session Templates</h2>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded border border-gray-600 bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700">
              Import
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportTemplate}
              />
            </label>
            <button
              onClick={() => setShowSaveDialog(true)}
              className="rounded border border-primary-600 bg-primary-600/20 px-2 py-1 text-xs text-primary-400 hover:bg-primary-600/30"
            >
              Save Current
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {showSaveDialog ? (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-white">Save Current Setup as Template</h3>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Template Name</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="My Custom Setup"
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Description (optional)</label>
                <textarea
                  value={newTemplateDescription}
                  onChange={(e) => setNewTemplateDescription(e.target.value)}
                  placeholder="Describe this setup..."
                  rows={2}
                  className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveTemplate}
                  disabled={!newTemplateName.trim()}
                  className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-500 disabled:opacity-50"
                >
                  Save Template
                </button>
                <button
                  onClick={() => {
                    setShowSaveDialog(false)
                    setNewTemplateName('')
                    setNewTemplateDescription('')
                  }}
                  className="rounded bg-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`cursor-pointer rounded border p-3 transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'border-primary-500 bg-primary-900/20'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  }`}
                  onClick={() => setSelectedTemplate(template)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">{template.name}</h3>
                        {template.isBuiltIn && (
                          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[9px] text-gray-400">
                            Built-in
                          </span>
                        )}
                        {currentTemplate?.id === template.id && (
                          <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-[9px] text-green-400">
                            Active
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="mt-1 text-xs text-gray-400">{template.description}</p>
                      )}
                      <p className="mt-2 text-[10px] text-gray-500">
                        {template.channels.length} channel{template.channels.length !== 1 ? 's' : ''}
                        {' | '}
                        Updated {new Date(template.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExportTemplate(template)
                        }}
                        className="rounded p-1 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
                        title="Export"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                      </button>
                      {!template.isBuiltIn && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTemplate(template.id)
                          }}
                          className="rounded p-1 text-gray-500 hover:bg-red-900/50 hover:text-red-400"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!showSaveDialog && selectedTemplate && (
          <div className="border-t border-gray-700 px-4 py-3">
            <button
              onClick={() => {
                onApplyTemplate(selectedTemplate)
                onClose()
              }}
              className="w-full rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
            >
              Apply "{selectedTemplate.name}"
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Hook for using templates
export function useSessionTemplates() {
  const [templates, setTemplates] = useState<SessionTemplate[]>([])

  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  const refresh = useCallback(() => {
    setTemplates(loadTemplates())
  }, [])

  const save = useCallback((template: SessionTemplate) => {
    const updatedTemplates = templates.some(t => t.id === template.id)
      ? templates.map(t => t.id === template.id ? template : t)
      : [...templates, template]
    setTemplates(updatedTemplates)
    saveTemplates(updatedTemplates)
  }, [templates])

  const remove = useCallback((templateId: string) => {
    const updatedTemplates = templates.filter(t => t.id !== templateId)
    setTemplates(updatedTemplates)
    saveTemplates(updatedTemplates)
  }, [templates])

  return {
    templates,
    builtInTemplates: BUILT_IN_TEMPLATES,
    refresh,
    save,
    remove,
  }
}

export default TemplateManager
