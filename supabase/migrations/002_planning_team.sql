alter table employees drop constraint if exists employees_team_check;
alter table employees add constraint employees_team_check
  check (team in ('디자인', '영상', '기획/마케팅', '미분류'));
