import { createBrowserClient } from '@supabase/ssr'

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true, // セッションを端末（ブラウザ）に保存
        autoRefreshToken: true, // トークン期限切れ時に自動更新
        detectSessionInUrl: true,
      },
    }
  )