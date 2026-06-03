import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^naddr1[0-9a-z]+$/.test(param);
