/**
 * @file src/data/botProfiles.js
 * @description 70 bot accounts with realistic names and distinct Dicebear avatars.
 * ELOs span all rank tiers. ~Half have isDiamondPro = true.
 * Each bot has a _baseName for name rotation and nameVariants for periodic swaps.
 */

'use strict';

// Dicebear avataaars-neutral PNG — each seed produces a unique face with clothing/hair
function avatar(seed) {
    return `https://api.dicebear.com/7.x/avataaars-neutral/png?seed=${seed}&size=128&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf,e0f2f1`;
}

const BOT_PROFILES = [
    // ── Bronze (ELO 400–950) — 20 bots, 5 diamond ──────────────────────────
    { username: 'james_k',   nameVariants: ['jamesk',   'james_k',   'james99'],  elo: 435,  isDiamondPro: false, seed: 'jamesk01'   },
    { username: 'emmarose',  nameVariants: ['emmarose', 'emma_r',    'emma22'],   elo: 478,  isDiamondPro: false, seed: 'emmarose02' },
    { username: 'oliver_t',  nameVariants: ['olivert',  'oliver_t',  'ollie7'],   elo: 512,  isDiamondPro: false, seed: 'olivert03'  },
    { username: 'sophiamv',  nameVariants: ['sophiamv', 'sophia_m',  'sophiem'],  elo: 548,  isDiamondPro: true,  seed: 'sophiam04'  },
    { username: 'liam_b',    nameVariants: ['liamb',    'liam_b',    'liam77'],   elo: 583,  isDiamondPro: false, seed: 'liamb05'   },
    { username: 'mia_chen',  nameVariants: ['miachen',  'mia_c',     'miac99'],   elo: 614,  isDiamondPro: false, seed: 'miachen06' },
    { username: 'noah_w',    nameVariants: ['noahw',    'noah_w',    'noah42'],   elo: 651,  isDiamondPro: false, seed: 'noahw07'   },
    { username: 'avagrace',  nameVariants: ['avagrace', 'ava_g',     'avag88'],   elo: 679,  isDiamondPro: false, seed: 'avag08'    },
    { username: 'ethan_r',   nameVariants: ['ethanr',   'ethan_r',   'ethan5'],   elo: 713,  isDiamondPro: true,  seed: 'ethanr09'  },
    { username: 'lucyfox',   nameVariants: ['lucyfox',  'lucy_fox',  'lucyf3'],   elo: 742,  isDiamondPro: false, seed: 'lucyfox10' },
    { username: 'giorgi_a',  nameVariants: ['giorgia',  'giorgi_a',  'giorg9'],   elo: 762,  isDiamondPro: false, seed: 'giorgia11' },
    { username: 'nino_m',    nameVariants: ['ninom',    'nino_m',    'ninoM'],    elo: 791,  isDiamondPro: true,  seed: 'ninom12'   },
    { username: 'marco_v',   nameVariants: ['marcov',   'marco_v',   'marcVi'],   elo: 823,  isDiamondPro: false, seed: 'marcov13'  },
    { username: 'anna_p',    nameVariants: ['annap',    'anna_p',    'annaPv'],   elo: 843,  isDiamondPro: false, seed: 'annap14'   },
    { username: 'felix_w',   nameVariants: ['felixw',   'felix_w',   'feliW'],    elo: 862,  isDiamondPro: true,  seed: 'felixw15'  },
    { username: 'sara_ng',   nameVariants: ['sarang',   'sara_ng',   'saraN'],    elo: 881,  isDiamondPro: false, seed: 'sarang16'  },
    { username: 'daniel_b',  nameVariants: ['danielb',  'daniel_b',  'danB7'],    elo: 901,  isDiamondPro: false, seed: 'danielb17' },
    { username: 'priya_s',   nameVariants: ['priyas',   'priya_s',   'priyaS'],   elo: 921,  isDiamondPro: true,  seed: 'priyas18'  },
    { username: 'tomasz_k',  nameVariants: ['tomaszk',  'tomasz_k',  'tomK'],     elo: 936,  isDiamondPro: false, seed: 'tomaszk19' },
    { username: 'elena_v',   nameVariants: ['elenav',   'elena_v',   'elenaV'],   elo: 951,  isDiamondPro: false, seed: 'elenav20'  },

    // ── Silver (ELO 1002–1190) — 15 bots, 7 diamond ────────────────────────
    { username: 'luka_g',    nameVariants: ['lukag',    'luka_g',    'lukaG'],    elo: 1008, isDiamondPro: false, seed: 'lukag21'   },
    { username: 'mia_chang', nameVariants: ['miachang', 'mia_chang', 'miaCh'],   elo: 1024, isDiamondPro: true,  seed: 'miachang22'},
    { username: 'mariam_t',  nameVariants: ['mariamt',  'mariam_t',  'mariamT'],  elo: 1041, isDiamondPro: false, seed: 'mariamt23' },
    { username: 'alex_rk',   nameVariants: ['alexrk',   'alex_rk',   'alexR'],    elo: 1056, isDiamondPro: true,  seed: 'alexrk24'  },
    { username: 'sophie_d',  nameVariants: ['sophied',  'sophie_d',  'soph_d'],   elo: 1071, isDiamondPro: false, seed: 'sophied25' },
    { username: 'niko_b',    nameVariants: ['nikob',    'niko_b',    'nikoB'],    elo: 1086, isDiamondPro: true,  seed: 'nikob26'   },
    { username: 'yuki_m',    nameVariants: ['yukim',    'yuki_m',    'yukiM'],    elo: 1102, isDiamondPro: false, seed: 'yukim27'   },
    { username: 'ibrahim_o', nameVariants: ['ibrahimo', 'ibrahim_o', 'ibraO'],   elo: 1113, isDiamondPro: true,  seed: 'ibrahimo28'},
    { username: 'clara_h',   nameVariants: ['clarah',   'clara_h',   'claraH'],   elo: 1126, isDiamondPro: false, seed: 'clarah29'  },
    { username: 'ryan_t',    nameVariants: ['ryant',    'ryan_t',    'ryanT'],    elo: 1141, isDiamondPro: true,  seed: 'ryant30'   },
    { username: 'zara_m',    nameVariants: ['zaram',    'zara_m',    'zaraM'],    elo: 1152, isDiamondPro: false, seed: 'zaram31'   },
    { username: 'ben_fox',   nameVariants: ['benfox',   'ben_fox',   'benFx'],    elo: 1161, isDiamondPro: true,  seed: 'benfox32'  },
    { username: 'leila_k',   nameVariants: ['leilak',   'leila_k',   'leilaK'],   elo: 1172, isDiamondPro: false, seed: 'leilak33'  },
    { username: 'hugo_l',    nameVariants: ['hugol',    'hugo_l',    'hugoL'],    elo: 1178, isDiamondPro: true,  seed: 'hugol34'   },
    { username: 'nina_b',    nameVariants: ['ninab',    'nina_b',    'ninaB'],    elo: 1190, isDiamondPro: false, seed: 'ninab35'   },

    // ── Gold (ELO 1204–1388) — 15 bots, 8 diamond ──────────────────────────
    { username: 'chen_wei',  nameVariants: ['chenwei',  'chen_wei',  'chenW'],    elo: 1204, isDiamondPro: false, seed: 'chenwei36' },
    { username: 'oksana_h',  nameVariants: ['oksanah',  'oksana_h',  'oksH'],     elo: 1221, isDiamondPro: true,  seed: 'oksanah37' },
    { username: 'max_schr',  nameVariants: ['maxschr',  'max_sch',   'maxSch'],   elo: 1243, isDiamondPro: true,  seed: 'maxschr38' },
    { username: 'aisha_d',   nameVariants: ['aishad',   'aisha_d',   'aishaD'],   elo: 1257, isDiamondPro: false, seed: 'aishad39'  },
    { username: 'patrick_n', nameVariants: ['patrickn', 'patrick_n', 'patN'],    elo: 1272, isDiamondPro: true,  seed: 'patrickn40'},
    { username: 'fatima_r',  nameVariants: ['fatimar',  'fatima_r',  'fatiR'],    elo: 1286, isDiamondPro: false, seed: 'fatimar41' },
    { username: 'soren_l',   nameVariants: ['sorenl',   'soren_l',   'sorenL'],   elo: 1301, isDiamondPro: true,  seed: 'sorenl42'  },
    { username: 'mei_yang',  nameVariants: ['meiyang',  'mei_yang',  'meiY'],     elo: 1317, isDiamondPro: false, seed: 'meiyang43' },
    { username: 'jake_w',    nameVariants: ['jakew',    'jake_w',    'jakeW'],    elo: 1326, isDiamondPro: true,  seed: 'jakew44'   },
    { username: 'freya_h',   nameVariants: ['freyah',   'freya_h',   'freyaH'],   elo: 1341, isDiamondPro: false, seed: 'freyah45'  },
    { username: 'arjun_m',   nameVariants: ['arjunm',   'arjun_m',   'arjunM'],   elo: 1352, isDiamondPro: true,  seed: 'arjunm46'  },
    { username: 'chloe_b',   nameVariants: ['chloeb',   'chloe_b',   'chloeB'],   elo: 1361, isDiamondPro: false, seed: 'chloeb47'  },
    { username: 'oscar_k',   nameVariants: ['oscark',   'oscar_k',   'oscarK'],   elo: 1367, isDiamondPro: true,  seed: 'oscark48'  },
    { username: 'ingrid_s',  nameVariants: ['ingrids',  'ingrid_s',  'ingS'],     elo: 1374, isDiamondPro: false, seed: 'ingrids49' },
    { username: 'tom_chen',  nameVariants: ['tomchen',  'tom_chen',  'tomCh'],    elo: 1388, isDiamondPro: true,  seed: 'tomchen50' },

    // ── Platinum (ELO 1412–1582) — 10 bots, 7 diamond ──────────────────────
    { username: 'victor_h',  nameVariants: ['victorh',  'victor_h',  'vicH'],     elo: 1412, isDiamondPro: true,  seed: 'victorh51' },
    { username: 'layla_a',   nameVariants: ['laylaa',   'layla_a',   'laylaA'],   elo: 1431, isDiamondPro: false, seed: 'laylaa52'  },
    { username: 'dmitri_v',  nameVariants: ['dmitriv',  'dmitri_v',  'dmitV'],    elo: 1452, isDiamondPro: true,  seed: 'dmitriv53' },
    { username: 'grace_w',   nameVariants: ['gracew',   'grace_w',   'graceW'],   elo: 1471, isDiamondPro: true,  seed: 'gracew54'  },
    { username: 'reza_m',    nameVariants: ['rezam',    'reza_m',    'rezaM'],    elo: 1491, isDiamondPro: false, seed: 'rezam55'   },
    { username: 'astrid_b',  nameVariants: ['astridb',  'astrid_b',  'astB'],     elo: 1513, isDiamondPro: true,  seed: 'astridb56' },
    { username: 'kwame_a',   nameVariants: ['kwamea',   'kwame_a',   'kwameA'],   elo: 1532, isDiamondPro: true,  seed: 'kwamea57'  },
    { username: 'diana_c',   nameVariants: ['dianac',   'diana_c',   'dianaC'],   elo: 1551, isDiamondPro: false, seed: 'dianac58'  },
    { username: 'stefan_m',  nameVariants: ['stefanm',  'stefan_m',  'stefM'],    elo: 1566, isDiamondPro: true,  seed: 'stefanm59' },
    { username: 'yuna_k',    nameVariants: ['yunak',    'yuna_k',    'yunaK'],    elo: 1582, isDiamondPro: true,  seed: 'yunak60'   },

    // ── Diamond (ELO 1618–1751) — 5 bots, all diamond ───────────────────────
    { username: 'rafael_s',  nameVariants: ['rafaels',  'rafael_s',  'rafS'],     elo: 1618, isDiamondPro: true,  seed: 'rafaels61' },
    { username: 'hana_w',    nameVariants: ['hanaw',    'hana_w',    'hanaW'],    elo: 1651, isDiamondPro: true,  seed: 'hanaw62'   },
    { username: 'andrei_p',  nameVariants: ['andreip',  'andrei_p',  'andP'],     elo: 1692, isDiamondPro: true,  seed: 'andreip63' },
    { username: 'zoe_stark', nameVariants: ['zoestark', 'zoe_stark', 'zoeS'],    elo: 1723, isDiamondPro: true,  seed: 'zoestark64'},
    { username: 'kai_mori',  nameVariants: ['kaimori',  'kai_mori',  'kaiM'],     elo: 1751, isDiamondPro: true,  seed: 'kaimori65' },

    // ── Master (ELO 1822–1951) — 3 bots, all diamond ────────────────────────
    { username: 'nikolai_g', nameVariants: ['nikolaig', 'nikolai_g', 'nikolG'],  elo: 1822, isDiamondPro: true,  seed: 'nikolaig66'},
    { username: 'amara_d',   nameVariants: ['amarad',   'amara_d',   'amaraD'],   elo: 1881, isDiamondPro: true,  seed: 'amarad67'  },
    { username: 'leo_storm', nameVariants: ['leostorm', 'leo_storm', 'leoSt'],   elo: 1951, isDiamondPro: true,  seed: 'leostorm68'},

    // ── Grandmaster (ELO 2055+) — 2 bots, all diamond ───────────────────────
    { username: 'vega_x',    nameVariants: ['vegax',    'vega_x',    'vegaX'],    elo: 2055, isDiamondPro: true,  seed: 'vegax69'   },
    { username: 'axiom_r',   nameVariants: ['axiomr',   'axiom_r',   'axiomR'],   elo: 2153, isDiamondPro: true,  seed: 'axiomr70'  },
];

// Attach computed photoURL and isBot flag
module.exports = BOT_PROFILES.map(b => ({
    ...b,
    photoURL: avatar(b.seed),
    isBot: true,
    _baseName: b.username,
}));
