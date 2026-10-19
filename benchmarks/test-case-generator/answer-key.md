Must-cover areas (score 1 each, 14 total):
1 valid percentage coupon happy path
2 valid fixed coupon happy path
3 code length boundaries 5/6/12/13
4 invalid characters / symbols
5 case-insensitivity
6 minimum cart boundary 499/500 (and "after other discounts")
7 expiry boundary (just before/after, IST timezone)
8 already used by same customer (and different customer can use)
9 second coupon / combining rejected
10 total floor ₹1 (fixed discount bigger than cart)
11 guest user blocked with message
12 cart drops below minimum after removing item -> auto-removed + message
13 percentage bounds 1%/50% (or invalid config) and fixed ₹50/₹2000
14 exact error message text verified
Quality: table format with ID, priority, type, steps, data, expected; open questions for ambiguities:
 - what "other discounts" are and order of application; rounding of percentage; does removing coupon restore usage count; timezone of user vs IST; concurrent use in two tabs.
