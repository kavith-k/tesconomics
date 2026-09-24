import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const housemates = env.HOUSEMATES?.split(',').map((name) => name.trim());

	if (!housemates?.length || housemates.some((name) => !name)) {
		throw new Error('HOUSEMATES must be a comma-separated list of names.');
	}
	if (new Set(housemates).size !== housemates.length) {
		throw new Error('HOUSEMATES must not contain duplicate names.');
	}

	return { housemates };
};
