const fs = require("fs")
const path = require("path")

const targets = [
  path.join(__dirname, "..", "node_modules", "@discordjs", "form-data", "lib", "form_data.js"),
  path.join(__dirname, "..", "node_modules", "form-data", "lib", "form_data.js"),
]

for (const target of targets) {
  if (!fs.existsSync(target)) {
    continue
  }

  const original = fs.readFileSync(target, "utf8")
  const patched = original.replace(/\butil\.isArray\b/g, "Array.isArray")

  if (patched !== original) {
    fs.writeFileSync(target, patched)
    console.log(`Patched deprecated util.isArray in ${path.relative(process.cwd(), target)}`)
  }
}