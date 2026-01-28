import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Organization, OrganizationMember, OrgMemberRole } from '@streamvu/shared'

interface OrgSummary {
  id: string
  name: string
  slug: string
  role: OrgMemberRole
}

interface OrganizationState {
  // Current organization details
  currentOrganization: Organization | null
  currentOrgRole: OrgMemberRole | null

  // List of user's organizations (for switcher)
  organizations: OrgSummary[]

  // Members of current organization
  members: OrganizationMember[]

  // Actions
  setCurrentOrganization: (org: Organization, role: OrgMemberRole) => void
  setOrganizations: (orgs: OrgSummary[]) => void
  setMembers: (members: OrganizationMember[]) => void
  switchOrganization: (orgId: string) => OrgSummary | undefined
  clearOrganization: () => void
}

export const useOrganizationStore = create<OrganizationState>()(
  persist(
    (set, get) => ({
      currentOrganization: null,
      currentOrgRole: null,
      organizations: [],
      members: [],

      setCurrentOrganization: (org, role) =>
        set({
          currentOrganization: org,
          currentOrgRole: role,
        }),

      setOrganizations: (orgs) =>
        set({
          organizations: orgs,
        }),

      setMembers: (members) =>
        set({
          members,
        }),

      switchOrganization: (orgId) => {
        const orgs = get().organizations
        const targetOrg = orgs.find((o) => o.id === orgId)
        if (targetOrg) {
          // Clear current org details - will be refetched
          set({
            currentOrganization: null,
            currentOrgRole: targetOrg.role,
            members: [],
          })
        }
        return targetOrg
      },

      clearOrganization: () =>
        set({
          currentOrganization: null,
          currentOrgRole: null,
          organizations: [],
          members: [],
        }),
    }),
    {
      name: 'streamvu-organization',
      partialize: (state) => ({
        organizations: state.organizations,
        currentOrgRole: state.currentOrgRole,
      }),
    }
  )
)
