# TOTZ Discord private V1

This branch adds an isolated Discord interface to the existing TOTZ staking economy. It does **not** change staking, unstaking, Legendary rewards, or the existing wallet message formats.

## Architecture

- Discord Interactions: Supabase Edge Function `totz-discord`
- Wallet linking: Discord OAuth `identify` + one-time wallet signature
- Balance/profile: server-side call to the existing `totz-staking` portfolio action
- Data: private RLS-enabled link and nonce tables
- Commands: guild-only `/totz link|balance|profile|unlink`

## Required Supabase secrets

Set these in project `yymwpnztjlyfxongwmsw` (never commit values):

```text
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN
DISCORD_CLIENT_SECRET
DISCORD_GUILD_ID
DISCORD_TEST_CHANNEL_ID
DISCORD_REDIRECT_URI
TOTZ_SITE_ORIGIN
TOTZ_STAKING_API
```

Recommended values:

- `TOTZ_SITE_ORIGIN=https://www.wearetotz.xyz`
- `DISCORD_REDIRECT_URI=https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-discord?route=oauth-callback`
- `TOTZ_STAKING_API=https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-staking`

## Manual private-test steps

1. Review and apply the migration.
2. Set Edge Function secrets.
3. Deploy `totz-discord` with JWT verification disabled (Discord authenticates with Ed25519).
4. In Discord Developer Portal set Interactions Endpoint URL:
   `https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-discord`
5. Add the OAuth redirect URL shown above.
6. Run the guild registration script with the three required environment variables:
   `node scripts/register-discord-guild-commands.mjs`
7. Test only in the private TOTZ guild. Do not register global commands.

## Checks

```bash
deno fmt --check supabase/functions
deno lint supabase/functions
deno test --allow-env supabase/functions/tests
git diff --check
```

The bot token and client secret must never be placed in frontend JavaScript, database rows, logs, Git commits, or chat messages.
