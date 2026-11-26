// Refuse to overwrite a wallet changed since it was read, including admin adjustments.
export async function updateWalletBalance(supabase, userId, previousBalance, newBalance) {
  const { data, error } = await supabase
    .from('wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('balance', previousBalance)
    .select('balance')
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.balance) : null;
}

export const walletChangedMessage = 'Wallet balance changed. Please try again.';
