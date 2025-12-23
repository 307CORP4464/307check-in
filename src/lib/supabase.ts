export function getSupabase(): any {
  console.warn('Supabase not configured');
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Not configured' } }),
      update: () => Promise.resolve({ data: null, error: { message: 'Not configured' } }),
    }),
    channel: () => ({
      on: () => ({ 
        subscribe: () => ({ 
          unsubscribe: () => {} 
        }) 
      }),
    }),
  };
}

export const supabase = getSupabase();
export const supabaseAdmin = null;
