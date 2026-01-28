/**
 * TranscriptionConfigPanel
 *
 * Configuration panel for transcription service integration.
 * Supports Whisper, AssemblyAI, Deepgram, AWS, and Google.
 */

import { useState, useEffect } from 'react'
import type { TranscriptionProvider } from '@streamvu/shared'

interface TranscriptionConfig {
  id: string
  provider: TranscriptionProvider
  name: string
  enabled: boolean
  isDefault: boolean
  language?: string
  autoDetectLanguage: boolean
  enableSpeakerDiarization: boolean
  maxSpeakers?: number
  enablePunctuation: boolean
  enableProfanityFilter: boolean
  customVocabulary: string[]
}

interface TranscriptionFormData {
  provider: TranscriptionProvider
  name: string
  enabled: boolean
  isDefault: boolean
  apiKey?: string
  apiUrl?: string
  model?: string
  language?: string
  autoDetectLanguage: boolean
  enableSpeakerDiarization: boolean
  maxSpeakers?: number
  enablePunctuation: boolean
  enableProfanityFilter: boolean
  customVocabulary: string[]
}

interface TranscriptionConfigPanelProps {
  configs?: TranscriptionConfig[]
  onSave?: (config: TranscriptionFormData) => Promise<void>
  onUpdate?: (configId: string, config: TranscriptionFormData) => Promise<void>
  onDelete?: (configId: string) => Promise<void>
  loading?: boolean
}

const PROVIDERS: {
  value: TranscriptionProvider
  label: string
  description: string
  models?: string[]
}[] = [
  {
    value: 'whisper',
    label: 'OpenAI Whisper',
    description: 'High accuracy, multilingual',
    models: ['whisper-1'],
  },
  {
    value: 'assemblyai',
    label: 'AssemblyAI',
    description: 'Real-time capable, speaker labels',
    models: ['best', 'nano'],
  },
  {
    value: 'deepgram',
    label: 'Deepgram',
    description: 'Fast processing, streaming',
    models: ['nova-2', 'nova', 'enhanced', 'base'],
  },
  {
    value: 'aws',
    label: 'Amazon Transcribe',
    description: 'AWS integration, custom vocab',
  },
  {
    value: 'google',
    label: 'Google Speech-to-Text',
    description: 'GCP integration, 120+ languages',
  },
]

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
]

