// Signing in and who you are (worker/src/index.js /auth/otp/*, /me).

export interface OtpRequest { email: string; locale?: string }
export interface OtpVerify { email: string; code: string; name?: string; inviteCode?: string; locale?: string }
export interface SignedIn { token: string; userId: string; login: string; orgId: string | null; inviteError?: string }

export interface Me {
  login: string
  userId: string
  orgId: string | null
  name: string | null
  handle: string | null
  avatarUrl: string | null
  locale: string
  /// Every workspace this person is in.
  orgs?: Array<{ id: string; name: string | null; icon?: string | null }>
}

/// A workspace's channel (GET /businesses): `b:<slug>` is its key.
export interface Business { slug: string; name: string; private: number | boolean }
