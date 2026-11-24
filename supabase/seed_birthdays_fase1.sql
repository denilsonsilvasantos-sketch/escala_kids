-- Popula as datas de aniversário (dia e mês) somente nos voluntários JÁ cadastrados
-- cujo aniversário ainda esteja vazio (NULL). Não cria nenhum voluntário novo.
-- Requer que supabase/migration_fase1.sql já tenha sido executado.

UPDATE public.escala_contacts AS c
SET
  birth_day = v.birth_day,
  birth_month = v.birth_month,
  updated_at = timezone('utc', now())
FROM (
  VALUES
    -- Janeiro
    ('francine almeida', 2, 1),
    ('tina fadanelli', 14, 1),
    ('imer', 16, 1),
    ('laysa freire', 21, 1),
    ('raniele silva', 23, 1),
    ('yasmin carvalho', 24, 1),
    ('beatriz cassol', 25, 1),
    ('fabi da silveira', 27, 1),

    -- Fevereiro
    ('gabriella alves', 2, 2),
    ('priscila oliveira', 2, 2),
    ('jonathan pereira', 4, 2),
    ('bruna delfino', 14, 2),
    ('denilson santos', 21, 2),
    ('itamar flores', 26, 2),

    -- Março
    ('maria do amparo', 12, 3),
    ('janaina campos', 17, 3),
    ('rafa da rosa', 22, 3),
    ('manu cryslaine', 30, 3),

    -- Abril
    ('felipe freire', 11, 4),
    ('isabel lodi', 15, 4),
    ('sara kauer', 15, 4),
    ('eduardo ramos', 19, 4),
    ('leticia abreu', 24, 4),
    ('rehuan ribeiro', 26, 4),

    -- Maio
    ('danielle souza', 3, 5),
    ('robertha maia', 15, 5),
    ('zora almeida', 16, 5),
    ('laura lapa', 18, 5),
    ('lucilene farias', 19, 5),
    ('kassia vieira', 22, 5),

    -- Junho
    ('anna beatriz nunes', 2, 6),
    ('anthony carvalho', 6, 6),
    ('pra. elenice souza', 8, 6),
    ('doris pereira', 15, 6),

    -- Julho
    ('terezinha rescarolli', 1, 7),
    ('rubia freire', 4, 7),
    ('daniely cardoso', 11, 7),
    ('sabrina ramos', 12, 7),
    ('rafael oliveira', 13, 7),
    ('victoria jarra', 15, 7),
    ('samuel reboucas', 15, 7),
    ('wanessa barra', 15, 7),
    ('jonathan anacleto', 18, 7),
    ('clara marca', 22, 7),
    ('eksele ribeiro', 22, 7),
    ('jefferson goncalves', 22, 7),
    ('ana paula martins', 29, 7),
    ('victor matos', 29, 7),
    ('lais marca', 29, 7),
    ('heloisy duarte', 30, 7),

    -- Agosto
    ('fernando reis', 2, 8),
    ('joyce fonseca', 12, 8),
    ('ana jylia henrique', 14, 8),
    ('veronica ventorini', 19, 8),
    ('fabricio marca', 29, 8),
    ('paulo kauer', 30, 8),
    ('eliane goncalves', 30, 8),

    -- Setembro
    ('ana clara dantas', 4, 9),
    ('ana carolina', 9, 9),
    ('sonia luciele', 10, 9),

    -- Outubro
    ('sandro ribeiro', 4, 10),
    ('sandro martins', 9, 10),
    ('amanda saragoca', 11, 10),
    ('julia kopacek', 14, 10),
    ('maite barreto', 18, 10),
    ('soraida dias', 20, 10),
    ('rafael silva', 23, 10),
    ('pra. liara meurer (casais)', 23, 10),
    ('pollyannna francolin', 24, 10),
    ('vitoria brazil', 31, 10),

    -- Novembro
    ('bruna matos', 9, 11),
    ('heloise souza', 10, 11),
    ('bruna medeiros', 14, 11),
    ('marili delfino', 15, 11),
    ('milklane oliveira', 15, 11),
    ('helen guse', 15, 11),
    ('nicolas fonseca', 18, 11),
    ('pr. willian meurer (casais)', 18, 11),
    ('pr. mailon almozara', 19, 11),
    ('daniel ramos', 26, 11),
    ('sarah raquel', 27, 11),
    ('eliezer vieira', 27, 11),
    ('carleane de jesus', 27, 11),

    -- Dezembro
    ('layla lima', 1, 12),
    ('lisiane fonseca', 1, 12),
    ('cristina reboucas', 4, 12),
    ('cristiano duarte', 4, 12),
    ('pra. sheyla ana almozara', 7, 12),
    ('dani flores', 16, 12),
    ('gabriela rodrigues', 17, 12),
    ('julia santana', 18, 12),
    ('alejandra matheus', 19, 12),
    ('kauane domingues', 22, 12),
    ('pr. odivaldo souza', 26, 12)
) AS v(name_key, birth_day, birth_month)
WHERE c.name_key = v.name_key
  AND (c.birth_day IS NULL OR c.birth_month IS NULL);
