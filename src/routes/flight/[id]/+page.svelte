<script lang="ts">
	// Rendered only if the redirect in +page.ts is bypassed (e.g. JS-less crawler).
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Flight {page.params.id} - AeroGlobe</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<p>Opening the tracker focused on <strong>{page.params.id}</strong>&hellip;</p>
	<a class="btn btn-primary" href="/track#{page.params.id}">Open tracker</a>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-content: center;
		gap: 1rem;
		text-align: center;
		padding: 2rem;
	}
	p {
		color: var(--text-dim);
	}
</style>
