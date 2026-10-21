<script lang="ts">
	// Instant search with keyboard-navigable suggestions (combobox pattern).

	import Icon from './Icon.svelte';
	import { search, type SearchResult } from '#lib/search';
	import { traffic } from '#lib/state/traffic.svelte';
	import type { Airport } from '#lib/data/airports';
	import { onMount } from 'svelte';

	interface Props {
		onPickAircraft: (hex: string) => void;
		onPickAirport: (airport: Airport) => void;
		autofocus?: boolean;
	}
	let { onPickAircraft, onPickAirport, autofocus = false }: Props = $props();

	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	let input: HTMLInputElement | undefined = $state();

	// Focus programmatically rather than with the autofocus attribute, which is an
	// accessibility smell: this component is only auto-focused when the user has just
	// opened the mobile search sheet on purpose.
	onMount(() => {
		if (autofocus) input?.focus();
	});

	let results = $derived.by<SearchResult[]>(() => {
		traffic.selectionTick; // refresh suggestions as traffic updates
		if (!query.trim()) return [];
		return search(query, traffic.byHex.values());
	});

	function pick(r: SearchResult) {
		if (r.kind === 'aircraft') onPickAircraft(r.hex);
		else onPickAirport(r.airport);
		query = '';
		open = false;
		input?.blur();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			query = '';
			return;
		}
		if (!results.length) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			active = (active + 1) % results.length;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			active = (active - 1 + results.length) % results.length;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			pick(results[Math.min(active, results.length - 1)]);
		}
	}

	$effect(() => {
		// Reset the highlighted row whenever the result set changes.
		results.length;
		active = 0;
	});
</script>

<div class="search-wrap">
	<span class="search-icon" aria-hidden="true"><Icon name="search" size={17} /></span>
	<input
		bind:this={input}
		bind:value={query}
		type="search"
		role="combobox"
		aria-expanded={open && results.length > 0}
		aria-controls="search-results"
		aria-autocomplete="list"
		aria-label="Search by callsign, hex code, airport code or city"
		placeholder="Callsign, hex, airport or city"
		autocomplete="off"
		oninput={() => (open = true)}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => (open = false), 160)}
		onkeydown={onKeydown}
	/>
	{#if query}
		<button class="clear" onclick={() => ((query = ''), (open = false))} aria-label="Clear search">
			<Icon name="close" size={15} />
		</button>
	{/if}

	{#if open && results.length > 0}
		<ul class="glass results" id="search-results" role="listbox" aria-label="Search suggestions">
			{#each results as r, i (r.kind === 'aircraft' ? r.hex : r.airport.iata)}
				<li role="option" aria-selected={i === active}>
					<button class="result" class:active={i === active} onmousedown={() => pick(r)}>
						<span class="r-icon" aria-hidden="true">
							<Icon name={r.kind === 'aircraft' ? 'plane-side' : 'tower'} size={15} />
						</span>
						<span class="r-text">
							<span class="mono r-title">{r.title}</span>
							<span class="r-sub">{r.subtitle}</span>
						</span>
						<span class="r-kind label">{r.kind === 'aircraft' ? 'Flight' : 'Airport'}</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else if open && query.trim().length > 0}
		<div class="glass results empty-res">
			<p>No match for &ldquo;{query}&rdquo;. Try a callsign, ICAO24 hex, IATA code or city.</p>
		</div>
	{/if}
</div>

<style>
	.search-wrap {
		position: relative;
		width: 100%;
	}
	.search-icon {
		position: absolute;
		left: 0.7rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-faint);
		pointer-events: none;
	}
	input {
		padding-left: 2.3rem;
		padding-right: 2.3rem;
	}
	input::-webkit-search-cancel-button {
		display: none;
	}
	.clear {
		position: absolute;
		right: 0.45rem;
		top: 50%;
		transform: translateY(-50%);
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		color: var(--text-faint);
	}
	.clear:hover {
		color: var(--panel-text);
		background: var(--panel-raise);
	}

	.results {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		z-index: 40;
		list-style: none;
		margin: 0;
		padding: 0.3rem;
		max-height: 19rem;
		overflow-y: auto;
		border-radius: var(--r-md);
	}
	.result {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.5rem 0.55rem;
		border-radius: var(--r-sm);
		text-align: left;
		min-height: 44px;
	}
	.result:hover,
	.result.active {
		background: rgba(56, 208, 255, 0.13);
	}
	.r-icon {
		color: var(--cyan);
		flex-shrink: 0;
	}
	.r-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.r-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--panel-text);
	}
	.r-sub {
		font-size: 0.69rem;
		color: var(--panel-text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.r-kind {
		font-size: 0.6rem;
		flex-shrink: 0;
		opacity: 0.75;
	}
	.empty-res {
		padding: 0.8rem 0.9rem;
	}
	.empty-res p {
		margin: 0;
		font-size: 0.78rem;
		color: var(--panel-text-dim);
		line-height: 1.5;
	}
</style>
