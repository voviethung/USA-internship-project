-- ============================================================
-- Template Training Schema + Seed (Supabase)
-- Run in Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists public.training_templates (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  title text not null,
  version text,
  target_audience text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.template_sections (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid not null references public.training_templates(id) on delete cascade,
  section_key text not null,
  week_no int,
  track_no int,
  title text not null,
  section_type text not null check (
    section_type in ('overview', 'usage', 'track', 'roleplay', 'master_phrase', 'practice', 'scenario')
  ),
  sort_order int not null,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, section_key)
);

create index if not exists idx_template_sections_template_sort
  on public.template_sections(template_id, sort_order);

create table if not exists public.template_lines (
  id uuid primary key default uuid_generate_v4(),
  section_id uuid not null references public.template_sections(id) on delete cascade,
  line_no int not null,
  role_label text,
  line_kind text not null check (
    line_kind in ('text', 'note', 'practice', 'instructor', 'student', 'bullet')
  ),
  language_code text not null check (language_code in ('en', 'vi')),
  text_content text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (section_id, line_no)
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'template_lines_section_id_line_no_key'
      and conrelid = 'public.template_lines'::regclass
  ) then
    alter table public.template_lines drop constraint template_lines_section_id_line_no_key;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'template_lines_section_line_lang_key'
      and conrelid = 'public.template_lines'::regclass
  ) then
    alter table public.template_lines
      add constraint template_lines_section_line_lang_key unique (section_id, line_no, language_code);
  end if;
end $$;

create index if not exists idx_template_lines_section_line
  on public.template_lines(section_id, line_no);

alter table public.training_templates enable row level security;
alter table public.template_sections enable row level security;
alter table public.template_lines enable row level security;

-- Read-only for authenticated users (API currently uses service role, but this keeps schema ready)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'training_templates' and policyname = 'Authenticated can read templates'
  ) then
    create policy "Authenticated can read templates"
      on public.training_templates for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'template_sections' and policyname = 'Authenticated can read template sections'
  ) then
    create policy "Authenticated can read template sections"
      on public.template_sections for select
      using (auth.role() = 'authenticated');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'template_lines' and policyname = 'Authenticated can read template lines'
  ) then
    create policy "Authenticated can read template lines"
      on public.template_lines for select
      using (auth.role() = 'authenticated');
  end if;
end $$;

-- Upsert one active template
insert into public.training_templates (slug, title, version, target_audience, is_active)
values (
  'pharma-internship-speaking-advanced-6w',
  'Pharmaceutical Internship - English Speaking Training Template',
  'Advanced - 6 Weeks Program',
  'Vietnamese Instructor -> American Students',
  true
)
on conflict (slug) do update set
  title = excluded.title,
  version = excluded.version,
  target_audience = excluded.target_audience,
  is_active = excluded.is_active,
  updated_at = now();

