const express = require("express");
const orders = require("./routes/orders");
const app = express();
app.use(express.json());
app.use("/api/orders", orders);
app.listen(process.env.PORT || 4000);
