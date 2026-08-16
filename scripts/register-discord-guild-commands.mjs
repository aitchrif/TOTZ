const required = [
  "DISCORD_APPLICATION_ID",
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const commands = [{
  name: "totz",
  description: "TOTZ wallet and holder tools",
  options: [
    { type: 1, name: "link", description: "Securely link your wallet" },
    { type: 1, name: "balance", description: "Show your available $TOTZ balance" },
    { type: 1, name: "profile", description: "Show your private TOTZ holder profile" },
    { type: 1, name: "unlink", description: "Deactivate your Discord wallet link" },
  ],
}];

const endpoint =
  `https://discord.com/api/v10/applications/${process.env.DISCORD_APPLICATION_ID}/guilds/${process.env.DISCORD_GUILD_ID}/commands`;
const response = await fetch(endpoint, {
  method: "PUT",
  headers: {
    authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(commands),
});
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Discord registration failed (${response.status})`);
console.log(`Registered ${result.length} guild-only command group(s).`);