export function TranscriptionConfigPanel({
  configs = [],
  onSave,
  onUpdate,
  onDelete,
  loading = false,
}: TranscriptionConfigPanelProps) {
  const [editingConfig, setEditingConfig] = useState<string | 'new' | null>(null)
  const [formData, setFormData] = useState<TranscriptionFormData>({
    provider: 'whisper',
    name: '',
    enabled: true,
    isDefault: false,
    autoDetectLanguage: true,
    enableSpeakerDiarization: false,
    enablePunctuation: true,
    enableProfanityFilter: false,
    customVocabulary: [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vocabularyInput, setVocabularyInput] = useState('')

  // Reset form when closing
  useEffect(() => {
    if (!editingConfig) {
      setFormData({
        provider: 'whisper',
        name: '',
        enabled: true,
        isDefault: false,
        autoDetectLanguage: true,
        enableSpeakerDiarization: false,
        enablePunctuation: true,
        enableProfanityFilter: false,
        customVocabulary: [],
      })
      setVocabularyInput('')
      setError(null)
    }
  }, [editingConfig])

  const handleSave = async () => {
    if (!formData.name || !formData.apiKey) {
      setError('Please fill in all required fields')
      return
    }

    setSaving(true)
    setError(null)
    try {
      if (editingConfig === 'new' && onSave) {
        await onSave(formData)
      } else if (editingConfig && onUpdate) {
        await onUpdate(editingConfig, formData)
      }
      setEditingConfig(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (configId: string) => {
    if (!onDelete) return
    if (!confirm('Are you sure you want to delete this transcription configuration?')) return
    try {
      await onDelete(configId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    }
  }

  const addVocabularyTerm = () => {
    const term = vocabularyInput.trim()
    if (term && !formData.customVocabulary.includes(term)) {
      setFormData((prev) => ({
        ...prev,
        customVocabulary: [...prev.customVocabulary, term],
      }))
      setVocabularyInput('')
    }
  }

  const removeVocabularyTerm = (term: string) => {
    setFormData((prev) => ({
      ...prev,
      customVocabulary: prev.customVocabulary.filter((t) => t !== term),
    }))
  }

  const selectedProvider = PROVIDERS.find((p) => p.value === formData.provider)

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Transcription</h3>
          <p className="text-sm text-gray-400">
            Configure automatic transcription for recordings
          </p>
        </div>
        {!editingConfig && (
          <button
            className="btn btn-primary text-sm"
            onClick={() => setEditingConfig('new')}
          >
            Add Provider
          </button>
        )}
      </div>

      {/* Existing Configs */}
      {!editingConfig && configs.length > 0 && (
        <div className="space-y-2">
          {configs.map((config) => (
            <div
              key={config.id}
              className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 p-4"
            >
              <div className="flex items-center gap-4">
                <div className={`h-3 w-3 rounded-full ${config.enabled ? 'bg-green-500' : 'bg-gray-500'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{config.name}</span>
                    {config.isDefault && (
                      <span className="rounded bg-primary-900/50 px-2 py-0.5 text-xs text-primary-400">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400">
                    {PROVIDERS.find((p) => p.value === config.provider)?.label || config.provider}
                    {config.language && !config.autoDetectLanguage && ` • ${LANGUAGES.find((l) => l.code === config.language)?.label || config.language}`}
                    {config.enableSpeakerDiarization && ' • Speaker labels'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded px-3 py-1 text-sm text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                  onClick={() => {
                    setFormData({
                      provider: config.provider,
                      name: config.name,
                      enabled: config.enabled,
                      isDefault: config.isDefault,
                      language: config.language,
                      autoDetectLanguage: config.autoDetectLanguage,
                      enableSpeakerDiarization: config.enableSpeakerDiarization,
                      maxSpeakers: config.maxSpeakers,
                      enablePunctuation: config.enablePunctuation,
                      enableProfanityFilter: config.enableProfanityFilter,
                      customVocabulary: config.customVocabulary,
                    })
                    setEditingConfig(config.id)
                  }}
                >
                  Edit
                </button>
                <button
                  className="rounded px-3 py-1 text-sm text-red-400 transition-colors hover:bg-red-900/30 hover:text-red-300"
                  onClick={() => handleDelete(config.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!editingConfig && configs.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="mt-2 text-gray-400">No transcription configured</p>
          <p className="text-sm text-gray-500">
            Add a transcription provider for automatic captions
          </p>
        </div>
      )}

      {/* Edit/Create Form */}
      {editingConfig && (
        <div className="space-y-4 rounded-lg border border-gray-700 bg-gray-800/30 p-4">
          <h4 className="font-medium text-white">
            {editingConfig === 'new' ? 'Add Transcription Provider' : 'Edit Configuration'}
          </h4>

          {/* Provider Selection */}
          <div>
            <label className="label">Provider *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.value}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    formData.provider === provider.value
                      ? 'border-primary-500 bg-primary-900/30'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                  onClick={() => setFormData({ ...formData, provider: provider.value, model: undefined })}
                >
                  <span className="block text-sm font-medium text-white">{provider.label}</span>
                  <span className="block text-xs text-gray-400">{provider.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name and API Key */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Configuration Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Production Transcription"
              />
            </div>
            <div>
              <label className="label">API Key *</label>
              <input
                type="password"
                className="input font-mono"
                value={formData.apiKey || ''}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </div>
          </div>

          {/* Model Selection (if available) */}
          {selectedProvider?.models && (
            <div>
              <label className="label">Model</label>
              <select
                className="input"
                value={formData.model || ''}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              >
                <option value="">Default</option>
                {selectedProvider.models.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          )}

          {/* Language Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Language</label>
              <select
                className="input"
                value={formData.language || ''}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                disabled={formData.autoDetectLanguage}
              >
                <option value="">Auto-detect</option>
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                  checked={formData.autoDetectLanguage}
                  onChange={(e) => setFormData({ ...formData, autoDetectLanguage: e.target.checked })}
                />
                <span className="text-sm text-gray-300">Auto-detect language</span>
              </label>
            </div>
          </div>

          {/* Speaker Diarization */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.enableSpeakerDiarization}
                onChange={(e) => setFormData({ ...formData, enableSpeakerDiarization: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Enable speaker labels</span>
            </label>
            {formData.enableSpeakerDiarization && (
              <div>
                <label className="label">Max Speakers</label>
                <input
                  type="number"
                  className="input"
                  min={2}
                  max={10}
                  value={formData.maxSpeakers || ''}
                  onChange={(e) => setFormData({ ...formData, maxSpeakers: parseInt(e.target.value) || undefined })}
                  placeholder="Auto"
                />
              </div>
            )}
          </div>

          {/* Other Options */}
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.enablePunctuation}
                onChange={(e) => setFormData({ ...formData, enablePunctuation: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Add punctuation</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.enableProfanityFilter}
                onChange={(e) => setFormData({ ...formData, enableProfanityFilter: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Filter profanity</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Enabled</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Set as default</span>
            </label>
          </div>

          {/* Custom Vocabulary */}
          <div>
            <label className="label">Custom Vocabulary</label>
            <p className="mb-2 text-xs text-gray-500">
              Add words or phrases that may be transcribed incorrectly (names, jargon, etc.)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1"
                value={vocabularyInput}
                onChange={(e) => setVocabularyInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addVocabularyTerm())}
                placeholder="Add a word or phrase..."
              />
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={addVocabularyTerm}
              >
                Add
              </button>
            </div>
            {formData.customVocabulary.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {formData.customVocabulary.map((term) => (
                  <span
                    key={term}
                    className="flex items-center gap-1 rounded bg-gray-700 px-2 py-1 text-sm text-gray-300"
                  >
                    {term}
                    <button
                      type="button"
                      className="text-gray-400 hover:text-white"
                      onClick={() => removeVocabularyTerm(term)}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-700 bg-red-900/30 p-3 text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              className="btn btn-secondary text-sm"
              onClick={() => setEditingConfig(null)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary text-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
