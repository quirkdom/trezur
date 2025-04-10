<script>
  import { createEventDispatcher } from 'svelte';
  import { verifyPasscode, setPasscode } from '$lib/passcode';

  const dispatch = createEventDispatcher();

  export let mode = 'verify'; // 'verify' or 'create'

  let passcode = '';
  let confirmPasscode = '';
  let error = '';
  let processing = false;

  async function handleSubmit() {
    error = '';
    processing = true;

    try {
      if (mode === 'verify') {
        const isValid = await verifyPasscode(passcode);
        if (isValid) {
          dispatch('success');
        } else {
          error = 'Incorrect passcode';
        }
      } else if (mode === 'create') {
        if (!passcode) {
          error = 'Passcode cannot be empty';
        } else if (passcode !== confirmPasscode) {
          error = 'Passcodes do not match';
        } else {
          await setPasscode(passcode);
          dispatch('success');
        }
      }
    } catch (e) {
      error = e.message || 'An error occurred';
    } finally {
      processing = false;
    }
  }
</script>

<div class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
  <div class="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
    <h2 class="text-xl font-bold mb-4">
      {mode === 'verify' ? 'Enter Passcode' : 'Create Passcode'}
    </h2>

    <form on:submit|preventDefault={handleSubmit} class="space-y-4">
      <div>
        <label for="passcode" class="block mb-1">Passcode</label>
        <input
          type="password"
          id="passcode"
          class="w-full p-2 rounded bg-gray-700 text-white"
          bind:value={passcode}
          autocomplete="off"
          disabled={processing}
        />
      </div>

      {#if mode === 'create'}
        <div>
          <label for="confirmPasscode" class="block mb-1">Confirm Passcode</label>
          <input
            type="password"
            id="confirmPasscode"
            class="w-full p-2 rounded bg-gray-700 text-white"
            bind:value={confirmPasscode}
            autocomplete="off"
            disabled={processing}
          />
        </div>
      {/if}

      {#if error}
        <div class="text-red-400">{error}</div>
      {/if}

      <button
        type="submit"
        class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-medium"
        disabled={processing}
      >
        {processing ? 'Processing...' : mode === 'verify' ? 'Unlock' : 'Set Passcode'}
      </button>
    </form>
  </div>
</div>
