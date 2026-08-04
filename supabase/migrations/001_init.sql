-- RGB 업무일지 schema
-- Public (anon) CRUD for now. Replace RLS when admin Auth is added later.

create extension if not exists "pgcrypto";

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team text not null check (team in ('디자인', '영상', '미분류')),
  grade text not null default '사원',
  role text, -- 디자인 | 퍼블 | 겸업
  daily_rate_override numeric,
  is_former boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  major text, -- 디자인 | 동영상
  category text,
  task text,
  start_month text,
  assignee text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  owner text not null,
  start_time text not null,
  end_time text not null,
  company text not null default '',
  project text not null default '',
  stage text not null default '본작업',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entries_owner_date_idx on entries (owner, date);
create index if not exists entries_date_idx on entries (date);
create index if not exists entries_company_project_idx on entries (company, project);

create table if not exists project_statuses (
  company text not null,
  project text not null,
  status text not null default '진행중' check (status in ('진행중', '완료')),
  primary key (company, project)
);

create table if not exists leaves (
  employee_name text not null,
  date date not null,
  leave_type text not null,
  primary key (employee_name, date)
);

create table if not exists public_duties (
  employee_name text not null,
  date date not null,
  duty_type text not null default '공공업무',
  primary key (employee_name, date)
);

create table if not exists holidays (
  date date primary key,
  name text not null
);

create table if not exists grade_rates (
  grade text primary key,
  daily_rate numeric not null
);

create table if not exists estimates (
  company text not null,
  project text not null,
  amount_manwon numeric not null,
  primary key (company, project)
);

create table if not exists person_estimates (
  company text not null,
  project text not null,
  person text not null,
  amount_manwon numeric not null,
  primary key (company, project, person)
);

create table if not exists task_item_overrides (
  owner text not null,
  company text not null,
  category text not null,
  auto_key text not null,
  label text not null,
  primary key (owner, company, category, auto_key)
);

-- RLS: open for anon (TODO: tighten when admin Auth is added)
alter table employees enable row level security;
alter table companies enable row level security;
alter table entries enable row level security;
alter table project_statuses enable row level security;
alter table leaves enable row level security;
alter table public_duties enable row level security;
alter table holidays enable row level security;
alter table grade_rates enable row level security;
alter table estimates enable row level security;
alter table person_estimates enable row level security;
alter table task_item_overrides enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees','companies','entries','project_statuses','leaves',
    'public_duties','holidays','grade_rates','estimates','person_estimates','task_item_overrides'
  ]
  loop
    execute format('drop policy if exists "public_all_%s" on %I', t, t);
    execute format(
      'create policy "public_all_%s" on %I for all to anon, authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
