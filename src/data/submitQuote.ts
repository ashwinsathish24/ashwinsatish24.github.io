import { supabase } from '../lib/supabase';

export interface SubmitResult {
  success: boolean;
  error?: string;
}

export async function submitQuote(
  text: string,
  category: string,
  author_name?: string,
): Promise<SubmitResult> {
  if (text.length < 2 || text.length > 100) {
    return { success: false, error: 'Quote must be between 2 and 100 characters.' };
  }

  try {
    const { error } = await supabase.from('quotes').insert({
      text,
      category,
      author_name: author_name?.trim() || 'Anonymous',
      ip_address: '',
    });

    if (error) throw error;

    return { success: true };
  } catch (e: any) {
    console.error('Failed to submit quote:', e);
    return { success: false, error: e?.message || 'Something went wrong. Try again later.' };
  }
}
