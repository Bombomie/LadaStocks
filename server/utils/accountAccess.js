export async function getAccountAccess(supabase) {
  const { data, error } = await supabase.rpc('lada_account_access');
  if (error) throw error;
  if (typeof data?.isAdmin !== 'boolean' || typeof data?.suspended !== 'boolean') {
    throw new Error('Invalid account access response.');
  }
  return data;
}
