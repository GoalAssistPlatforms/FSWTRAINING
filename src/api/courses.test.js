import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCourse } from './courses.js';
import { getPlatformSettings } from './admin.js';
import { supabase } from './supabase.js';

vi.mock('./admin.js', () => ({
    getPlatformSettings: vi.fn(),
    getBillingPeriodDates: vi.fn()
}));

vi.mock('./supabase.js', () => ({
    supabase: {
        auth: {
            getUser: vi.fn()
        },
        from: vi.fn()
    }
}));

const makeQuery = ({
    result = { data: null, error: null },
    singleResult = result,
    maybeSingleResult = result,
    onInsert
} = {}) => {
    const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        limit: vi.fn(() => query),
        insert: vi.fn((rows) => {
            onInsert?.(rows);
            return query;
        }),
        single: vi.fn(async () => singleResult),
        maybeSingle: vi.fn(async () => maybeSingleResult),
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };

    return query;
};

describe('createCourse account resolution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getPlatformSettings).mockResolvedValue(null);
        vi.mocked(supabase.auth.getUser).mockResolvedValue({
            data: { user: { id: 'user-1' } },
            error: null
        });
    });

    it('adds the profile account to the course insert', async () => {
        let insertedRows;
        let profileRead = 0;

        vi.mocked(supabase.from).mockImplementation((table) => {
            if (table === 'profiles') {
                profileRead += 1;
                if (profileRead === 1) {
                    return makeQuery({
                        singleResult: { data: { role: 'manager' }, error: null }
                    });
                }

                return makeQuery({
                    maybeSingleResult: {
                        data: { account_id: 'account-1' },
                        error: null
                    }
                });
            }

            if (table === 'courses') {
                return makeQuery({
                    result: {
                        data: [{ id: 'course-1', account_id: 'account-1' }],
                        error: null
                    },
                    onInsert: (rows) => {
                        insertedRows = rows;
                    }
                });
            }

            throw new Error(`Unexpected table ${table}`);
        });

        const input = { title: 'Maternity for Managers', status: 'draft' };
        await createCourse(input);

        expect(insertedRows).toEqual([{
            title: 'Maternity for Managers',
            status: 'draft',
            account_id: 'account-1'
        }]);
        expect(input).not.toHaveProperty('account_id');
    });

    it('falls back to the user workspace membership', async () => {
        let insertedRows;
        let profileRead = 0;

        vi.mocked(supabase.from).mockImplementation((table) => {
            if (table === 'profiles') {
                profileRead += 1;
                if (profileRead === 1) {
                    return makeQuery({
                        singleResult: { data: { role: 'manager' }, error: null }
                    });
                }

                return makeQuery({
                    maybeSingleResult: {
                        data: null,
                        error: { code: '42703', message: 'account_id does not exist' }
                    }
                });
            }

            if (table === 'account_memberships') {
                return makeQuery({
                    result: {
                        data: [{ account_id: 'account-2' }],
                        error: null
                    }
                });
            }

            if (table === 'courses') {
                return makeQuery({
                    result: {
                        data: [{ id: 'course-2', account_id: 'account-2' }],
                        error: null
                    },
                    onInsert: (rows) => {
                        insertedRows = rows;
                    }
                });
            }

            throw new Error(`Unexpected table ${table}`);
        });

        await createCourse({ title: 'Maternity for Managers', status: 'draft' });

        expect(insertedRows[0].account_id).toBe('account-2');
    });

    it('stops before inserting if no workspace can be resolved', async () => {
        let profileRead = 0;

        vi.mocked(supabase.from).mockImplementation((table) => {
            if (table === 'profiles') {
                profileRead += 1;
                if (profileRead === 1) {
                    return makeQuery({
                        singleResult: { data: { role: 'manager' }, error: null }
                    });
                }

                return makeQuery({
                    maybeSingleResult: { data: null, error: null }
                });
            }

            if (table === 'account_memberships' || table === 'accounts') {
                return makeQuery({
                    result: { data: [], error: null }
                });
            }

            if (table === 'courses') {
                throw new Error('The course insert must not be attempted');
            }

            throw new Error(`Unexpected table ${table}`);
        });

        await expect(createCourse({
            title: 'Maternity for Managers',
            status: 'draft'
        })).rejects.toThrow('not linked to the FSW workspace');
    });
});
