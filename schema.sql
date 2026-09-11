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
  created_at timestamptz not null default now()
);

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

create or replace function create_order(
  p_customer_name text,
  p_whatsapp text,
  p_notes text,
  p_items jsonb,
  p_proof_filename text,
  p_date_key text
) returns jsonb
language plpgsql
as $$
declare
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

    select price, stock, name into v_price, v_stock, v_name
    from products where id = v_product_id;

    if v_price is null then
      raise exception 'Produk % tidak ditemukan.', v_product_id;
    end if;
    if v_stock < v_qty then
      raise exception 'Stok % tidak mencukupi (tersisa %).', v_name, v_stock;
    end if;

    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;

  insert into orders (order_number, customer_name, whatsapp, notes, subtotal, total, proof_filename, status, date_key)
  values ('TEMP', p_customer_name, p_whatsapp, coalesce(p_notes, ''), v_subtotal, v_subtotal, p_proof_filename, 'menunggu', p_date_key)
  returning id into v_order_id;

  v_order_number := 'PC-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_order_id::text, 4, '0');
  update orders set order_number = v_order_number where id = v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'productId')::bigint;
    v_qty := (v_item->>'qty')::integer;
    v_label := v_item->>'label';

    select price, name into v_price, v_name from products where id = v_product_id;

    insert into order_items (order_id, product_id, product_name, price, qty, subtotal)
    values (v_order_id, v_product_id, coalesce(v_label, v_name), v_price, v_qty, v_price * v_qty);

    update products set stock = greatest(0, stock - v_qty) where id = v_product_id;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'orderNumber', v_order_number,
    'subtotal', v_subtotal,
    'total', v_subtotal
  );
end;
$$;

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
