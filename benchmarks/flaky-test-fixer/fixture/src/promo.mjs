export function isWeekendSale(date = new Date()) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function pickWinner(entries) {
  return entries[Math.floor(Math.random() * entries.length)];
}
