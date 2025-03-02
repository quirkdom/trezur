<script>
	import { updated } from '$app/state';

	let data = $state({ count: 0, text: 'Hello' });

	function updateDataAssign() {
		Object.assign(data, { count: data.count + 1, text: 'Poop' });
	}

	function updateDataSpread() {
		data = { ...data, count: data.count + 1, text: 'Nonce' };
	}

	function updateDataDirect() {
		data.count++;
	}

	function assignDirect() {
		data = { count: -1, text: 'Whoops' };
	}
</script>

<p>Count: {data.count}, Text: {data.text}</p>

<button onclick={updateDataAssign}>Update (Object.assign)</button> <br />
<button onclick={updateDataSpread}>Update (Spread)</button> <br />
<button onclick={updateDataDirect}>Update (Direct)</button> <br />
<button onclick={assignDirect}>Assign (Direct)</button> <br />
