const fs = require("fs");
exports.convert = (input, output, { delimiter }) => {
  const [header, ...rows] = fs.readFileSync(input, "utf8").trim().split("
").map((l) => l.split(delimiter));
  fs.writeFileSync(output, JSON.stringify(rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]]))), null, 2));
};
