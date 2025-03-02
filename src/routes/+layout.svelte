<script>
	import '../app.css';
	import FooterNav from '$lib/components/nav/FooterNav.svelte';
	import { createSettingsContext } from '$lib/state/settings.svelte';
	import { createConditionsContext } from '$lib/state/conditions.svelte';

	const { children, data } = $props();

	createSettingsContext({ ...data.settings }, false); // don't persist initially since initial settings are most certanly already loaded

	const conditionsContext = createConditionsContext({ ...data.conditions });
	const conditions = $derived(conditionsContext.getConditions());
</script>

<div class="min-h-screen bg-black p-4 text-white">
	<div class="mx-auto max-w-md">
		{@render children()}

		<footer>
			<FooterNav isLocked={conditions.isAppLocked} />
		</footer>
	</div>
</div>
