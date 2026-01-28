import type { Request, Response, NextFunction } from 'express'
import { API_ERROR_CODES, GlobalRole, OrgMemberRole, type JwtPayload } from '@streamvu/shared'
import { verifyToken } from '../utils/jwt.js'
import { AppError } from './errorHandler.js'

// Express Request type augmentation
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'No token provided')
  }

  const token = authHeader.slice(7)

  try {
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      throw new AppError(401, API_ERROR_CODES.TOKEN_EXPIRED, 'Token has expired')
    }
    throw new AppError(401, API_ERROR_CODES.INVALID_TOKEN, 'Invalid token')
  }
}

/**
 * Require user to have one of the specified global roles
 */
export function requireGlobalRole(...roles: GlobalRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
    }

    if (!roles.includes(req.user.globalRole)) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Insufficient permissions')
    }

    next()
  }
}

/**
 * Require user to have one of the specified org roles in their current organization
 */
export function requireOrgRole(...roles: OrgMemberRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
    }

    // Super admins bypass org role checks
    if (req.user.globalRole === GlobalRole.SUPER_ADMIN) {
      next()
      return
    }

    if (!roles.includes(req.user.orgRole)) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Insufficient organization permissions')
    }

    next()
  }
}

/**
 * Require organization admin (OWNER or ADMIN role)
 */
export function requireOrgAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
  }

  // Super admins bypass org role checks
  if (req.user.globalRole === GlobalRole.SUPER_ADMIN) {
    next()
    return
  }

  if (req.user.orgRole !== OrgMemberRole.OWNER && req.user.orgRole !== OrgMemberRole.ADMIN) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Organization admin access required')
  }

  next()
}

/**
 * Require platform super admin
 */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    throw new AppError(401, API_ERROR_CODES.UNAUTHORIZED, 'Not authenticated')
  }

  if (req.user.globalRole !== GlobalRole.SUPER_ADMIN) {
    throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Super admin access required')
  }

  next()
}
