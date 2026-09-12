// One place that answers "what came off this order, and why".
//
// Every surface that shows an order — the confirmation email, the customer's
// receipt, their order history, the admin order page, the CSV export — has to
// tell the same story, or the shop's books and the customer's receipt stop
// agreeing. Rather than each view deciding for itself which discount columns
// to render, they all render this list.
//
// Takes a raw `orders` row (snake_case, straight from the database).

function money(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

// The discounts on this order, in the order they were applied at checkout:
// free cups first, then the member percentage, then the promo code.
function discountLines(order) {
  const lines = [];

  const reward = money(order.reward_discount);
  if (reward > 0) {
    lines.push({
      key: 'reward',
      label: `Cup gratis (kartu stempel)${order.reward_item ? ` — ${order.reward_item}` : ''}`,
      amount: reward,
    });
  }

  const perk = money(order.perk_discount);
  if (perk > 0) {
    lines.push({
      key: 'perk',
      label: order.perk_note || 'Cup gratis (keanggotaan)',
      amount: perk,
    });
  }

  const tier = money(order.tier_discount);
  if (tier > 0) {
    const percent = Number(order.tier_percent) || 0;
    lines.push({
      key: 'tier',
      label: `Diskon member${order.tier_name ? ` ${order.tier_name}` : ''}${percent ? ` (${percent}%)` : ''}`,
      amount: tier,
    });
  }

  const voucher = money(order.voucher_discount);
  if (voucher > 0) {
    lines.push({
      key: 'voucher',
      label: `Voucher${order.voucher_code ? ` ${order.voucher_code}` : ''}`,
      amount: voucher,
    });
  }

  return lines;
}

function totalDiscount(order) {
  return discountLines(order).reduce((sum, line) => sum + line.amount, 0);
}

// What was waived as goods rather than taken off the price — the part that
// leaves stock but no money, which is the bit that confuses a cash count.
function freeCupValue(order) {
  return money(order.reward_discount) + money(order.perk_discount);
}

// The plain-language version of the same thing, for the one-line explainer
// shown under a total. Returns '' when nothing was discounted.
function discountSummary(order) {
  const lines = discountLines(order);
  if (!lines.length) return '';
  const parts = lines.map((line) => line.label);
  return parts.join(' · ');
}

module.exports = { discountLines, totalDiscount, freeCupValue, discountSummary, money };
