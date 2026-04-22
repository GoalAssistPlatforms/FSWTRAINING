import { supabase } from './supabase'

/**
 * Fetch the platform settings
 */
export const getPlatformSettings = async () => {
    const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 1)
        .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 means no rows found
        console.error('Error fetching platform settings:', error)
        throw error
    }

    return data || {
        max_users: 10,
        max_courses_per_period: 12,
        max_guides_per_period: 12,
        subscription_start_date: new Date().toISOString(),
        renewal_period_months: 12
    }
}

/**
 * Update the platform settings
 */
export const updatePlatformSettings = async (settings) => {
    const { data, error } = await supabase
        .from('platform_settings')
        .upsert({ id: 1, ...settings })
        .select()
        .single()

    if (error) {
        console.error('Error updating platform settings:', error)
        throw error
    }

    return data
}

/**
 * Calculates the start date of the current active billing period
 */
export const getBillingPeriodDates = (subscriptionStartDate, renewalPeriodMonths) => {
    if (!subscriptionStartDate || !renewalPeriodMonths) return null;
    
    const start = new Date(subscriptionStartDate);
    const now = new Date();
    
    if (now < start) {
        // If we haven't reached the first subscription date yet, the period is from the beginning of time up to the start date.
        return {
            periodStart: new Date(0), // Count everything created so far
            nextRenewal: start
        };
    }
    
    let monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) {
        monthsDiff--;
    }
    
    const periodsPassed = Math.floor(monthsDiff / renewalPeriodMonths);
    
    const currentPeriodStart = new Date(start);
    currentPeriodStart.setMonth(start.getMonth() + (periodsPassed * renewalPeriodMonths));
    
    const nextRenewal = new Date(currentPeriodStart);
    nextRenewal.setMonth(nextRenewal.getMonth() + renewalPeriodMonths);
    
    return {
        periodStart: currentPeriodStart,
        nextRenewal: nextRenewal
    };
}
