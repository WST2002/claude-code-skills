function getTotal(items) {
  var total = 0;
  for (const item of items) total += item.price * item.quantity;
  return total;
}

function pageOf(items, page, size) {
  return items.slice(page * size, page * size + size);
}

module.exports = { getTotal, pageOf };
