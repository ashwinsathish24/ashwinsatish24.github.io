import { Quote } from '../types';
import { supabase } from '../lib/supabase';

export async function getQuotes(): Promise<Quote[]> {
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('id, text, category, author_name, approved, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (data && data.length > 0) {
      return data.map(row => ({
        text: row.text,
        category: row.category as Quote['category'],
        id: row.id,
        author_name: row.author_name ?? undefined,
        approved: row.approved,
        created_at: row.created_at,
      }));
    }
  } catch (e) {
    console.warn('Failed to fetch quotes from Supabase:', e);
  }

  return [];
}
