// src/lib/api-response.ts
// Formato padronizado de resposta de API (baseado em RFC 7807)
// Use em todos os Route Handlers: import { apiResponse } from '@/lib/api-response'
import { NextResponse } from 'next/server'

type ApiSuccess<T> = {
  data: T
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    cursor?: string
  }
}

export const apiResponse = {
  ok: <T>(data: T, meta?: ApiSuccess<T>['meta'], status = 200) =>
    NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status }),

  created: <T>(data: T) =>
    NextResponse.json({ data }, { status: 201 }),

  noContent: () =>
    new NextResponse(null, { status: 204 }),

  badRequest: (message: string, details?: unknown) =>
    NextResponse.json(
      { error: { code: 'BAD_REQUEST', message, details } },
      { status: 400 }
    ),

  unauthorized: (message = 'Authentication required') =>
    NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message } },
      { status: 401 }
    ),

  forbidden: (message = 'Insufficient permissions') =>
    NextResponse.json(
      { error: { code: 'FORBIDDEN', message } },
      { status: 403 }
    ),

  notFound: (resource = 'Resource') =>
    NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `${resource} not found` } },
      { status: 404 }
    ),

  tooManyRequests: () =>
    NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
      { status: 429, headers: { 'Retry-After': '10' } }
    ),

  serverError: (message = 'Internal server error') =>
    NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    ),
}
