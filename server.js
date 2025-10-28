const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("✅ Smith Assistant Bot is running on Cyclic 🚀");
});

app.listen(3000, () => console.log("🌐 Server online di port 3000"));
