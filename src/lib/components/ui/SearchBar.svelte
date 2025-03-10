<script>
	import { Search } from 'lucide-svelte';

	let { searchQuery = $bindable('') } = $props();
</script>

<div class="relative mb-6">
	<div class="absolute inset-y-0 left-3 flex items-center text-zinc-500">
		<Search size={20} />
	</div>
	<input
		type="text"
		bind:value={searchQuery}
		placeholder="Search codes"
		class="w-full rounded-lg bg-zinc-900 py-2 pr-4 pl-10 text-white placeholder-zinc-500 focus:ring-2 focus:ring-[#EB3912] focus:outline-none"
	/>
</div>
