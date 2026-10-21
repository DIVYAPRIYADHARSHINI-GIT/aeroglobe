<script lang="ts">
	// Small data-source indicator: "Live - adsb.lol" or "Demo mode - simulated data".
	import Icon from './Icon.svelte';
	import { traffic } from '#lib/state/traffic.svelte';
	import { SOURCE_BY_ID } from '#lib/providers/sources';
	import { fmtAgo } from '#lib/format';

	let providerLabel = $derived.by(() => {
		if (!traffic.provider || traffic.provider === 'demo') return 'Simulated data';
		return SOURCE_BY_ID.get(traffic.provider)?.label ?? traffic.provider;
	});

	let isDemo = $derived(traffic.mode === 'demo');
	let isConnecting = $derived(traffic.mode === 'connecting');
</script>

<div
	class="chip status"
	class:demo={isDemo}
	class:connecting={isConnecting}
	role="status"
	aria-live="polite"
	title={isDemo
		? 'Live providers unreachable or demo mode selected. Showing simulated aircraft.'
		: `Live positions via ${providerLabel} (${traffic.via})`}
>
	<span class="dot" aria-hidden="true"></span>
	{#if isConnecting}
		<span>Connecting&hellip;</span>
	{:else if isDemo}
		<Icon name="warning" size={13} />
		<span>Demo mode &middot; Simulated data</span>
	{:else}
		<span>Live &middot; {providerLabel}</span>
	{/if}
	{#if traffic.lastUpdate > 0 && !isConnecting}
		<span class="ago">{fmtAgo(traffic.lastUpdate)}</span>
	{/if}
</div>

<style>
	.status {
		background: rgba(7, 11, 22, 0.62);
		color: var(--ok);
		border-color: rgba(65, 224, 163, 0.35);
	}
	.status.demo {
		color: var(--amber);
		border-color: rgba(255, 176, 32, 0.42);
	}
	.status.connecting {
		color: var(--text-dim);
		border-color: var(--panel-border);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
		box-shadow: 0 0 7px currentColor;
		animation: pulse-dot 2s ease-in-out infinite;
		flex-shrink: 0;
	}
	.ago {
		opacity: 0.6;
		font-size: 0.66rem;
	}
	:global([data-panels='light']) .status {
		background: rgba(244, 248, 255, 0.9);
		color: #0a7a55;
	}
	:global([data-panels='light']) .status.demo {
		color: #9a6200;
	}
</style>
