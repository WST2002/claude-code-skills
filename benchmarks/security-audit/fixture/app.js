const express = require("express");
const cors = require("cors");
const users = require("./routes/users");
const files = require("./routes/files");
const orders = require("./routes/orders");

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  console.log("request", req.method, req.url, JSON.stringify(req.headers));
  next();
});

app.get("/hello", (req, res) => {
  res.send(`<h1>Hello ${req.query.name}</h1>`);
});

app.use("/users", users);
app.use("/files", files);
app.use("/orders", orders);

app.listen(3000);
