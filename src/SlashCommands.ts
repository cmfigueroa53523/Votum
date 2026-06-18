import { Collection, Permissions } from "discord.js"
import { CommandoClient } from "discord.js-commando"
import { ConfigurableCouncilDataSerializers } from "./CouncilData"
import ArchiveCommand from "./commands/votum/ArchiveCommand"
import AbstainCommand from "./commands/votum/AbstainCommand"
import ConfigCommand from "./commands/votum/ConfigCommand"
import CouncilCommand from "./commands/votum/CouncilCommand"
import MotionCommand from "./commands/votum/MotionCommand"
import NoCommand from "./commands/votum/NoCommand"
import PingInactiveCommand from "./commands/votum/PingInactiveCommand"
import SetWeightCommand from "./commands/votum/SetWeight"
import StatsCommand from "./commands/votum/StatsCommand"
import YesCommand from "./commands/votum/YesCommand"

type SlashOption = {
  name: string
  type: number
  value?: any
  options?: SlashOption[]
}

type SlashInteraction = {
  id: string
  token: string
  guild_id: string
  channel_id: string
  member: {
    user: {
      id: string
      username: string
      discriminator: string
      avatar?: string
      bot?: boolean
    }
    nick?: string | null
    roles: string[]
    permissions?: string
  }
  data: {
    name: string
    options?: SlashOption[]
  }
}

type ReplyPayload =
  | string
  | {
      content?: string
      embed?: any
      embeds?: any[]
      files?: Array<{ name: string; attachment: Buffer }>
    }

const API_BASE = "https://discord.com/api/v9"

const fetchApi: any = (globalThis as any).fetch
const FormDataApi: any = (globalThis as any).FormData
const BlobApi: any = (globalThis as any).Blob
const configKeyChoices = Object.keys(ConfigurableCouncilDataSerializers).map(
  (key) => ({
    name: key,
    value: key,
  })
)

function normalizeReply(payload: ReplyPayload, options?: any) {
  if (typeof payload === "string") {
    return { ...(options || {}), content: payload }
  }

  return { ...(payload || {}), ...(options || {}) }
}

function chunkText(text: string, size = 1900) {
  const chunks: string[] = []

  let remaining = text
  while (remaining.length > size) {
    chunks.push(remaining.slice(0, size))
    remaining = remaining.slice(size)
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}

class InteractionResponder {
  private acknowledged = false
  private replied = false

  constructor(
    private client: CommandoClient,
    private interaction: SlashInteraction
  ) {}

  public async defer() {
    if (this.acknowledged) return

    await fetchApi(`${API_BASE}/interactions/${this.interaction.id}/${this.interaction.token}/callback`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: 5 }),
    })

    this.acknowledged = true
  }

  public async reply(payload: ReplyPayload, options?: any): Promise<any> {
    const normalized = normalizeReply(payload, options)

    if (normalized.split && typeof normalized.content === "string") {
      const chunks = chunkText(normalized.content)

      if (chunks.length === 0) {
        return this.sendOriginal({ ...normalized, content: "" })
      }

      const firstChunk = chunks.shift() || ""

      if (!this.acknowledged) {
        await this.defer()
      }

      this.replied = true
      await this.sendOriginal({ ...normalized, content: firstChunk, split: undefined })

      for (const chunk of chunks) {
        await this.sendFollowup({ ...normalized, content: chunk, split: undefined })
      }

      return
    }

    if (!this.acknowledged) {
      await this.defer()
    }

    if (!this.replied) {
      this.replied = true
      return this.sendOriginal(normalized)
    }

    return this.sendFollowup(normalized)
  }

  private async sendOriginal(payload: any) {
    return this.sendWebhook("PATCH", "messages/@original", payload)
  }

  private async sendFollowup(payload: any) {
    return this.sendWebhook("POST", "", payload)
  }

  private async sendWebhook(method: string, suffix: string, payload: any) {
    const body = this.buildBody(payload)
    const url = `${API_BASE}/webhooks/${this.client.user!.id}/${this.interaction.token}${suffix ? `/${suffix}` : ""}`

    return fetchApi(url, {
      method,
      headers: body.headers,
      body: body.body,
    })
  }

  private buildBody(payload: any) {
    const normalized = { ...payload }
    const files = normalized.files as
      | Array<{ name: string; attachment: Buffer }>
      | undefined

    delete normalized.files
    delete normalized.embed
    delete normalized.split

    if (payload.embed) {
      normalized.embeds = [payload.embed]
    }

    if (!files || files.length === 0) {
      return {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalized),
      }
    }

    const form = new FormDataApi()
    form.set("payload_json", JSON.stringify(normalized))

    files.forEach((file, index) => {
      form.set(
        `files[${index}]`,
        new BlobApi([file.attachment]),
        file.name
      )
    })

    return {
      headers: {},
      body: form,
    }
  }
}

