import { defineEventHandler } from 'nitro/h3';
import { getServiceSupabase } from '../courseGeneration/database.js';

const PERSONA_EMAIL = 'jprice@goalasist.co.uk';

export default defineEventHandler(async () => {
    try {
        const { data, error } = await getServiceSupabase()
            .from('profiles')
            .select('avatar_url')
            .eq('email', PERSONA_EMAIL)
            .maybeSingle();

        if (error) throw error;

        return {
            name: 'Josh',
            avatarUrl: data?.avatar_url || null
        };
    } catch (error) {
        console.error('Debate persona lookup failed.', error);
        return {
            name: 'Josh',
            avatarUrl: null
        };
    }
});
