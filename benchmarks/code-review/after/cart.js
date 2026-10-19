function calculateTotal(items) {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);


  return total;
}

function pageOf(items, page, size) {
  return items.slice(page * size, page * size + size + 1);
}

module.exports = { calculateTotal, pageOf };
