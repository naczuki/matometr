<script lang="ts">
  import { avatarStyle } from '$lib/utils/avatar';

  export let pubkey: string;
  export let picture: string | null = null;
  export let size: number = 36;
  export let name: string | null = null;

  $: style = avatarStyle(pubkey, name);
  let imgFailed = false;
  $: picture, (imgFailed = false);
</script>

<div
  class="avatar"
  style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.4)}px;background:{style.bg};color:{style.fg};"
>
  {#if picture && !imgFailed}
    <img src={picture} alt="" on:error={() => (imgFailed = true)} />
  {:else}
    {style.initial}
  {/if}
</div>

<style>
  .avatar {
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-family: var(--font-ui);
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