with tpl as (
  select id from public.training_templates where slug = 'pharma-internship-speaking-advanced-6w'
), upsert_sections as (
  insert into public.template_sections (
    template_id, section_key, week_no, track_no, title, section_type, sort_order, notes, is_active
  )
  values
    ((select id from tpl), 'overview', null, null, 'Overview', 'overview', 10, null, true),
    ((select id from tpl), 'how_to_use', null, null, 'How To Use (For App Logic)', 'usage', 20, 'Each line can be played via speaker icon for pronunciation drills.', true),

    ((select id from tpl), 'w1_track1_greeting', 1, 1, 'Track 1 - Greeting', 'track', 101, 'Speak slowly, friendly tone, smile when speaking.', true),
    ((select id from tpl), 'w1_track2_program_intro', 1, 2, 'Track 2 - Program Introduction', 'track', 102, 'Stress phrase: real-world experience. Pause naturally after each line.', true),
    ((select id from tpl), 'w1_roleplay_ice_breaking', 1, null, 'Roleplay 1 - Ice Breaking', 'roleplay', 103, null, true),

    ((select id from tpl), 'w2_track3_qc_intro', 2, 3, 'Track 3 - Introduction QC', 'track', 201, 'Clear pronunciation, slightly slower pace.', true),
    ((select id from tpl), 'w2_track4_qc_instruction', 2, 4, 'Track 4 - Instruction', 'track', 202, 'Emphasize calibrate and record. Command tone but friendly.', true),
    ((select id from tpl), 'w2_roleplay_qc_question', 2, null, 'Roleplay 2 - QC Question', 'roleplay', 203, null, true),

    ((select id from tpl), 'w3_track5_rd_intro', 3, 5, 'Track 5 - Introduction R&D', 'track', 301, 'Natural tone, slight upward intonation.', true),
    ((select id from tpl), 'w3_roleplay_formulation', 3, null, 'Roleplay 3 - Formulation', 'roleplay', 302, null, true),

    ((select id from tpl), 'w4_track6_gmp_intro', 4, 6, 'Track 6 - GMP Introduction', 'track', 401, 'Serious tone, slightly slower speed.', true),
    ((select id from tpl), 'w4_roleplay_gmp', 4, null, 'Roleplay 4 - GMP', 'roleplay', 402, null, true),

    ((select id from tpl), 'w5_track7_warehouse_intro', 5, 7, 'Track 7 - Warehouse Introduction', 'track', 501, 'Clear and steady pacing.', true),
    ((select id from tpl), 'w5_roleplay_inventory', 5, null, 'Roleplay 5 - Inventory', 'roleplay', 502, null, true),

    ((select id from tpl), 'w6_track8_presentation_guide', 6, 8, 'Track 8 - Presentation Guide', 'track', 601, 'Coaching tone and encouraging attitude.', true),
    ((select id from tpl), 'w6_roleplay_feedback', 6, null, 'Roleplay 6 - Feedback', 'roleplay', 602, null, true),

    ((select id from tpl), 'master_phrases', null, null, 'Master Phrases', 'master_phrase', 700, null, true),
    ((select id from tpl), 'advanced_pattern', null, null, 'Advanced Thinking Pattern', 'practice', 710, 'Pattern: Explain -> Example -> Confirm', true),
    ((select id from tpl), 'daily_practice_loop', null, null, 'Daily Practice Mode Loop', 'practice', 720, null, true),
    ((select id from tpl), 'scenario_1_mistake', null, null, 'Scenario 1 - Mistake', 'scenario', 730, null, true),
    ((select id from tpl), 'scenario_2_challenging', null, null, 'Scenario 2 - Challenging Question', 'scenario', 740, null, true)
  on conflict (template_id, section_key)
  do update set
    week_no = excluded.week_no,
    track_no = excluded.track_no,
    title = excluded.title,
    section_type = excluded.section_type,
    sort_order = excluded.sort_order,
    notes = excluded.notes,
    is_active = excluded.is_active,
    updated_at = now()
  returning id, section_key
), section_map as (
  select id, section_key from upsert_sections
  union
  select s.id, s.section_key
  from public.template_sections s
  join tpl on tpl.id = s.template_id
)
insert into public.template_lines (
  section_id, line_no, role_label, line_kind, language_code, text_content, is_active
)
values
  -- Overview
  ((select id from section_map where section_key = 'overview'), 1, null, 'text', 'en', 'This training is designed to help instructors communicate effectively with American pharmacy students during a 6-week internship program.', true),
  ((select id from section_map where section_key = 'overview'), 2, null, 'bullet', 'en', 'Daily Communication', true),
  ((select id from section_map where section_key = 'overview'), 3, null, 'bullet', 'en', 'Lab (QC / R&D)', true),
  ((select id from section_map where section_key = 'overview'), 4, null, 'bullet', 'en', 'Production (GMP)', true),
  ((select id from section_map where section_key = 'overview'), 5, null, 'bullet', 'en', 'Warehouse', true),
  ((select id from section_map where section_key = 'overview'), 6, null, 'bullet', 'en', 'Presentation and Feedback', true),
  ((select id from section_map where section_key = 'overview'), 7, null, 'bullet', 'en', 'Roleplay and Real Scenarios', true),

  -- How to use
  ((select id from section_map where section_key = 'how_to_use'), 1, null, 'bullet', 'en', 'TEXT: for reading and TTS', true),
  ((select id from section_map where section_key = 'how_to_use'), 2, null, 'bullet', 'en', 'NOTE: speaking tips', true),
  ((select id from section_map where section_key = 'how_to_use'), 3, null, 'bullet', 'en', 'ROLEPLAY: interactive mode', true),
  ((select id from section_map where section_key = 'how_to_use'), 4, null, 'bullet', 'en', 'PRACTICE: repetition', true),
  ((select id from section_map where section_key = 'how_to_use'), 5, null, 'note', 'en', 'Recommended TTS speed: 0.85 to 0.95', true),

  -- Week 1 track 1
  ((select id from section_map where section_key = 'w1_track1_greeting'), 1, null, 'text', 'en', 'Good morning everyone.', true),
  ((select id from section_map where section_key = 'w1_track1_greeting'), 2, null, 'text', 'en', 'Welcome to our company.', true),
  ((select id from section_map where section_key = 'w1_track1_greeting'), 3, null, 'text', 'en', 'My name is [Your Name], and I will be guiding you throughout this internship.', true),
  ((select id from section_map where section_key = 'w1_track1_greeting'), 4, null, 'text', 'en', 'We are very happy to have you here.', true),

  -- Week 1 track 2
  ((select id from section_map where section_key = 'w1_track2_program_intro'), 1, null, 'text', 'en', 'Over the next six weeks, you will rotate through different departments including QC, R&D, production, and warehouse.', true),
  ((select id from section_map where section_key = 'w1_track2_program_intro'), 2, null, 'text', 'en', 'The goal is to give you real-world experience.', true),

  -- Week 1 roleplay
  ((select id from section_map where section_key = 'w1_roleplay_ice_breaking'), 1, 'Instructor', 'instructor', 'en', 'Could you briefly introduce yourself?', true),
  ((select id from section_map where section_key = 'w1_roleplay_ice_breaking'), 2, 'Student', 'student', 'en', 'I am majoring in pharmacy.', true),
  ((select id from section_map where section_key = 'w1_roleplay_ice_breaking'), 3, 'Instructor', 'instructor', 'en', 'That is great. What are you hoping to learn here?', true),

  -- Week 2 track 3
  ((select id from section_map where section_key = 'w2_track3_qc_intro'), 1, null, 'text', 'en', 'This is the Quality Control lab.', true),
  ((select id from section_map where section_key = 'w2_track3_qc_intro'), 2, null, 'text', 'en', 'Here, we test raw materials, in-process samples, and finished products.', true),
  ((select id from section_map where section_key = 'w2_track3_qc_intro'), 3, null, 'text', 'en', 'Accuracy is very important in this lab.', true),

  -- Week 2 track 4
  ((select id from section_map where section_key = 'w2_track4_qc_instruction'), 1, null, 'text', 'en', 'Let us walk through the process together.', true),
  ((select id from section_map where section_key = 'w2_track4_qc_instruction'), 2, null, 'text', 'en', 'First, calibrate the instrument.', true),
  ((select id from section_map where section_key = 'w2_track4_qc_instruction'), 3, null, 'text', 'en', 'Then measure the sample.', true),
  ((select id from section_map where section_key = 'w2_track4_qc_instruction'), 4, null, 'text', 'en', 'Record the results immediately.', true),

  -- Week 2 roleplay
  ((select id from section_map where section_key = 'w2_roleplay_qc_question'), 1, 'Student', 'student', 'en', 'Why do we need to calibrate every time?', true),
  ((select id from section_map where section_key = 'w2_roleplay_qc_question'), 2, 'Instructor', 'instructor', 'en', 'That is a great question. Calibration ensures accuracy. Even small deviations can affect the result.', true),

  -- Week 3 track 5
  ((select id from section_map where section_key = 'w3_track5_rd_intro'), 1, null, 'text', 'en', 'This is the R&D lab.', true),
  ((select id from section_map where section_key = 'w3_track5_rd_intro'), 2, null, 'text', 'en', 'We focus on developing new formulations, improving stability, and ensuring product effectiveness.', true),

  -- Week 3 roleplay
  ((select id from section_map where section_key = 'w3_roleplay_formulation'), 1, 'Student', 'student', 'en', 'How do you choose excipients?', true),
  ((select id from section_map where section_key = 'w3_roleplay_formulation'), 2, 'Instructor', 'instructor', 'en', 'It depends on the formulation goals, such as stability, solubility, and release profile.', true),

  -- Week 4 track 6
  ((select id from section_map where section_key = 'w4_track6_gmp_intro'), 1, null, 'text', 'en', 'This is the production area.', true),
  ((select id from section_map where section_key = 'w4_track6_gmp_intro'), 2, null, 'text', 'en', 'Everything here follows GMP regulations.', true),
  ((select id from section_map where section_key = 'w4_track6_gmp_intro'), 3, null, 'text', 'en', 'Please follow all SOPs carefully.', true),

  -- Week 4 roleplay
  ((select id from section_map where section_key = 'w4_roleplay_gmp'), 1, 'Student', 'student', 'en', 'Why is documentation so detailed?', true),
  ((select id from section_map where section_key = 'w4_roleplay_gmp'), 2, 'Instructor', 'instructor', 'en', 'Because traceability is critical. We need to track every step in case of issues.', true),

  -- Week 5 track 7
  ((select id from section_map where section_key = 'w5_track7_warehouse_intro'), 1, null, 'text', 'en', 'This is our warehouse.', true),
  ((select id from section_map where section_key = 'w5_track7_warehouse_intro'), 2, null, 'text', 'en', 'We store materials under controlled conditions.', true),
  ((select id from section_map where section_key = 'w5_track7_warehouse_intro'), 3, null, 'text', 'en', 'Temperature and humidity are monitored continuously.', true),

  -- Week 5 roleplay
  ((select id from section_map where section_key = 'w5_roleplay_inventory'), 1, 'Student', 'student', 'en', 'How do you manage inventory?', true),
  ((select id from section_map where section_key = 'w5_roleplay_inventory'), 2, 'Instructor', 'instructor', 'en', 'We use a digital system to track everything in real time.', true),

  -- Week 6 track 8
  ((select id from section_map where section_key = 'w6_track8_presentation_guide'), 1, null, 'text', 'en', 'You will present what you have learned.', true),
  ((select id from section_map where section_key = 'w6_track8_presentation_guide'), 2, null, 'text', 'en', 'Keep your presentation clear and structured: introduction, process, and conclusion.', true),

  -- Week 6 roleplay
  ((select id from section_map where section_key = 'w6_roleplay_feedback'), 1, 'Instructor', 'instructor', 'en', 'That was a solid presentation.', true),
  ((select id from section_map where section_key = 'w6_roleplay_feedback'), 2, 'Instructor', 'instructor', 'en', 'One thing you could improve is explaining this part more clearly.', true),
  ((select id from section_map where section_key = 'w6_roleplay_feedback'), 3, 'Instructor', 'instructor', 'en', 'But overall, great job.', true),

  -- Master phrases
  ((select id from section_map where section_key = 'master_phrases'), 1, null, 'bullet', 'en', 'Let us walk through this.', true),
  ((select id from section_map where section_key = 'master_phrases'), 2, null, 'bullet', 'en', 'Just make sure.', true),
  ((select id from section_map where section_key = 'master_phrases'), 3, null, 'bullet', 'en', 'Go ahead and try.', true),
  ((select id from section_map where section_key = 'master_phrases'), 4, null, 'bullet', 'en', 'Does that make sense?', true),
  ((select id from section_map where section_key = 'master_phrases'), 5, null, 'bullet', 'en', 'That is a great question.', true),
  ((select id from section_map where section_key = 'master_phrases'), 6, null, 'bullet', 'en', 'Keep going.', true),

  -- Advanced pattern
  ((select id from section_map where section_key = 'advanced_pattern'), 1, null, 'practice', 'en', 'Explain -> Example -> Confirm', true),
  ((select id from section_map where section_key = 'advanced_pattern'), 2, null, 'text', 'en', 'We test this parameter to ensure quality.', true),
  ((select id from section_map where section_key = 'advanced_pattern'), 3, null, 'text', 'en', 'For example, if the pH is too high, stability may be affected.', true),
  ((select id from section_map where section_key = 'advanced_pattern'), 4, null, 'text', 'en', 'Does that make sense?', true),

  -- Daily loop
  ((select id from section_map where section_key = 'daily_practice_loop'), 1, null, 'practice', 'en', 'Listen (TTS)', true),
  ((select id from section_map where section_key = 'daily_practice_loop'), 2, null, 'practice', 'en', 'Repeat', true),
  ((select id from section_map where section_key = 'daily_practice_loop'), 3, null, 'practice', 'en', 'Shadow', true),
  ((select id from section_map where section_key = 'daily_practice_loop'), 4, null, 'practice', 'en', 'Record voice', true),
  ((select id from section_map where section_key = 'daily_practice_loop'), 5, null, 'practice', 'en', 'Compare', true),

  -- Scenario 1
  ((select id from section_map where section_key = 'scenario_1_mistake'), 1, 'Instructor', 'instructor', 'en', 'I think you missed a step here.', true),
  ((select id from section_map where section_key = 'scenario_1_mistake'), 2, 'Student', 'student', 'en', 'Oh, I see.', true),
  ((select id from section_map where section_key = 'scenario_1_mistake'), 3, 'Instructor', 'instructor', 'en', 'No problem. Let us go through it again.', true),

  -- Scenario 2
  ((select id from section_map where section_key = 'scenario_2_challenging'), 1, 'Student', 'student', 'en', 'Why do we not automate this process?', true),
  ((select id from section_map where section_key = 'scenario_2_challenging'), 2, 'Instructor', 'instructor', 'en', 'That is a good point. In some cases we do, but manual control is still necessary.', true)
