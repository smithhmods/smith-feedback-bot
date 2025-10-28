require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
  EmbedBuilder,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TESTIMONI_CHANNEL_ID = "1316051418494271561";
const OWNER_ID = "1075331935594893412"; // ID kamu (Smith)

// === SETUP CLIENT ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// === COMMANDS ===
const commands = [
  new SlashCommandBuilder()
    .setName("done")
    .setDescription("Tandai transaksi selesai dan kirim form testimoni ke pembeli.")
    .addUserOption((option) =>
      option
        .setName("pembeli")
        .setDescription("User pembeli yang akan dikirimi form testimoni")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("riviewlist")
    .setDescription("Lihat semua testimoni dari file CSV (khusus owner)."),
].map((cmd) => cmd.toJSON());

// === REGISTER COMMANDS ===
const rest = new REST({ version: "10" }).setToken(TOKEN);
(async () => {
  try {
    console.log("⏳ Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Commands registered successfully!");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }
})();

client.once("ready", () =>
  console.log(`✅ Logged in as ${client.user.tag}`)
);

// === HANDLE /DONE COMMAND ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "done") return;

  await interaction.deferReply({ ephemeral: true }); // 🧠 Cegah timeout Discord

  const pembeli = interaction.options.getUser("pembeli");
  try {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("open_feedback_modal")
        .setLabel("⭐ Isi Feedback")
        .setStyle(ButtonStyle.Primary)
    );

    await pembeli.send({
      content: `Halo ${pembeli}, 👋\nTransaksimu telah selesai!\nKlik tombol di bawah ini untuk mengisi rating & testimoni 💬`,
      components: [row],
    });

    await interaction.editReply({
      content: `✅ DM form testimoni telah dikirim ke ${pembeli.tag}`,
    });
  } catch (err) {
    console.error("❌ Gagal kirim DM:", err);
    await interaction.editReply({
      content: `⚠️ Gagal kirim DM ke ${pembeli.tag}. Pastikan dia buka DM.`,
    });
  }
});

// === HANDLE BUTTON (BUKA FORM) ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton() || interaction.customId !== "open_feedback_modal") return;

  const modal = new ModalBuilder()
    .setCustomId("feedback_modal")
    .setTitle("⭐ Isi Feedback Produk");

  const fields = [
    { id: "produk", label: "Nama Produk", style: TextInputStyle.Short, required: true },
    { id: "harga", label: "Harga Produk (IDR)", style: TextInputStyle.Short, required: true },
    { id: "rating", label: "Rating (1–10)", style: TextInputStyle.Short, required: true },
    { id: "komentar", label: "Komentar", style: TextInputStyle.Paragraph, required: true },
    { id: "gambar", label: "Link Gambar Produk (opsional)", style: TextInputStyle.Short, required: false },
  ];

  modal.addComponents(
    ...fields.map((f) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(f.style)
          .setRequired(f.required)
      )
    )
  );

  await interaction.showModal(modal);
});

// === HANDLE FORM SUBMIT ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isModalSubmit() || interaction.customId !== "feedback_modal") return;

  const produk = interaction.fields.getTextInputValue("produk");
  const hargaInput = interaction.fields.getTextInputValue("harga");
  const rating = parseInt(interaction.fields.getTextInputValue("rating"));
  const komentar = interaction.fields.getTextInputValue("komentar");
  const gambar = interaction.fields.getTextInputValue("gambar");

  const harga = parseInt(hargaInput.replace(/[^0-9]/g, "")) || hargaInput;
  const stars = "⭐".repeat(Math.min(10, Math.max(1, rating)));
  const color = rating <= 4 ? 0xff0000 : rating <= 7 ? 0xffcc00 : 0x00ff66;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("<a:sparklez:1432624249171869746> Rating & Feedback")
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .setDescription(`
**Pembeli:** ${interaction.user}
**Produk:** ${produk}
**Harga:** ${isNaN(harga) ? hargaInput : harga.toLocaleString()} IDR
**Rating:** ${stars}
**Komentar:** ${komentar}
    `)
    .setFooter({ text: new Date().toLocaleString() });

  if (gambar && gambar.startsWith("http")) embed.setImage(gambar);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(TESTIMONI_CHANNEL_ID);
    if (!channel) throw new Error("Channel testimoni tidak ditemukan.");

    const filePath = path.resolve("./testimoni.csv");
    const waktu = new Date().toLocaleString();
    const row = `"${interaction.user.username}","${produk}","${isNaN(harga) ? hargaInput : harga.toLocaleString()}","${rating}","${komentar.replace(/"/g, '""')}","${waktu}"\n`;

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "User,Produk,Harga,Rating,Komentar,Waktu\n");
    }
    fs.appendFileSync(filePath, row);

    await channel.send({ embeds: [embed] });

    if (rating < 5) {
      try {
        const owner = await client.users.fetch(OWNER_ID);
        await owner.send(
          `⚠️ **Ada rating rendah (${rating}/10)** dari **${interaction.user.username}**!\n📦 Produk: **${produk}**\n💬 Komentar: "${komentar}"`
        );
      } catch (err) {
        console.error("❌ Gagal kirim DM ke owner:", err);
      }
    }

    await interaction.reply({
      content: "✅ Terima kasih! Testimonimu sudah terkirim 💖",
      ephemeral: true,
    });
  } catch (err) {
    console.error("❌ Error kirim testimoni:", err);
    await interaction.reply({
      content: "⚠️ Gagal kirim testimoni. Coba lagi nanti!",
      ephemeral: true,
    });
  }
});

// === HANDLE /RIVIEWLIST ===
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "riviewlist") return;

  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({
      content: "⚠️ Kamu tidak punya izin untuk pakai command ini.",
      ephemeral: true,
    });
  }

  const filePath = path.resolve("./testimoni.csv");
  if (!fs.existsSync(filePath)) {
    return interaction.reply({
      content: "❌ Belum ada testimoni yang tersimpan.",
      ephemeral: true,
    });
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8").split("\n").slice(1);
    const reviews = data
      .filter((line) => line.trim() !== "")
      .map((line, i) => {
        const [user, produk, harga, rating, komentar, waktu] = line
          .split(",")
          .map((x) => x.replace(/"/g, "").trim());
        return `**${i + 1}. ${user}** — ⭐ **${rating}/10**\n🛍️ *${produk}* — 💸 ${harga} IDR\n💬 ${komentar}\n🕒 ${waktu}`;
      });

    if (reviews.length === 0) {
      return interaction.reply({
        content: "❌ Belum ada testimoni yang valid.",
        ephemeral: true,
      });
    }

    const chunkSize = 5;
    const chunks = [];
    for (let i = 0; i < reviews.length; i += chunkSize) {
      chunks.push(reviews.slice(i, i + chunkSize));
    }

    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setTitle(`📋 Daftar Testimoni (Hal ${i + 1}/${chunks.length})`)
        .setDescription(chunks[i].join("\n\n"))
        .setColor(0x00bfff)
        .setFooter({ text: `Total Testimoni: ${reviews.length}` });

      await interaction.user.send({ embeds: [embed] });
    }

    await interaction.reply({
      content: `✅ Semua testimoni (${reviews.length}) telah dikirim ke DM kamu 💌`,
      ephemeral: true,
    });
  } catch (err) {
    console.error("❌ Error baca CSV:", err);
    await interaction.reply({
      content: "⚠️ Gagal membaca file testimoni.",
      ephemeral: true,
    });
  }
});

client.login(TOKEN);
