export interface OfficialBirthdayRecord {
  birthDay: number;
  birthMonth: number;
}

export const OFFICIAL_BIRTHDAYS_SEED_VERSION = "2026-11-24-birthdays-v1";

/**
 * Birthdays matched strictly against existing volunteers in OFFICIAL_VOLUNTEERS.
 * Never used to create new volunteers.
 */
export const OFFICIAL_VOLUNTEER_BIRTHDAYS: Record<
  string,
  OfficialBirthdayRecord
> = {
  // Janeiro
  "francine almeida": { birthDay: 2, birthMonth: 1 },
  "tina fadanelli": { birthDay: 14, birthMonth: 1 },
  imer: { birthDay: 16, birthMonth: 1 },
  "laysa freire": { birthDay: 21, birthMonth: 1 },
  "raniele silva": { birthDay: 23, birthMonth: 1 },
  "yasmin carvalho": { birthDay: 24, birthMonth: 1 },
  "beatriz cassol": { birthDay: 25, birthMonth: 1 },
  "fabi da silveira": { birthDay: 27, birthMonth: 1 },

  // Fevereiro
  "gabriella alves": { birthDay: 2, birthMonth: 2 },
  "priscila oliveira": { birthDay: 2, birthMonth: 2 },
  "jonathan pereira": { birthDay: 4, birthMonth: 2 },
  "bruna delfino": { birthDay: 14, birthMonth: 2 },
  "denilson santos": { birthDay: 21, birthMonth: 2 },
  "itamar flores": { birthDay: 26, birthMonth: 2 },

  // Março
  "maria do amparo": { birthDay: 12, birthMonth: 3 },
  "janaina campos": { birthDay: 17, birthMonth: 3 },
  "rafa da rosa": { birthDay: 22, birthMonth: 3 },
  "manu cryslaine": { birthDay: 30, birthMonth: 3 },

  // Abril
  "felipe freire": { birthDay: 11, birthMonth: 4 },
  "isabel lodi": { birthDay: 15, birthMonth: 4 },
  "sara kauer": { birthDay: 15, birthMonth: 4 },
  "eduardo ramos": { birthDay: 19, birthMonth: 4 },
  "leticia abreu": { birthDay: 24, birthMonth: 4 },
  "rehuan ribeiro": { birthDay: 26, birthMonth: 4 },

  // Maio
  "danielle souza": { birthDay: 3, birthMonth: 5 },
  "robertha maia": { birthDay: 15, birthMonth: 5 },
  "zora almeida": { birthDay: 16, birthMonth: 5 },
  "laura lapa": { birthDay: 18, birthMonth: 5 },
  "lucilene farias": { birthDay: 19, birthMonth: 5 },
  "kassia vieira": { birthDay: 22, birthMonth: 5 },

  // Junho
  "anna beatriz nunes": { birthDay: 2, birthMonth: 6 },
  "anthony carvalho": { birthDay: 6, birthMonth: 6 },
  "pra. elenice souza": { birthDay: 8, birthMonth: 6 },
  "doris pereira": { birthDay: 15, birthMonth: 6 },

  // Julho
  "terezinha rescarolli": { birthDay: 1, birthMonth: 7 },
  "rubia freire": { birthDay: 4, birthMonth: 7 },
  "daniely cardoso": { birthDay: 11, birthMonth: 7 },
  "sabrina ramos": { birthDay: 12, birthMonth: 7 },
  "rafael oliveira": { birthDay: 13, birthMonth: 7 },
  "victoria jarra": { birthDay: 15, birthMonth: 7 },
  "samuel reboucas": { birthDay: 15, birthMonth: 7 },
  "wanessa barra": { birthDay: 15, birthMonth: 7 },
  "jonathan anacleto": { birthDay: 18, birthMonth: 7 },
  "clara marca": { birthDay: 22, birthMonth: 7 },
  "eksele ribeiro": { birthDay: 22, birthMonth: 7 },
  "jefferson goncalves": { birthDay: 22, birthMonth: 7 },
  "ana paula martins": { birthDay: 29, birthMonth: 7 },
  "victor matos": { birthDay: 29, birthMonth: 7 },
  "lais marca": { birthDay: 29, birthMonth: 7 },
  "heloisy duarte": { birthDay: 30, birthMonth: 7 },

  // Agosto
  "fernando reis": { birthDay: 2, birthMonth: 8 },
  "joyce fonseca": { birthDay: 12, birthMonth: 8 },
  "ana jylia henrique": { birthDay: 14, birthMonth: 8 },
  "veronica ventorini": { birthDay: 19, birthMonth: 8 },
  "fabricio marca": { birthDay: 29, birthMonth: 8 },
  "paulo kauer": { birthDay: 30, birthMonth: 8 },
  "eliane goncalves": { birthDay: 30, birthMonth: 8 },

  // Setembro
  "ana clara dantas": { birthDay: 4, birthMonth: 9 },
  "ana carolina": { birthDay: 9, birthMonth: 9 },
  "sonia luciele": { birthDay: 10, birthMonth: 9 },

  // Outubro
  "sandro ribeiro": { birthDay: 4, birthMonth: 10 },
  "sandro martins": { birthDay: 9, birthMonth: 10 },
  "amanda saragoca": { birthDay: 11, birthMonth: 10 },
  "julia kopacek": { birthDay: 14, birthMonth: 10 },
  "maite barreto": { birthDay: 18, birthMonth: 10 },
  "soraida dias": { birthDay: 20, birthMonth: 10 },
  "rafael silva": { birthDay: 23, birthMonth: 10 },
  "pra. liara meurer (casais)": { birthDay: 23, birthMonth: 10 },
  "pollyannna francolin": { birthDay: 24, birthMonth: 10 },
  "vitoria brazil": { birthDay: 31, birthMonth: 10 },

  // Novembro
  "bruna matos": { birthDay: 9, birthMonth: 11 },
  "heloise souza": { birthDay: 10, birthMonth: 11 },
  "bruna medeiros": { birthDay: 14, birthMonth: 11 },
  "marili delfino": { birthDay: 15, birthMonth: 11 },
  "milklane oliveira": { birthDay: 15, birthMonth: 11 },
  "helen guse": { birthDay: 15, birthMonth: 11 },
  "nicolas fonseca": { birthDay: 18, birthMonth: 11 },
  "pr. willian meurer (casais)": { birthDay: 18, birthMonth: 11 },
  "pr. mailon almozara": { birthDay: 19, birthMonth: 11 },
  "daniel ramos": { birthDay: 26, birthMonth: 11 },
  "sarah raquel": { birthDay: 27, birthMonth: 11 },
  "eliezer vieira": { birthDay: 27, birthMonth: 11 },
  "carleane de jesus": { birthDay: 27, birthMonth: 11 },

  // Dezembro
  "layla lima": { birthDay: 1, birthMonth: 12 },
  "lisiane fonseca": { birthDay: 1, birthMonth: 12 },
  "cristina reboucas": { birthDay: 4, birthMonth: 12 },
  "cristiano duarte": { birthDay: 4, birthMonth: 12 },
  "pra. sheyla ana almozara": { birthDay: 7, birthMonth: 12 },
  "dani flores": { birthDay: 16, birthMonth: 12 },
  "gabriela rodrigues": { birthDay: 17, birthMonth: 12 },
  "julia santana": { birthDay: 18, birthMonth: 12 },
  "alejandra matheus": { birthDay: 19, birthMonth: 12 },
  "kauane domingues": { birthDay: 22, birthMonth: 12 },
  "pr. odivaldo souza": { birthDay: 26, birthMonth: 12 },
};