on conflict (section_id, line_no, language_code)
do update set
  role_label = excluded.role_label,
  line_kind = excluded.line_kind,
  language_code = excluded.language_code,
  text_content = excluded.text_content,
  is_active = excluded.is_active;

-- Vietnamese lines for each English line (same section_id + line_no => shown directly under EN)
insert into public.template_lines (
  section_id, line_no, role_label, line_kind, language_code, text_content, is_active
)
select
  tl.section_id,
  tl.line_no,
  tl.role_label,
  tl.line_kind,
  'vi' as language_code,
  case tl.text_content
    when 'This training is designed to help instructors communicate effectively with American pharmacy students during a 6-week internship program.' then 'Chương trình này được thiết kế để giúp giảng viên giao tiếp hiệu quả với sinh viên dược Mỹ trong chương trình thực tập 6 tuần.'
    when 'Daily Communication' then 'Giao tiếp hằng ngày'
    when 'Lab (QC / R&D)' then 'Phòng thí nghiệm (QC / R&D)'
    when 'Production (GMP)' then 'Sản xuất (GMP)'
    when 'Warehouse' then 'Kho'
    when 'Presentation and Feedback' then 'Thuyết trình và phản hồi'
    when 'Roleplay and Real Scenarios' then 'Đóng vai và tình huống thực tế'
    when 'TEXT: for reading and TTS' then 'TEXT: dùng để đọc và TTS'
    when 'NOTE: speaking tips' then 'NOTE: mẹo nói'
    when 'ROLEPLAY: interactive mode' then 'ROLEPLAY: chế độ tương tác'
    when 'PRACTICE: repetition' then 'PRACTICE: luyện lặp lại'
    when 'Recommended TTS speed: 0.85 to 0.95' then 'Tốc độ TTS khuyến nghị: 0.85 đến 0.95'
    when 'Good morning everyone.' then 'Chào buổi sáng mọi người.'
    when 'Welcome to our company.' then 'Chào mừng đến với công ty chúng tôi.'
    when 'My name is [Your Name], and I will be guiding you throughout this internship.' then 'Tên tôi là [Tên của bạn], và tôi sẽ hướng dẫn các bạn trong suốt kỳ thực tập này.'
    when 'We are very happy to have you here.' then 'Chúng tôi rất vui khi có các bạn ở đây.'
    when 'Over the next six weeks, you will rotate through different departments including QC, R&D, production, and warehouse.' then 'Trong sáu tuần tới, các bạn sẽ luân phiên qua các bộ phận khác nhau gồm QC, R&D, sản xuất và kho.'
    when 'The goal is to give you real-world experience.' then 'Mục tiêu là mang đến cho các bạn kinh nghiệm thực tế.'
    when 'Could you briefly introduce yourself?' then 'Bạn có thể giới thiệu ngắn gọn về bản thân không?'
    when 'I am majoring in pharmacy.' then 'Em học chuyên ngành dược.'
    when 'That is great. What are you hoping to learn here?' then 'Tuyệt lắm. Bạn hy vọng học được điều gì ở đây?'
    when 'This is the Quality Control lab.' then 'Đây là phòng thí nghiệm Kiểm soát Chất lượng (QC).'
    when 'Here, we test raw materials, in-process samples, and finished products.' then 'Tại đây, chúng ta kiểm tra nguyên liệu đầu vào, mẫu trong quá trình và thành phẩm.'
    when 'Accuracy is very important in this lab.' then 'Độ chính xác rất quan trọng trong phòng lab này.'
    when 'Let us walk through the process together.' then 'Chúng ta cùng đi qua quy trình nhé.'
    when 'First, calibrate the instrument.' then 'Trước tiên, hãy hiệu chuẩn thiết bị.'
    when 'Then measure the sample.' then 'Sau đó đo mẫu.'
    when 'Record the results immediately.' then 'Ghi lại kết quả ngay lập tức.'
    when 'Why do we need to calibrate every time?' then 'Vì sao chúng ta cần hiệu chuẩn mỗi lần vậy ạ?'
    when 'That is a great question. Calibration ensures accuracy. Even small deviations can affect the result.' then 'Đó là câu hỏi rất hay. Hiệu chuẩn giúp đảm bảo độ chính xác. Ngay cả sai lệch nhỏ cũng có thể ảnh hưởng kết quả.'
    when 'This is the R&D lab.' then 'Đây là phòng thí nghiệm R&D.'
    when 'We focus on developing new formulations, improving stability, and ensuring product effectiveness.' then 'Chúng tôi tập trung phát triển công thức mới, cải thiện độ ổn định và bảo đảm hiệu quả sản phẩm.'
    when 'How do you choose excipients?' then 'Mình chọn tá dược như thế nào ạ?'
    when 'It depends on the formulation goals, such as stability, solubility, and release profile.' then 'Điều đó phụ thuộc vào mục tiêu bào chế, như độ ổn định, độ tan và hồ sơ giải phóng.'
    when 'This is the production area.' then 'Đây là khu vực sản xuất.'
    when 'Everything here follows GMP regulations.' then 'Mọi thứ ở đây đều tuân thủ quy định GMP.'
    when 'Please follow all SOPs carefully.' then 'Vui lòng tuân thủ cẩn thận tất cả SOP.'
    when 'Why is documentation so detailed?' then 'Vì sao tài liệu phải chi tiết đến vậy?'
    when 'Because traceability is critical. We need to track every step in case of issues.' then 'Vì khả năng truy xuất rất quan trọng. Chúng ta cần theo dõi từng bước trong trường hợp có sự cố.'
    when 'This is our warehouse.' then 'Đây là kho của chúng tôi.'
    when 'We store materials under controlled conditions.' then 'Chúng tôi lưu trữ vật tư trong điều kiện được kiểm soát.'
    when 'Temperature and humidity are monitored continuously.' then 'Nhiệt độ và độ ẩm được theo dõi liên tục.'
    when 'How do you manage inventory?' then 'Mình quản lý tồn kho như thế nào ạ?'
    when 'We use a digital system to track everything in real time.' then 'Chúng tôi dùng hệ thống số để theo dõi mọi thứ theo thời gian thực.'
    when 'You will present what you have learned.' then 'Bạn sẽ trình bày những gì mình đã học được.'
    when 'Keep your presentation clear and structured: introduction, process, and conclusion.' then 'Hãy giữ bài trình bày rõ ràng và có cấu trúc: mở đầu, quy trình và kết luận.'
    when 'That was a solid presentation.' then 'Đó là một bài trình bày tốt.'
    when 'One thing you could improve is explaining this part more clearly.' then 'Một điểm bạn có thể cải thiện là giải thích phần này rõ hơn.'
    when 'But overall, great job.' then 'Nhìn chung, bạn làm rất tốt.'
    when 'Let us walk through this.' then 'Hãy cùng đi qua phần này.'
    when 'Just make sure.' then 'Chỉ cần đảm bảo rằng.'
    when 'Go ahead and try.' then 'Bạn cứ thử đi.'
    when 'Does that make sense?' then 'Bạn thấy có hợp lý không?'
    when 'That is a great question.' then 'Đó là một câu hỏi rất hay.'
    when 'Keep going.' then 'Tiếp tục nhé.'
    when 'Explain -> Example -> Confirm' then 'Giải thích -> Ví dụ -> Xác nhận'
    when 'We test this parameter to ensure quality.' then 'Chúng tôi kiểm tra thông số này để bảo đảm chất lượng.'
    when 'For example, if the pH is too high, stability may be affected.' then 'Ví dụ, nếu pH quá cao thì độ ổn định có thể bị ảnh hưởng.'
    when 'Listen (TTS)' then 'Nghe (TTS)'
    when 'Repeat' then 'Lặp lại'
    when 'Shadow' then 'Nói nhại theo'
    when 'Record voice' then 'Ghi âm giọng nói'
    when 'Compare' then 'So sánh'
    when 'I think you missed a step here.' then 'Tôi nghĩ bạn đã bỏ sót một bước ở đây.'
    when 'Oh, I see.' then 'Ồ, em hiểu rồi.'
    when 'No problem. Let us go through it again.' then 'Không sao. Chúng ta cùng làm lại nhé.'
    when 'Why do we not automate this process?' then 'Tại sao chúng ta không tự động hóa quy trình này?'
    when 'That is a good point. In some cases we do, but manual control is still necessary.' then 'Đó là một ý hay. Trong một số trường hợp thì có, nhưng kiểm soát thủ công vẫn cần thiết.'
    else tl.text_content
  end as text_content,
  true
from public.template_lines tl
where tl.language_code = 'en'
on conflict (section_id, line_no, language_code)
do update set
  role_label = excluded.role_label,
  line_kind = excluded.line_kind,
  text_content = excluded.text_content,
  is_active = excluded.is_active;