export default class SlashCommands {
  private commands = {
    council: new CouncilCommand(this.client),
    config: new ConfigCommand(this.client),
    motion: new MotionCommand(this.client),
    yes: new YesCommand(this.client),
    no: new NoCommand(this.client),
    abstain: new AbstainCommand(this.client),
    archive: new ArchiveCommand(this.client),
    pinginactive: new PingInactiveCommand(this.client),
    setweight: new SetWeightCommand(this.client),
    stats: new StatsCommand(this.client),
  }

  constructor(private client: CommandoClient) {}

  public get commandData() {
    return [
      {
        name: "council",
        description: "Create, rename, or remove the council in this channel.",
        options: [
          { type: 3, name: "name", description: "Council name", required: false },
          { type: 5, name: "remove", description: "Remove the council", required: false },
        ],
      },
      {
        name: "config",
        description: "View or change a council setting.",
        options: [
          {
            type: 3,
            name: "key",
            description: "Setting name",
            required: false,
            choices: configKeyChoices,
          },
          { type: 3, name: "value", description: "New value", required: false },
          { type: 5, name: "remove", description: "Reset the setting", required: false },
        ],
      },
      {
        name: "motion",
        description: "Create, view, or kill the current motion.",
        options: [
          { type: 3, name: "text", description: "Motion text", required: false },
          { type: 5, name: "kill", description: "Kill the current motion", required: false },
        ],
      },
      {
        name: "yes",
        description: "Vote yes on the current motion.",
        options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
      },
      {
        name: "no",
        description: "Vote no on the current motion.",
        options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
      },
      {
        name: "abstain",
        description: "Abstain on the current motion.",
        options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
      },
      {
        name: "archive",
        description: "View or export the council archive.",
        options: [
          { type: 3, name: "range", description: "Motion number, range, or export", required: false },
          { type: 5, name: "export", description: "Export the full archive", required: false },
        ],
      },
      {
        name: "pinginactive",
        description: "Mention councilors who have not voted yet.",
      },
      {
        name: "setweight",
        description: "Set the vote weight of a council member or role.",
        options: [
          { type: 3, name: "target", description: "Member or role mention/id", required: false },
          { type: 10, name: "weight", description: "Vote weight", required: false },
        ],
      },
      {
        name: "stats",
        description: "Show council statistics.",
      },
      {
        name: "votum",
        description: "Votum slash commands.",
        options: [
          {
            type: 1,
            name: "council",
            description: "Create, rename, or remove the council in this channel.",
            options: [
              { type: 3, name: "name", description: "Council name", required: false },
              { type: 5, name: "remove", description: "Remove the council", required: false },
            ],
          },
          {
            type: 1,
            name: "config",
            description: "View or change a council setting.",
            options: [
              {
                type: 3,
                name: "key",
                description: "Setting name",
                required: false,
                choices: configKeyChoices,
              },
              { type: 3, name: "value", description: "New value", required: false },
              { type: 5, name: "remove", description: "Reset the setting", required: false },
            ],
          },
          {
            type: 1,
            name: "motion",
            description: "Create, view, or kill the current motion.",
            options: [
              { type: 3, name: "text", description: "Motion text", required: false },
              { type: 5, name: "kill", description: "Kill the current motion", required: false },
            ],
          },
          {
            type: 1,
            name: "yes",
            description: "Vote yes on the current motion.",
            options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
          },
          {
            type: 1,
            name: "no",
            description: "Vote no on the current motion.",
            options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
          },
          {
            type: 1,
            name: "abstain",
            description: "Abstain on the current motion.",
            options: [{ type: 3, name: "reason", description: "Reason for your vote", required: false }],
          },
          {
            type: 1,
            name: "archive",
            description: "View or export the council archive.",
            options: [
              { type: 3, name: "range", description: "Motion number, range, or export", required: false },
              { type: 5, name: "export", description: "Export the full archive", required: false },
            ],
          },
          {
            type: 1,
            name: "pinginactive",
            description: "Mention councilors who have not voted yet.",
          },
          {
            type: 1,
            name: "setweight",
            description: "Set the vote weight of a council member or role.",
            options: [
              { type: 3, name: "target", description: "Member or role mention/id", required: false },
              { type: 10, name: "weight", description: "Vote weight", required: false },
            ],
          },
          {
            type: 1,
            name: "stats",
            description: "Show council statistics.",
          },
        ],
      },
    ]
  }

