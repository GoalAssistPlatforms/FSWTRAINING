import { defineEventHandler } from 'nitro/h3';
import { getServiceSupabase } from '../courseGeneration/database.js';

const PERSONA_EMAIL = 'jprice@goalasist.co.uk';

function avatarFromUser(user) {
    return user?.user_metadata?.avatar_url
        || user?.user_metadata?.picture
        || user?.user_metadata?.photo_url
        || null;
}

export default defineEventHandler(async () => {
    try {
        const service = getServiceSupabase();
        const { data: profile, error: profileError } = await service
            .from('profiles')
            .select('id, avatar_url')
            .eq('email', PERSONA_EMAIL)
            .maybeSingle();

        if (profileError) throw profileError;

        let avatarUrl = profile?.avatar_url || null;

        if (!avatarUrl && profile?.id) {
            const { data: authData, error: authError } = await service.auth.admin.getUserById(profile.id);
            if (!authError) avatarUrl = avatarFromUser(authData?.user);
        }

        if (!avatarUrl) {
            const { data: usersData, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
            if (!usersError) {
                const authUser = usersData?.users?.find((user) => String(user.email || '').toLowerCase() === PERSONA_EMAIL);
                avatarUrl = avatarFromUser(authUser);
            }
        }

        return {
            name: 'Josh',
            avatarUrl
        };
    } catch (error) {
        console.error('Debate persona lookup failed.', error);
        return {
            name: 'Josh',
            avatarUrl: null
        };
    }
});
