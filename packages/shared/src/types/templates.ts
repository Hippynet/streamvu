/**
 * Session Template Types
 *
 * Types for saving and recalling complete mixer configurations.
 */

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

export interface TemplateConfig {
  channels: ChannelTemplate[]
  master: MasterTemplate
  returnFeedUrl?: string
}

export type TemplateCategory =
  | 'SPORTS'
  | 'INTERVIEW'
  | 'PANEL'
  | 'MUSIC'
  | 'NEWS'
  | 'CUSTOM'

export interface SessionTemplate {
  id: string
  organizationId: string
  name: string
  description: string | null
  category: TemplateCategory
  isBuiltIn: boolean
  config: TemplateConfig
  channelCount: number
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  category?: TemplateCategory
  config: TemplateConfig
}

export interface UpdateTemplateRequest {
  name?: string
  description?: string
  category?: TemplateCategory
  config?: TemplateConfig
}
