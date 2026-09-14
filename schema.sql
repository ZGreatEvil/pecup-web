-- Pecup — Neon (Postgres) schema.
--
-- How to use: open your Neon project → SQL Editor → paste this whole file →
-- Run. It creates the tables and the atomic order-creation function. Safe
-- to re-run (everything is IF NOT EXISTS). Product photos and payment-proof
-- uploads live in Vercel Blob, not in this database — see storage.js.

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists products (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  category text not null default 'Buah Tunggal',
  weight text not null default '',
  price integer not null default 0,
  stock integer not null default 0,
  image text,                      -- full public Vercel Blob URL
  active boolean not null default true,
  is_bestseller boolean not null default false,
  is_recommended boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-running this file on a database created before these two flags
-- existed picks them up here (CREATE TABLE IF NOT EXISTS above is a no-op
-- once the table already exists).
alter table products add column if not exists is_bestseller boolean not null default false;
alter table products add column if not exists is_recommended boolean not null default false;

-- Gallery: ordered list of public Blob URLs. `image` above stays as the
-- primary/first photo so older code paths and existing rows keep working;
-- `images` holds the full set the carousel pages through.
alter table products add column if not exists images text[] not null default '{}';

-- Wholesale ("grosir") pricing: from wholesale_min_qty units of this product
-- in one cart line, each unit costs wholesale_price instead of price.
-- wholesale_price = null means this product has no wholesale tier.
alter table products add column if not exists wholesale_min_qty integer not null default 0;
alter table products add column if not exists wholesale_price integer;

create table if not exists orders (
  id bigint generated always as identity primary key,
  order_number text not null default '',
  customer_name text not null,
  whatsapp text not null default '',
  notes text not null default '',
  subtotal integer not null default 0,
  total integer not null default 0,
  proof_filename text,             -- object path inside the private Vercel Blob store
  status text not null default 'menunggu',
  email_sent boolean not null default false,
  email_error text,
  date_key text not null,          -- 'YYYY-MM-DD', local calendar day at checkout time
  address text not null default '', -- short drop-off note: company, floor, landmark
  delivery_date date,              -- the day the customer wants it delivered
  created_at timestamptz not null default now()
);

-- Same as above: picks up the delivery fields on a database created before
-- they existed.
alter table orders add column if not exists address text not null default '';
alter table orders add column if not exists delivery_date date;

-- Loyalty reward applied to this order: how much was waived, and which cup.
-- Stored so a redeemed free cup is auditable after the fact.
alter table orders add column if not exists reward_discount integer not null default 0;
alter table orders add column if not exists reward_item text;

-- Cancellation. Stock is decremented when an order is placed, so cancelling
-- has to give it back — and exactly once, which is what stock_restored
-- guards. Without this an invalid transfer would hold cups hostage forever.
alter table orders add column if not exists stock_restored boolean not null default false;

-- Delivery fee charged on this order, and the voucher (if any) that was
-- applied. Both are snapshots: changing the shop's fee or deleting a voucher
-- later must not rewrite what a past customer actually paid.
alter table orders add column if not exists delivery_fee integer not null default 0;
alter table orders add column if not exists voucher_code text;
alter table orders add column if not exists voucher_discount integer not null default 0;

-- Membership-tier perks applied to this order. Snapshots, like the voucher
-- fields above: editing the tier ladder later must not rewrite history.
--   tier_name/tier_percent — which tier the customer held when they ordered
--   tier_discount          — rupiah taken off by that tier's percentage
--   perk_discount/perk_note — free cups granted by the tier (weekly /
--                             birthday), separate from the stamp-card cup so
--                             finance can tell the two apart.
alter table orders add column if not exists tier_name text;
alter table orders add column if not exists tier_percent integer not null default 0;
alter table orders add column if not exists tier_discount integer not null default 0;
alter table orders add column if not exists perk_discount integer not null default 0;
alter table orders add column if not exists perk_note text;

-- Which tier perks this order actually consumed, and what the customer's perk
-- state was immediately before. Without this a cancelled order could not give
-- a perk back: "weekly cup taken" is a timestamp, so restoring it means
-- putting the OLD timestamp back, not guessing one.
alter table orders add column if not exists perk_weekly_used boolean not null default false;
alter table orders add column if not exists perk_weekly_prev timestamptz;
alter table orders add column if not exists perk_birthday_used boolean not null default false;
alter table orders add column if not exists perk_birthday_prev integer;

-- Has the money actually arrived? Separate from `status`, which tracks
-- FULFILMENT (menunggu → diproses → selesai). A walk-in customer can take
-- their cups and pay on Friday; a transfer can land before anything is
-- prepared. Web checkout sets this the moment a payment proof is uploaded;
-- for a manually recorded sale the admin says which it is.
alter table orders add column if not exists paid boolean not null default false;
alter table orders add column if not exists paid_at timestamptz;

-- Orders placed through the website are paid at checkout (a transfer proof is
-- required before the order is accepted), so rows that pre-date this column
-- are marked paid — except the cancelled ones, which never were.
update orders set paid = true, paid_at = created_at
 where paid = false and status <> 'dibatalkan' and proof_filename is not null;

-- PPN charged on this order. A snapshot like the fields above: turning the
-- tax on or changing its rate later must not rewrite what a past customer
-- actually paid. Both stay 0 while the setting is off, which is how it ships.
alter table orders add column if not exists tax_percent integer not null default 0;
alter table orders add column if not exists tax_amount integer not null default 0;

-- Promo codes. `kind` is 'persen' (percentage off the cups) or 'nominal'
-- (a flat rupiah amount). Redemptions are counted so a limited code can't be
-- over-used, and the count is incremented inside create_order under a row
-- lock so two simultaneous checkouts can't both take the last one.
create table if not exists vouchers (
  id bigint generated always as identity primary key,
  code text not null unique,
  kind text not null default 'persen',
  amount integer not null default 0,
  min_spend integer not null default 0,
  max_discount integer,               -- caps a percentage voucher; null = uncapped
  usage_limit integer,                -- null = unlimited
  used_count integer not null default 0,
  expires_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists vouchers_code_idx on vouchers (upper(code));

-- Returning-customer accounts. The WhatsApp number IS the username (stored
-- in canonical 62xxxxxxxxx form so "0812...", "+62 812..." and "62812..."
-- all resolve to the same account).
create table if not exists customers (
  id bigint generated always as identity primary key,
  whatsapp text not null unique,
  name text not null,
  password_hash text not null,
  address text not null default '',
  created_at timestamptz not null default now()
);

-- Free cups already handed over, so "rewards available" can go down as well
-- as up. Stamps themselves are derived from completed orders.
alter table customers add column if not exists rewards_redeemed integer not null default 0;

-- Superseded by the `stamps` table below — kept so re-running this file on an
-- older database doesn't fail, but no longer read by the app.
alter table customers add column if not exists stamp_adjustment integer not null default 0;

-- Birthday (optional) — drives the per-tier birthday perk.
alter table customers add column if not exists birthday date;

-- When the tier perks were last spent. Both are consumed inside create_order
-- under the customer row lock, so a weekly free cup can't be taken twice by
-- two checkouts racing in separate serverless invocations.
--   weekly_cup_at      — timestamp of the last weekly free cup
--   birthday_cup_year  — the year the birthday cup was last taken
alter table customers add column if not exists weekly_cup_at timestamptz;
alter table customers add column if not exists birthday_cup_year integer;

-- Password resets. A customer has no email on file (the WhatsApp number is
-- the username), so a reset is a request an admin approves out-of-band over
-- WhatsApp: the admin generates a one-time code, reads it to the customer,
-- and the customer sets their own password with it. Only the hash of the
-- code is stored — the same rule as passwords, so a database dump can't be
-- used to take over an account.
create table if not exists password_resets (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  status text not null default 'menunggu',  -- 'menunggu' | 'disetujui' | 'selesai' | 'ditolak'
  code_hash text,                           -- "salt:hash", set when an admin approves
  expires_at timestamptz,                   -- code validity, 30 minutes from approval
  attempts integer not null default 0,      -- wrong-code tries, capped
  note text,
  approved_by text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists idx_password_resets_customer on password_resets(customer_id, status);
create index if not exists idx_password_resets_created on password_resets(created_at desc);

-- Individual stamps, each with the date it was earned. A real row per stamp
-- (rather than a derived count) is what makes expiry dates, "reset to zero on
-- redemption" and an auditable history possible.
--   status: 'active'   — counts toward the current card
--           'redeemed' — spent on a free cup
--           'expired'  — aged out before being spent
create table if not exists stamps (
  id bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  order_id bigint references orders(id) on delete set null,
  earned_at timestamptz not null default now(),
  status text not null default 'active',
  settled_at timestamptz,
  note text
);

-- A stamp is earned per CUP, not per order: buying five cups in one go fills
-- the card five times faster than buying one, which is the whole point of a
-- stamp card. cup_no is that cup's position in the order (1, 2, 3...).
alter table stamps add column if not exists cup_no integer not null default 1;

-- Flipping an order Selesai → Diproses → Selesai must not mint a second set,
-- so (order_id, cup_no) is unique. Not a partial index: Postgres treats NULLs
-- as distinct, so manually-added stamps (order_id null) are unaffected, and a
-- plain index can serve as an ON CONFLICT target (a partial one can't).
drop index if exists idx_stamps_order_id;
create unique index if not exists idx_stamps_order_cup on stamps(order_id, cup_no);
create index if not exists idx_stamps_customer_status on stamps(customer_id, status);

-- How many free cups this customer has actually claimed — drives the tier.
alter table customers add column if not exists rewards_claimed integer not null default 0;

-- Small key/value store for shop-wide settings a superadmin can change
-- without a deploy — currently just how many stamps earn a free cup.
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into settings (key, value) values
  ('stamps_per_reward', '10'),
  ('stamp_expiry_months', '2'),
  ('tiers_enabled', '1'),
  ('tiers', '[]')
on conflict (key) do nothing;

-- Orders placed while signed in are linked to the account, which is what
-- the loyalty stamps are counted from. Guest checkout leaves this null.
alter table orders add column if not exists customer_id bigint references customers(id) on delete set null;
create index if not exists idx_orders_customer_id on orders(customer_id);

-- Order status is one of: 'menunggu' (awaiting payment verification),
-- 'diproses' (verified, being prepared), 'selesai' (delivered/done — this
-- is what earns a loyalty stamp). Renames the older two-state value.
update orders set status = 'diproses' where status = 'terkonfirmasi';

create table if not exists order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references orders(id) on delete cascade,
  product_id bigint,
  product_name text not null,
  price integer not null,
  qty integer not null,
  subtotal integer not null
);

create index if not exists idx_orders_date_key on orders(date_key);
create index if not exists idx_order_items_order_id on order_items(order_id);
-- The order list and the revenue report both filter on status, usually
-- together with a date range, so the two columns are indexed as a pair.
create index if not exists idx_orders_status_date on orders(status, date_key);
-- Sorting the order list by newest.
create index if not exists idx_orders_created_at on orders(created_at desc);

-- Admin accounts. There's always at least one 'superadmin' — only
-- superadmins can add/remove admin accounts or view the activity log;
-- regular 'admin' accounts get full run-of-the-shop access (products +
-- orders). password_hash is "salt:hash" from Node's built-in scrypt (see
-- src/adminAuth.js) — never a plaintext password.
create table if not exists admins (
  id bigint generated always as identity primary key,
  username text not null unique,
  password_hash text not null,
  role text not null default 'admin', -- 'superadmin' | 'admin'
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Inventory, packaging and expenses (the shop's own books)
-- ---------------------------------------------------------------------
-- None of this is ever shown to a shopper: it is the cost side of the
-- business, and every route that touches it is behind an admin permission.
--
-- inventory_items  — the things the shop buys: cups, lids, spoons, labels,
--                    plastic bags, and anything else. Each has a quantity on
--                    hand and what one of them costs.
create table if not exists inventory_items (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null default 'pcs',        -- satuan: pcs, pack, kg, liter...
  stock integer not null default 0,        -- how many are on hand right now
  unit_cost integer not null default 0,    -- rupiah for ONE unit
  low_threshold integer not null default 0, -- warn at or below this (0 = never)
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_inventory_items_active on inventory_items(active, name);

-- product_materials — what ONE cup of a product uses. A product can use
-- several things (a cup AND a lid AND a spoon), which is why this is its own
-- table rather than a column.
create table if not exists product_materials (
  id bigint generated always as identity primary key,
  product_id bigint not null references products(id) on delete cascade,
  item_id bigint not null references inventory_items(id) on delete cascade,
  qty integer not null default 1,          -- units consumed per cup sold
  unique (product_id, item_id)
);
create index if not exists idx_product_materials_product on product_materials(product_id);

-- inventory_moves — every change to a quantity, so the number on hand can
-- always be explained: what was bought, what a sale consumed, what an admin
-- corrected by hand, and what came back when an order was cancelled.
create table if not exists inventory_moves (
  id bigint generated always as identity primary key,
  item_id bigint not null references inventory_items(id) on delete cascade,
  delta integer not null,                  -- + in, − out
  reason text not null,                    -- 'pembelian' | 'pesanan' | 'penyesuaian' | 'batal'
  order_id bigint references orders(id) on delete set null,
  note text not null default '',
  admin_username text,
  created_at timestamptz not null default now()
);
create index if not exists idx_inventory_moves_item on inventory_moves(item_id, created_at desc);
create index if not exists idx_inventory_moves_order on inventory_moves(order_id);

-- expenses — everything the shop pays out. Kept as plain rows with a date key
-- in WIB so a month's figures line up with the sales report beside them.
create table if not exists expenses (
  id bigint generated always as identity primary key,
  date_key text not null,                  -- 'YYYY-MM-DD', Jakarta calendar day
  category text not null default 'Lain-lain',
  description text not null default '',
  amount integer not null,
  item_id bigint references inventory_items(id) on delete set null, -- set when it was a stock purchase
  admin_username text,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_date on expenses(date_key);
create index if not exists idx_expenses_category on expenses(category, date_key);

-- What this order's packaging cost the shop, snapshotted at checkout. A
-- snapshot for the same reason the tax rate and the tier are: changing what a
-- cup costs tomorrow must not rewrite last week's profit.
alter table orders add column if not exists cogs integer not null default 0;

-- Per-account permissions (see src/permissions.js for the catalogue and the
-- rules). NULL means "never set" and is read as the legacy admin capability
-- set, so an account created before this existed keeps exactly what it had;
-- an empty array means a deliberately locked-down account. Superadmins ignore
-- this column entirely — they always have everything.
alter table admins add column if not exists permissions text[];

-- Seed the accounts that pre-date the column, once. The WHERE clause is what
-- makes re-running this file safe: an admin whose permissions a superadmin has
-- since edited (including to "none") is never overwritten.
update admins
   set permissions = array[
     'produk.lihat','produk.kelola','pesanan.lihat','pesanan.status','pesanan.manual',
     'pesanan.unduh','pelanggan.lihat','pelanggan.tambah','laporan.lihat','reset_sandi.kelola'
   ]
 where permissions is null and role <> 'superadmin';

-- Audit trail of admin actions (who did what, when). admin_username is
-- denormalized so entries stay readable even if that admin account is later
-- deleted (admin_id then becomes null via the FK below).
create table if not exists admin_logs (
  id bigint generated always as identity primary key,
  admin_id bigint references admins(id) on delete set null,
  admin_username text not null,
  action text not null,   -- e.g. 'login', 'product.create', 'order.status_update'
  detail text,
  created_at timestamptz not null default now()
);

-- An audit trail that vanishes with the account it accuses is worthless, so
-- this is enforced rather than assumed. `create table if not exists` above
-- leaves an existing table exactly as it is — including a foreign key from an
-- older version of this file — so the rule is (re)applied here every run. It
-- only ever rewrites the constraint when it isn't already SET NULL ('n'), and
-- it never touches a single row.
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where c.conname = 'admin_logs_admin_id_fkey' and t.relname = 'admin_logs' and c.confdeltype <> 'n'
  ) then
    alter table admin_logs drop constraint admin_logs_admin_id_fkey;
    alter table admin_logs
      add constraint admin_logs_admin_id_fkey
      foreign key (admin_id) references admins(id) on delete set null;
  end if;
end $$;

-- Same reason: admin_id has to be nullable for the delete to succeed at all.
alter table admin_logs alter column admin_id drop not null;

create index if not exists idx_admin_logs_created_at on admin_logs(created_at desc);
-- The activity log page filters by who did it and by what kind of action.
create index if not exists idx_admin_logs_username on admin_logs(admin_username, created_at desc);
create index if not exists idx_admin_logs_action on admin_logs(action, created_at desc);

-- No Row Level Security here on purpose: unlike Supabase, a plain Neon
-- database has no bundled public REST API or anon key sitting in front of
-- it — the only way in is your DATABASE_URL connection string, which lives
-- solely in server-side environment variables (never shipped to the
-- browser). Keep it that way and RLS wouldn't be adding any protection
-- PostgREST-style anon access would need it for.

-- ---------------------------------------------------------------------
-- Atomic order creation
-- ---------------------------------------------------------------------
-- Locks the relevant product rows (SELECT ... FOR UPDATE), re-checks stock
-- and price from the database (never trusts client-supplied prices),
-- inserts the order + order_items, and decrements stock — all in one
-- transaction, so two customers checking out the last unit at the same
-- moment can never both succeed.
--
-- p_items shape: [{"productId": 1, "qty": 2, "label": null}, ...]
-- "label" is optional and, when present, overrides the stored order_items
-- product_name for that line — used for fruit-mix cart entries, e.g.
-- "Mix Buah (Mangga, Semangka, Nanas)", since a mix is one product row with
-- a customer-chosen composition rather than its own DB row per combination.

-- Adding parameters to a plpgsql function creates an *overload* rather than
-- replacing it, so drop the previous signature first — otherwise the old
-- 6-argument version lingers and calls can bind to the wrong one.
drop function if exists create_order(text, text, text, jsonb, text, text);
drop function if exists create_order(text, text, text, jsonb, text, text, text, date);
drop function if exists create_order(text, text, text, jsonb, text, text, text, date, bigint);

create or replace function create_order(
  p_customer_name text,
  p_whatsapp text,
  p_notes text,
  p_items jsonb,
  p_proof_filename text,
  p_date_key text,
  p_address text,
  p_delivery_date date,
  p_customer_id bigint,
  p_use_reward boolean,
  p_voucher_code text,
  p_delivery_fee integer,
  p_tier_name text,
  p_tier_percent integer,
  p_tier_weekly boolean,
  p_tier_birthday boolean,
  p_tax_percent integer
) returns jsonb
language plpgsql
as $$
declare
  v_voucher record;
  v_voucher_discount integer := 0;
  v_voucher_code text;
  v_delivery_fee integer := greatest(0, coalesce(p_delivery_fee, 0));
  v_discountable integer;
  v_total integer;
  v_order_id bigint;
  v_order_number text;
  v_subtotal integer := 0;
  v_item jsonb;
  v_product_id bigint;
  v_qty integer;
  v_price integer;
  v_stock integer;
  v_name text;
  v_label text;
  v_wholesale_min integer;
  v_wholesale_price integer;
  v_active boolean;
  v_reward_discount integer := 0;
  v_reward_item text;
  v_per_reward integer;
  v_expiry_months integer;
  v_stamp_count integer;
  v_oldest_stamp timestamptz;
  v_cheapest_price integer;
  v_cheapest_name text;
  v_tier_percent integer := least(100, greatest(0, coalesce(p_tier_percent, 0)));
  v_tax_percent integer := least(100, greatest(0, coalesce(p_tax_percent, 0)));
  v_tax_amount integer := 0;
  v_taxable integer;
  v_cogs integer := 0;
  v_item_cogs integer := 0;
  v_tier_name text;
  v_tier_discount integer := 0;
  v_perk_discount integer := 0;
  v_perk_notes text[] := '{}';
  v_perk_note text;
  v_perk_price integer;
  v_perk_name text;
  v_free_taken integer := 0;
  v_birthday date;
  v_weekly_at timestamptz;
  v_birthday_year integer;
  -- Whether THIS order spent each perk, so cancelling it can hand the perk
  -- back and un-cancelling can take it again.
  v_weekly_taken boolean := false;
  v_birthday_taken boolean := false;
  v_base integer;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong.';
  end if;

  -- Lock every involved product row up front, in a stable (id) order, to
  -- avoid deadlocking against a concurrent checkout that touches the same
  -- products in a different order.
  perform 1
  from products
  where id in (select (value->>'productId')::bigint from jsonb_array_elements(p_items) as value)
  order by id
  for update;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'productId')::bigint;
    v_qty := (v_item->>'qty')::integer;

    select price, stock, name, wholesale_min_qty, wholesale_price, active
      into v_price, v_stock, v_name, v_wholesale_min, v_wholesale_price, v_active
    from products where id = v_product_id;

    if v_price is null then
      raise exception 'Produk % tidak ditemukan.', v_product_id;
    end if;
    -- A product switched off is not for sale. The cart already drops such a
    -- line (src/cart.js) — this is the authority saying so, so a stale cookie
    -- or a direct call can't get around it.
    if not v_active then
      raise exception '% sedang tidak dijual. Hapus dari keranjang lalu coba lagi.', v_name;
    end if;
    if v_stock < v_qty then
      -- No remaining-count in the message: this text is shown verbatim to the
      -- shopper, and stock levels are not theirs to see.
      raise exception 'Stok % tidak mencukupi. Kurangi jumlahnya lalu coba lagi.', v_name;
    end if;

    -- Wholesale tier is applied here, server-side, so the discount can never
    -- be forged by a client sending its own prices.
    if v_wholesale_price is not null and v_wholesale_min > 0 and v_qty >= v_wholesale_min then
      v_price := v_wholesale_price;
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  -- Loyalty reward. Everything here is re-derived from the database and the
  -- customer row is locked FOR UPDATE, so two checkouts racing in separate
  -- serverless invocations can't both spend the same card, and a client can
  -- only ever ask for the reward (p_use_reward) — never name its value.
  -- One lock for every per-customer benefit below (stamp card, weekly cup,
  -- birthday cup): they all read-then-write the same row, so they have to be
  -- serialized together, not one block at a time.
  if p_customer_id is not null and (p_use_reward or coalesce(p_tier_weekly, false) or coalesce(p_tier_birthday, false)) then
    select birthday, weekly_cup_at, birthday_cup_year
      into v_birthday, v_weekly_at, v_birthday_year
    from customers where id = p_customer_id for update;
  end if;

  if p_use_reward and p_customer_id is not null then
    select coalesce(value::integer, 10) into v_per_reward from settings where key = 'stamps_per_reward';
    if v_per_reward is null or v_per_reward < 1 then v_per_reward := 10; end if;
    select coalesce(value::integer, 2) into v_expiry_months from settings where key = 'stamp_expiry_months';
    if v_expiry_months is null or v_expiry_months < 1 then v_expiry_months := 2; end if;

    select min(earned_at), count(*) into v_oldest_stamp, v_stamp_count
    from stamps where customer_id = p_customer_id and status = 'active';

    -- The whole card lapses together, dated from its oldest stamp.
    if v_oldest_stamp is not null
       and now() > v_oldest_stamp + (v_expiry_months || ' months')::interval then
      update stamps set status = 'expired', settled_at = now()
      where customer_id = p_customer_id and status = 'active';
      v_stamp_count := 0;
    end if;

    if v_stamp_count >= v_per_reward then
      -- The cheapest cup in the order is the one waived. Cups are expanded
      -- one row per unit (generate_series) and priced at their *effective*
      -- price, so a wholesale line can't be waived at its full-price value.
      select price, name into v_cheapest_price, v_cheapest_name
      from (
        select case
                 when p.wholesale_price is not null and p.wholesale_min_qty > 0
                      and (item->>'qty')::integer >= p.wholesale_min_qty
                 then p.wholesale_price else p.price
               end as price,
               p.name as name
        from jsonb_array_elements(p_items) as item
        join products p on p.id = (item->>'productId')::bigint
        cross join generate_series(1, (item->>'qty')::integer)
      ) units
      order by price asc
      offset v_free_taken
      limit 1;

      if v_cheapest_price is not null then
        v_reward_discount := least(v_cheapest_price, v_subtotal);
        v_reward_item := v_cheapest_name;
        v_free_taken := v_free_taken + 1;
        -- Spending a card resets the stamp count to zero and bumps the claim
        -- counter, which is what drives the membership tier.
        update stamps set status = 'redeemed', settled_at = now()
        where customer_id = p_customer_id and status = 'active';
        update customers set rewards_claimed = coalesce(rewards_claimed, 0) + 1
        where id = p_customer_id;
      end if;
    end if;
  end if;

  -- Membership-tier free cups (weekly / birthday). Which tier the customer
  -- holds is worked out by the app from their claim count and the saved
  -- ladder, but whether the perk is still *available* is decided here, under
  -- the customer lock taken above — that's what stops the same weekly cup
  -- being spent twice by two checkouts at once. Each free cup takes the next
  -- cheapest remaining unit, so three perks on a two-cup order can only ever
  -- waive two cups.
  if p_customer_id is not null then
    if coalesce(p_tier_weekly, false)
       and (v_weekly_at is null
            or (v_weekly_at at time zone 'Asia/Jakarta') < date_trunc('week', now() at time zone 'Asia/Jakarta')) then
      select price, name into v_perk_price, v_perk_name
      from (
        select case
                 when p.wholesale_price is not null and p.wholesale_min_qty > 0
                      and (item->>'qty')::integer >= p.wholesale_min_qty
                 then p.wholesale_price else p.price
               end as price,
               p.name as name
        from jsonb_array_elements(p_items) as item
        join products p on p.id = (item->>'productId')::bigint
        cross join generate_series(1, (item->>'qty')::integer)
      ) units
      order by price asc
      offset v_free_taken
      limit 1;

      if v_perk_price is not null then
        v_perk_price := least(v_perk_price, greatest(0, v_subtotal - v_reward_discount - v_perk_discount));
        if v_perk_price > 0 then
          v_perk_discount := v_perk_discount + v_perk_price;
          v_free_taken := v_free_taken + 1;
          v_perk_notes := array_append(
            v_perk_notes,
            'Cup gratis mingguan' || coalesce(' (' || nullif(btrim(coalesce(p_tier_name, '')), '') || ')', '') || ' — ' || v_perk_name
          );
          update customers set weekly_cup_at = now() where id = p_customer_id;
          v_weekly_taken := true;
        end if;
      end if;
    end if;

    -- Birthday cup: keyed to the delivery date (the day they actually get
    -- it), and only once per calendar year.
    if coalesce(p_tier_birthday, false)
       and v_birthday is not null
       and to_char(v_birthday, 'MM-DD')
           = to_char(coalesce(p_delivery_date, (now() at time zone 'Asia/Jakarta')::date), 'MM-DD')
       and coalesce(v_birthday_year, 0)
           <> extract(year from coalesce(p_delivery_date, (now() at time zone 'Asia/Jakarta')::date))::integer then
      select price, name into v_perk_price, v_perk_name
      from (
        select case
                 when p.wholesale_price is not null and p.wholesale_min_qty > 0
                      and (item->>'qty')::integer >= p.wholesale_min_qty
                 then p.wholesale_price else p.price
               end as price,
               p.name as name
        from jsonb_array_elements(p_items) as item
        join products p on p.id = (item->>'productId')::bigint
        cross join generate_series(1, (item->>'qty')::integer)
      ) units
      order by price asc
      offset v_free_taken
      limit 1;

      if v_perk_price is not null then
        v_perk_price := least(v_perk_price, greatest(0, v_subtotal - v_reward_discount - v_perk_discount));
        if v_perk_price > 0 then
          v_perk_discount := v_perk_discount + v_perk_price;
          v_free_taken := v_free_taken + 1;
          v_perk_notes := array_append(v_perk_notes, 'Cup gratis ulang tahun — ' || v_perk_name);
          update customers set birthday_cup_year =
            extract(year from coalesce(p_delivery_date, (now() at time zone 'Asia/Jakarta')::date))::integer
          where id = p_customer_id;
          v_birthday_taken := true;
        end if;
      end if;
    end if;
  end if;

  if array_length(v_perk_notes, 1) is not null then
    v_perk_note := array_to_string(v_perk_notes, ' · ');
  end if;

  -- Tier percentage, applied to what's left after the free cups and before
  -- any voucher — a member discount is part of the price, a promo code comes
  -- off the discounted price.
  v_tier_name := nullif(btrim(coalesce(p_tier_name, '')), '');
  v_base := greatest(0, v_subtotal - v_reward_discount - v_perk_discount);
  if v_tier_percent > 0 and v_base > 0 then
    v_tier_discount := (v_base * v_tier_percent) / 100;
  end if;

  -- Voucher. Validated and consumed here, under a row lock, so a code with
  -- one use left can't be spent twice by two simultaneous checkouts. The
  -- client only ever sends the code text — the value is computed here.
  if p_voucher_code is not null and btrim(p_voucher_code) <> '' then
    select * into v_voucher from vouchers
    where upper(code) = upper(btrim(p_voucher_code)) for update;

    if v_voucher.id is null then
      raise exception 'Kode voucher tidak ditemukan.';
    end if;
    if not v_voucher.active then
      raise exception 'Kode voucher sudah tidak aktif.';
    end if;
    if v_voucher.expires_at is not null and v_voucher.expires_at < current_date then
      raise exception 'Kode voucher sudah kedaluwarsa.';
    end if;
    if v_voucher.usage_limit is not null and v_voucher.used_count >= v_voucher.usage_limit then
      raise exception 'Kuota kode voucher sudah habis.';
    end if;
    if v_subtotal < v_voucher.min_spend then
      raise exception 'Minimal belanja untuk kode ini adalah Rp%.', v_voucher.min_spend;
    end if;

    -- The voucher applies to what's left after the free cups and the member
    -- discount, so the discounts can never together exceed the cups' value.
    v_discountable := greatest(0, v_subtotal - v_reward_discount - v_perk_discount - v_tier_discount);
    if v_voucher.kind = 'nominal' then
      v_voucher_discount := least(v_voucher.amount, v_discountable);
    else
      v_voucher_discount := (v_discountable * v_voucher.amount) / 100;
      if v_voucher.max_discount is not null then
        v_voucher_discount := least(v_voucher_discount, v_voucher.max_discount);
      end if;
      v_voucher_discount := least(v_voucher_discount, v_discountable);
    end if;

    v_voucher_code := v_voucher.code;
    update vouchers set used_count = used_count + 1 where id = v_voucher.id;
  end if;

  -- PPN, if the shop has it switched on. Charged on the cups after every
  -- discount — a promo lowers the price, and tax follows the price actually
  -- paid — and not on the delivery fee. Integer division truncates, which is
  -- the same direction the preview in src/settings.js rounds.
  v_taxable := greatest(0, v_subtotal - v_reward_discount - v_perk_discount - v_tier_discount - v_voucher_discount);
  if v_tax_percent > 0 then
    v_tax_amount := (v_taxable * v_tax_percent) / 100;
  end if;

  -- Delivery fee is added after discounts: a promo reduces the cups, not the
  -- cost of getting them there.
  v_total := v_taxable + v_tax_amount + v_delivery_fee;

  insert into orders (order_number, customer_name, whatsapp, notes, subtotal, total, proof_filename, status, date_key, address, delivery_date, customer_id, reward_discount, reward_item, voucher_code, voucher_discount, delivery_fee, tier_name, tier_percent, tier_discount, perk_discount, perk_note, tax_percent, tax_amount, perk_weekly_used, perk_weekly_prev, perk_birthday_used, perk_birthday_prev)
  values ('TEMP', p_customer_name, p_whatsapp, coalesce(p_notes, ''), v_subtotal, v_total, p_proof_filename, 'menunggu', p_date_key, coalesce(p_address, ''), p_delivery_date, p_customer_id, v_reward_discount, v_reward_item, v_voucher_code, v_voucher_discount, v_delivery_fee, v_tier_name, v_tier_percent, v_tier_discount, v_perk_discount, v_perk_note, v_tax_percent, v_tax_amount, v_weekly_taken, case when v_weekly_taken then v_weekly_at end, v_birthday_taken, case when v_birthday_taken then v_birthday_year end)
  returning id into v_order_id;

  -- Explicitly WIB: the database session runs in GMT, so a plain now() would
  -- stamp orders taken between midnight and 07:00 WIB with the previous day.
  v_order_number := 'PC-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDD')
                    || '-' || lpad(v_order_id::text, 4, '0');
  update orders set order_number = v_order_number where id = v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'productId')::bigint;
    v_qty := (v_item->>'qty')::integer;
    v_label := v_item->>'label';

    select price, name, wholesale_min_qty, wholesale_price
      into v_price, v_name, v_wholesale_min, v_wholesale_price
    from products where id = v_product_id;

    if v_wholesale_price is not null and v_wholesale_min > 0 and v_qty >= v_wholesale_min then
      v_price := v_wholesale_price;
    end if;

    insert into order_items (order_id, product_id, product_name, price, qty, subtotal)
    values (v_order_id, v_product_id, coalesce(v_label, v_name), v_price, v_qty, v_price * v_qty);

    -- The check above (near the top of this function) catches the ordinary
    -- case, but it is a separate statement: two orders submitted in the same
    -- moment can both pass it and oversell the last cups. Here the check and
    -- the decrement are ONE statement, so the row lock settles the race and
    -- the loser raises instead of the stock silently clamping to zero.
    update products set stock = stock - v_qty
     where id = v_product_id and stock >= v_qty;
    if not found then
      raise exception 'Stok % tidak mencukupi. Kurangi jumlahnya lalu coba lagi.',
        coalesce(v_label, v_name, 'produk');
    end if;

    -- Packaging and materials come off the shop's own inventory in the same
    -- transaction as the sale, so the cup count can't drift from what was
    -- actually sold. A shortage does NOT block the order: the customer is not
    -- the right person to tell about the shop's own stockroom, and a negative
    -- number is a truthful "you sold more than you recorded buying" that the
    -- inventory page shows in red.
    insert into inventory_moves (item_id, delta, reason, order_id, note)
    select m.item_id, -(m.qty * v_qty), 'pesanan', v_order_id,
           coalesce(v_label, v_name, '') || ' ×' || v_qty
      from product_materials m
     where m.product_id = v_product_id;

    update inventory_items i
       set stock = i.stock - (m.qty * v_qty)
      from product_materials m
     where m.product_id = v_product_id and i.id = m.item_id;

    -- ...and what that packaging cost, banked onto the order so the profit
    -- report can never be rewritten by a later price change.
    select coalesce(sum(m.qty * v_qty * i.unit_cost), 0) into v_item_cogs
      from product_materials m join inventory_items i on i.id = m.item_id
     where m.product_id = v_product_id;
    v_cogs := v_cogs + v_item_cogs;
  end loop;

  update orders set cogs = v_cogs where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'subtotal', v_subtotal,
    'rewardDiscount', v_reward_discount,
    'rewardItem', v_reward_item,
    'voucherCode', v_voucher_code,
    'voucherDiscount', v_voucher_discount,
    'deliveryFee', v_delivery_fee,
    'tierName', v_tier_name,
    'tierPercent', v_tier_percent,
    'tierDiscount', v_tier_discount,
    'perkDiscount', v_perk_discount,
    'perkNote', v_perk_note,
    'taxPercent', v_tax_percent,
    'taxAmount', v_tax_amount,
    'cogs', v_cogs,
    'total', v_total
  );
end;
$$;

-- Adding parameters creates an OVERLOAD rather than replacing the function,
-- so every previous signature has to be dropped explicitly or both versions
-- stay callable and the old one silently ignores the newer discounts.
drop function if exists create_order(text, text, text, jsonb, text, text, text, date, bigint, boolean);
drop function if exists create_order(text, text, text, jsonb, text, text, text, date, bigint, boolean, text, integer);
-- The 16-argument version, before PPN was added as the 17th.
drop function if exists create_order(text, text, text, jsonb, text, text, text, date, bigint, boolean, text, integer, text, integer, boolean, boolean);

-- Note: there's no "storage buckets" step here anymore. File storage (product
-- photos, payment proofs) lives in Vercel Blob, not in this Postgres
-- database — create the two Blob stores from the Vercel dashboard/CLI
-- instead (see DEPLOY.txt / README.md).

