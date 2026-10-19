import _ from "lodash";
import moment from "moment";
async function load() {
  const user = await fetch("/api/user").then((r) => r.json());
  const products = await fetch("/api/products").then((r) => r.json());
  const reviews = await Promise.all(products.map((p) => fetch(`/api/reviews/${p.id}`).then((r) => r.json())));
  document.getElementById("products").innerHTML = _.map(products, (p, i) => `<div>${p.name} ${moment(p.date).format("LL")} ${reviews[i].length}</div>`).join("");
}
window.addEventListener("scroll", () => {
  document.querySelectorAll(".card").forEach((card) => { card.style.height = card.offsetHeight + 1 + "px"; });
});
load();