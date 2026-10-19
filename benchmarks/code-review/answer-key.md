Real defects (7):
1 getTotal renamed to calculateTotal; src/api.js still imports getTotal -> undefined -> crash (breaking change)
2 pageOf off-by-one: size + 1 returns one extra item
3 placeOrder: db.saveOrder not awaited -> errors lost, returns ok before save
4 chargeOrder: empty catch swallows payment failure, order marked paid anyway (critical)
5 canDelete inverted: non-admins can delete, admins cannot (critical)
6 shippingCity: removed null guard; users without profile crash
7 findOrders: SQL injection (string concat replaced parameterized query)
Style-only (should NOT be flagged as defects, at most nits): var->const reduce refactor, extra blank lines, order->newOrder rename, createdAt added.
