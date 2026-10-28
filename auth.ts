import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import "next-auth/jwt";

// Extend the built-in session types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      tenant_id: number;
      onboarding?: any;
    };
    access_token: string;
    refresh_token?: string;
    onboarding?: any;
    error?: string;
  }

  interface User {
    id: string;
    email: string;
    tenant_id: number;
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    onboarding?: any;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    email: string;
    tenant_id: number;
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    onboarding?: any;
    error?: string;
  }
}

/**
 * Request a fresh access token from the backend using the refresh token.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";
    const apiUrl = `${serverUrl.replace(/\/$/, "")}/api/auth/refresh`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: token.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ [AUTH] Token refresh failed:", errorText);
      return {
        ...token,
        error: "RefreshAccessTokenError",
      };
    }

    const data = await response.json();

    return {
      ...token,
      access_token: data.access_token,
      refresh_token: data.refresh_token || token.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      error: undefined,
    };
  } catch (error) {
    console.error("❌ [AUTH] Exception during token refresh:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        try {
          const apiUrl = `${process.env.NEXT_PUBLIC_SERVER_URL}/api/auth/verify-credentials`;

          const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("❌ [AUTH] API Error Response:", errorText);
            return null;
          }

          const data = await response.json();

          // Store backend's access_token, refresh_token, and onboarding status directly
          return {
            id: data.user.id,
            email: data.user.email,
            tenant_id: data.user.tenant_id,
            access_token: data.access_token,
            refresh_token: data.refresh_token || undefined,
            expires_in: data.expires_in || 3600,
            onboarding: data.onboarding || null,
          };
        } catch (error) {
          console.error("❌ [AUTH] Authorization error:", error);
          console.error("❌ [AUTH] Error details:", {
            message: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
          });
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days to match refresh token lifespan
  },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // 1. Initial sign-in: capture user claims and initial tokens
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.tenant_id = user.tenant_id;
        token.access_token = user.access_token;
        token.refresh_token = user.refresh_token;
        token.onboarding = user.onboarding;
        token.expires_at = Date.now() + (user.expires_in || 3600) * 1000;
        return token;
      }

      // 2. Explicit session update (e.g. from useSession().update(...))
      if (trigger === "update" && session) {
        if (session.access_token) token.access_token = session.access_token;
        if (session.refresh_token) token.refresh_token = session.refresh_token;
        if (session.expires_at) token.expires_at = session.expires_at;
        return token;
      }

      // 3. Return existing token if it has not expired (with a 60-second buffer)
      if (token.expires_at && Date.now() < token.expires_at - 60 * 1000) {
        return token;
      }

      // 4. Access token has expired or is close to expiring: refresh it
      if (token.refresh_token) {
        return await refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.user.tenant_id = token.tenant_id;
      session.user.onboarding = token.onboarding;
      session.access_token = token.access_token;
      session.refresh_token = token.refresh_token;
      session.onboarding = token.onboarding;
      session.error = token.error;

      return session;
    },
  },
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  basePath: "/api/auth",
});
