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

// PPN charged on this order, or null if there wasn't any — which is every
// order placed while the setting is off, and every order placed before it
// existed. Read from the order, never recomputed: the rate is a snapshot, so
// turning the tax off tomorrow must not rewrite yesterday's receipt.
function taxLine(order) {
  const amount = money(order.tax_amount);
  if (amount <= 0) return null;
  const percent = Number(order.tax_percent) || 0;
  return { key: 'tax', label: percent ? `PPN ${percent}%` : 'PPN', amount, percent };
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

module.exports = { discountLines, taxLine, totalDiscount, freeCupValue, discountSummary, money };
