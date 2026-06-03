import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => /^npub1[0-9a-z]+$/.test(param);
