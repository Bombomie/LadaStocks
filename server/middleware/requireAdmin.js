export async function requireAdmin(req, res, next) {
  try {
    const { supabase, user } = req.auth;

    const { data, error } = await supabase
      .from('admins')
      .select('admin_id, role')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Admin check error:', error);
      return res.status(500).json({ message: 'Admin check failed.' });
    }

    if (!data) {
      return res.status(403).json({ message: 'Admins only.' });
    }

    req.admin = data;
    next();
  } catch (error) {
    console.error('requireAdmin error:', error);
    return res.status(500).json({ message: 'Admin check failed.' });
  }
}