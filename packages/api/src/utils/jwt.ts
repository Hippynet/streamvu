import jwt from 'jsonwebtoken'
import type { JwtPayload, GlobalRole, OrgMemberRole } from '@streamvu/shared'
import { config } from '../config/index.js'

export interface TokenPayload {
  sub: string
  email: string
  globalRole: GlobalRole
  organizationId: string
  orgRole: OrgMemberRole
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
  })
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.refreshExpiry as jwt.SignOptions['expiresIn'],
  })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload
}

export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload
  } catch {
    return null
  }
}
