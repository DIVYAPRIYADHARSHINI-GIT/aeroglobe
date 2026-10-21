// /flight/[id] is a shareable deep link. It redirects to /track with the aircraft
// identifier in the hash, which the tracker resolves as soon as the feed contains it.

import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const id = (params.id ?? '').trim();
	redirect(307, id ? `/track#${encodeURIComponent(id)}` : '/track');
};
