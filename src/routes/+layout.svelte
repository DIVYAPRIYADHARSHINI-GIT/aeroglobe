<script lang="ts">
	import '../app.css';
	import { settings } from '#lib/state/settings.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		settings.load();
	});

	// Panel theme is applied on the root element; the globe canvas is always dark.
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.documentElement.dataset.panels = settings.panelTheme;
		}
	});
</script>

<svelte:head>
	<title>AeroGlobe - Watch the sky in 3D</title>
</svelte:head>

{@render children()}
