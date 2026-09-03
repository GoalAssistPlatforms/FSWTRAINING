import { createError, getHeader } from 'nitro/h3';
import { getServiceSupabase } from '../courseGeneration/database.js';

export async function requireVoiceManager(event) {
  const authorization = String(getHeader(event, 'authorization') || '');
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required.' });
  }

  const service = getServiceSupabase();
  const { data: authData, error: authError } = await service.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Your session has expired.' });
  }

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!['manager', 'admin'].includes(profile?.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Manager access is required.' });
  }

  return { user, profile, service };
}
