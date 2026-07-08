<script lang="ts">
  import { ShieldAlert, Lock, CheckCircle, Settings } from "lucide-svelte";
  import "@/styles/components/permission-prompt.scss";

  interface Props {
    title: string;
    description: string;
    permissions: string[];
    isPremiumRequired?: boolean;
    isPremiumUser?: boolean;
    onGrant: () => Promise<boolean>;
  }

  const {
    title,
    description,
    permissions,
    isPremiumRequired = false,
    isPremiumUser = false,
    onGrant,
  }: Props = $props();

  const showPremiumWarning = isPremiumRequired && !isPremiumUser;
</script>

<div class="permission-prompt permission-prompt-wrapper">
  <div class="prompt-icon">
    {#if showPremiumWarning}
      <Lock size={48} />
    {:else}
      <ShieldAlert size={48} />
    {/if}
  </div>

  <h3 class="prompt-title">{title}</h3>
  <p class="prompt-description">{description}</p>

  {#if showPremiumWarning}
    <div class="premium-warning">
      <Lock size={16} />
      <span>This feature requires a premium subscription</span>
    </div>
  {:else}
    <div class="permission-list">
      <p class="list-title">Required permissions:</p>
      <ul>
        {#each permissions as permission}
          <li>
            <CheckCircle size={16} />
            <span>{permission}</span>
          </li>
        {/each}
      </ul>
    </div>

    <div class="instruction-box">
      <Settings size={20} />
      <div class="instruction-content">
        <strong>How to grant permissions:</strong>
        <ol>
          <li>Click the extension icon in your browser toolbar</li>
          <li>Click the Settings icon (⚙️) in the popup</li>
          <li>Enable the required permissions using the toggle switches</li>
        </ol>
      </div>
    </div>

    <p class="prompt-note">
      Permissions can be managed anytime from the extension popup settings.
    </p>
  {/if}
</div>
