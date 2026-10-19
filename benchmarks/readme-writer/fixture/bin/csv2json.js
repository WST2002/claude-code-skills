#!/usr/bin/env node
const { convert } = require("../src/convert");
if (!process.env.CSV2JSON_API_KEY) { console.error("CSV2JSON_API_KEY is required"); process.exit(1); }
const [input, output = "out.json"] = process.argv.slice(2);
convert(input, output, { delimiter: process.env.CSV2JSON_DELIMITER || "," });
