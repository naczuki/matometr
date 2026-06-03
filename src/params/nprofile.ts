import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^nprofile1[0-9a-z]+$/.test(param);
