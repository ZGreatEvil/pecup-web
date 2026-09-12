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

-- One stamp per order, so flipping an order Selesai → Diproses → Selesai
-- can't mint extra stamps. Not a partial index: Postgres treats NULLs as
-- distinct, so manually-added stamps (order_id null) are unaffected, and a
-- plain index can serve as an ON CONFLICT target (a partial one can't).
create unique index if not exists idx_stamps_order_id on stamps(order_id);
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

create index if not exists idx_admin_logs_created_at on admin_logs(created_at desc);

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
  p_delivery_fee integer
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
  v_reward_discount integer := 0;
  v_reward_item text;
  v_per_reward integer;
  v_expiry_months integer;
  v_stamp_count integer;
  v_oldest_stamp timestamptz;
  v_cheapest_price integer;
  v_cheapest_name text;
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

    select price, stock, name, wholesale_min_qty, wholesale_price
      into v_price, v_stock, v_name, v_wholesale_min, v_wholesale_price
    from products where id = v_product_id;

    if v_price is null then
      raise exception 'Produk % tidak ditemukan.', v_product_id;
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
  if p_use_reward and p_customer_id is not null then
    perform 1 from customers where id = p_customer_id for update;

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
      -- The cheapest cup in the order is the one waived.
      select p.price, p.name into v_cheapest_price, v_cheapest_name
      from jsonb_array_elements(p_items) as item
      join products p on p.id = (item->>'productId')::bigint
      order by p.price asc
      limit 1;

      if v_cheapest_price is not null then
        v_reward_discount := least(v_cheapest_price, v_subtotal);
        v_reward_item := v_cheapest_name;
        -- Spending a card resets the stamp count to zero and bumps the claim
        -- counter, which is what drives the membership tier.
        update stamps set status = 'redeemed', settled_at = now()
        where customer_id = p_customer_id and status = 'active';
        update customers set rewards_claimed = coalesce(rewards_claimed, 0) + 1
        where id = p_customer_id;
      end if;
    end if;
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

    -- The voucher applies to what's left after the free cup, so the two
    -- discounts can never together exceed the value of the cups.
    v_discountable := greatest(0, v_subtotal - v_reward_discount);
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

  -- Delivery fee is added after discounts: a promo reduces the cups, not the
  -- cost of getting them there.
  v_total := greatest(0, v_subtotal - v_reward_discount - v_voucher_discount) + v_delivery_fee;

  insert into orders (order_number, customer_name, whatsapp, notes, subtotal, total, proof_filename, status, date_key, address, delivery_date, customer_id, reward_discount, reward_item, voucher_code, voucher_discount, delivery_fee)
  values ('TEMP', p_customer_name, p_whatsapp, coalesce(p_notes, ''), v_subtotal, v_total, p_proof_filename, 'menunggu', p_date_key, coalesce(p_address, ''), p_delivery_date, p_customer_id, v_reward_discount, v_reward_item, v_voucher_code, v_voucher_discount, v_delivery_fee)
  returning id into v_order_id;

  v_order_number := 'PC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_order_id::text, 4, '0');
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

    update products set stock = greatest(0, stock - v_qty) where id = v_product_id;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'subtotal', v_subtotal,
    'rewardDiscount', v_reward_discount,
    'rewardItem', v_reward_item,
    'voucherCode', v_voucher_code,
    'voucherDiscount', v_voucher_discount,
    'deliveryFee', v_delivery_fee,
    'total', v_total
  );
end;
$$;

-- Adding parameters creates an OVERLOAD rather than replacing the function,
-- so the previous 10-argument signature has to be dropped explicitly or both
-- versions stay callable and the old one silently ignores vouchers.
drop function if exists create_order(text, text, text, jsonb, text, text, text, date, bigint, boolean);

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