-- ---------------------------------------------------------------------
-- Seed data (optional) — 8 sample products so the storefront isn't empty
-- the first time you deploy. Delete or edit freely from the admin panel.
-- ---------------------------------------------------------------------

insert into products (name, description, category, weight, price, stock, image, active)
select * from (values
  ('Mangga Harum Manis', 'Potongan mangga harum manis matang, manis dan segar.', 'Buah Tunggal', '250 gr', 18000, 25, null::text, true),
  ('Semangka Merah', 'Semangka merah tanpa biji, dipotong dadu segar.', 'Buah Tunggal', '300 gr', 15000, 30, null::text, true),
  ('Nanas Madu', 'Nanas madu manis, sudah dibuang mata dan intinya.', 'Buah Tunggal', '250 gr', 16000, 20, null::text, true),
  ('Pepaya California', 'Pepaya california matang pohon, tekstur lembut.', 'Buah Tunggal', '300 gr', 14000, 22, null::text, true),
  ('Melon Golden', 'Melon golden segar, manis dan renyah.', 'Buah Tunggal', '250 gr', 19000, 18, null::text, true),
  ('Jambu Biji', 'Jambu biji merah segar, dipotong dadu, renyah dan manis.', 'Buah Tunggal', '250 gr', 15000, 20, null::text, true),
  ('Mix Buah Pilihan Sendiri', 'Pilih sendiri 2 atau 3 buah favoritmu dari 6 pilihan buah segar kami.', 'Mix Buah', '300 gr', 20000, 20, null::text, true),
  ('Salad Buah Campur', 'Campuran mangga, semangka, melon, nanas, dan anggur.', 'Salad Buah', '350 gr', 25000, 15, null::text, true),
  ('Rujak Buah Bumbu Kacang', 'Campuran buah segar dengan bumbu rujak kacang khas.', 'Rujak', '350 gr', 22000, 12, null::text, true),
  ('Jus Buah Mix Segar', 'Buah potong campur cocok untuk jus, tanpa gula tambahan.', 'Salad Buah', '400 gr', 28000, 10, null::text, true)
) as seed(name, description, category, weight, price, stock, image, active)
where not exists (select 1 from products);
