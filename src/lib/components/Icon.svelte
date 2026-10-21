<script lang="ts">
	// Original inline SVG icon set. No emoji, no third-party icon packs.
	// All paths drawn for AeroGlobe.
	interface Props {
		name: string;
		size?: number;
		title?: string;
		class?: string;
	}
	let { name, size = 20, title, class: klass = '' }: Props = $props();
</script>

<svg
	class={klass}
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={title ? 'img' : 'presentation'}
	aria-hidden={title ? undefined : 'true'}
	aria-label={title}
>
	{#if title}<title>{title}</title>{/if}

	{#if name === 'plane'}
		<path d="M12 2.5 13.6 9.4 22 12l-8.4 2.6L12 21.5l-1.6-6.9L2 12l8.4-2.6z" fill="none" />
	{:else if name === 'plane-side'}
		<path d="M2.5 13.2 21 9.6a1.6 1.6 0 0 0 .2-3L18.4 6 13 9.2 7.6 7.4 6 8l3.3 2.6-3.6 1.1-2.2-1.4-1.2.5z" />
	{:else if name === 'globe'}
		<circle cx="12" cy="12" r="9" />
		<path d="M3 12h18M12 3c2.6 2.4 4 5.6 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.6-4-9s1.4-6.6 4-9z" />
	{:else if name === 'search'}
		<circle cx="10.8" cy="10.8" r="6.3" />
		<path d="m15.4 15.4 4.1 4.1" />
	{:else if name === 'filter'}
		<path d="M3.5 5.5h17l-6.6 7.6v5.6l-3.8 2v-7.6z" />
	{:else if name === 'star'}
		<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />
	{:else if name === 'star-filled'}
		<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" />
	{:else if name === 'close'}
		<path d="m6 6 12 12M18 6 6 18" />
	{:else if name === 'chevron-left'}
		<path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
	{:else if name === 'chevron-right'}
		<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
	{:else if name === 'chevron-down'}
		<path d="m5.5 9.5 6.5 6.5 6.5-6.5" />
	{:else if name === 'arrow-up'}
		<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
	{:else if name === 'arrow-down'}
		<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5" />
	{:else if name === 'arrow-right'}
		<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" />
	{:else if name === 'share'}
		<circle cx="17.5" cy="5.8" r="2.6" />
		<circle cx="6.5" cy="12" r="2.6" />
		<circle cx="17.5" cy="18.2" r="2.6" />
		<path d="m8.9 10.8 6.2-3.6M8.9 13.2l6.2 3.6" />
	{:else if name === 'target'}
		<circle cx="12" cy="12" r="7.5" />
		<circle cx="12" cy="12" r="2.6" />
		<path d="M12 1.8v3.2M12 19v3.2M22.2 12H19M5 12H1.8" />
	{:else if name === 'eye'}
		<path d="M1.8 12S5.4 5.6 12 5.6 22.2 12 22.2 12 18.6 18.4 12 18.4 1.8 12 1.8 12z" />
		<circle cx="12" cy="12" r="3.1" />
	{:else if name === 'cockpit'}
		<path d="M4 14.5c0-5 3.6-9 8-9s8 4 8 9z" />
		<path d="M12 5.5v9M4.6 11h14.8" />
		<path d="M3.4 17.5h17.2" />
	{:else if name === 'exit'}
		<path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
		<path d="M10 8.5 6 12l4 3.5M6 12h9" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4.2" />
		<path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
	{:else if name === 'moon'}
		<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />
	{:else if name === 'signal'}
		<path d="M3.5 18.5v-4M9 18.5v-8M14.5 18.5v-12M20 18.5v-15" />
	{:else if name === 'tower'}
		<path d="M9 21V9.5h6V21" />
		<path d="M7 21h10M12 9.5V5M9.4 5h5.2M8 7.2 5.2 4.6M16 7.2l2.8-2.6" />
	{:else if name === 'compass'}
		<circle cx="12" cy="12" r="8.8" />
		<path d="m15 9-1.7 4.3L9 15l1.7-4.3z" fill="currentColor" stroke="none" />
	{:else if name === 'gauge'}
		<path d="M4 17a8 8 0 1 1 16 0" />
		<path d="M12 17 16 9.6" />
	{:else if name === 'layers'}
		<path d="m12 3.6 8.4 4.2L12 12 3.6 7.8z" />
		<path d="m3.6 12.6 8.4 4.2 8.4-4.2" />
	{:else if name === 'info'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 10.8v5.4M12 7.9v.1" />
	{:else if name === 'warning'}
		<path d="M12 4.2 21.3 19H2.7z" />
		<path d="M12 10v4M12 16.9v.1" />
	{:else if name === 'refresh'}
		<path d="M20 12a8 8 0 1 1-2.6-5.9" />
		<path d="M20.4 4.6v4.2h-4.2" />
	{:else if name === 'menu'}
		<path d="M4 7h16M4 12h16M4 17h16" />
	{:else if name === 'clock'}
		<circle cx="12" cy="12" r="9" />
		<path d="M12 6.8V12l3.4 2" />
	{:else if name === 'pin'}
		<path d="M12 21.5s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
		<circle cx="12" cy="10.4" r="2.6" />
	{/if}
</svg>