  public async register() {
    if (this.client.shard && this.client.shard.ids[0] !== 0) {
      return
    }

    const appId = this.client.user?.id
    if (!appId) return

    const guildId = process.env.SLASH_GUILD_ID || process.env.GUILD_ID
    const headers = {
      Authorization: `Bot ${process.env.TOKEN}`,
      "Content-Type": "application/json",
    }

    if (guildId) {
      await fetchApi(
        `${API_BASE}/applications/${appId}/guilds/${guildId}/commands`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify(this.commandData),
        }
      )
      return
    }

    await Promise.all(
      [...this.client.guilds.cache.values()].map((guild) =>
        fetchApi(`${API_BASE}/applications/${appId}/guilds/${guild.id}/commands`, {
          method: "PUT",
          headers,
          body: JSON.stringify(this.commandData),
        })
      )
    )
  }

  public async handleInteraction(interaction: SlashInteraction) {
    const usingGroup = interaction.data.name === "votum"
    const subcommand = usingGroup
      ? interaction.data.options?.find((option) => option.type === 1)
      : null
    const commandName = usingGroup ? subcommand?.name : interaction.data.name
    const options = usingGroup ? subcommand?.options || [] : interaction.data.options || []

    if (!commandName) {
      return
    }

    const responder = new InteractionResponder(this.client, interaction)
    await responder.defer()

    const guild = this.client.guilds.cache.get(interaction.guild_id)
    const channel = guild?.channels.cache.get(interaction.channel_id)
    if (!guild || !channel) {
      await responder.reply("This command can only be used in a server channel.")
      return
    }

    const member = this.buildMember(interaction, guild)
    const author =
      (await this.client.users.fetch(interaction.member.user.id).catch(() => null)) ||
      interaction.member.user
    const fakeMessage: any = {
      client: this.client,
      guild,
      channel,
      author,
      member,
      command: { name: commandName },
      cleanContent: `/${commandName}`,
      content: `/${commandName}`,
      reply: (payload: ReplyPayload, options?: any) => responder.reply(payload, options),
    }

    const args = this.buildArgs(commandName, options)
    const command = this.commands[commandName as keyof typeof this.commands]

    if (!command) {
      await responder.reply("Unknown command.")
      return
    }

    if (!command.hasPermission(fakeMessage)) {
      await responder.reply("You do not have permission to use this command.")
      return
    }

    try {
      await command.run(fakeMessage, args, false)
    } catch (error) {
      console.error(error)
      await responder.reply("Sorry, an error occurred executing the command.")
    }
  }

  private buildArgs(commandName: string, options: SlashOption[]) {
    const values: any = {}
    for (const option of options) {
      values[option.name] = option.value
    }

    switch (commandName) {
      case "council":
        return {
          name: values.remove ? "remove" : values.name || "Council",
        }
      case "config":
        return {
          key: values.key || "",
          value: values.remove ? "$remove" : values.value || "",
        }
      case "motion":
        return {
          text: values.kill ? "kill" : values.text || "",
        }
      case "yes":
      case "no":
      case "abstain":
        return {
          reason: values.reason || "",
        }
      case "archive":
        return {
          range: values.export ? "export" : values.range || "",
        }
      case "setweight":
        return {
          target: values.target || "",
          weight: typeof values.weight === "number" ? values.weight : 1,
        }
      default:
        return {}
    }
  }

  private buildMember(interaction: SlashInteraction, guild: any) {
    const roleCache = new Collection()
    for (const roleId of interaction.member.roles || []) {
      const role = guild.roles.cache.get(roleId)
      if (role) {
        roleCache.set(role.id, role)
      }
    }

    const permissions = new Permissions(Number(interaction.member.permissions) || 0)

    return {
      id: interaction.member.user.id,
      user: interaction.member.user,
      displayName: interaction.member.nick || interaction.member.user.username,
      roles: {
        cache: roleCache,
      },
      hasPermission: (permission: any) => permissions.has(permission),
      toString: () => `<@${interaction.member.user.id}>`,
    }
  }
}