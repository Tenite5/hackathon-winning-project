/**
 * @file src/data/botProfiles.js
 * @description 70 bot accounts with real internet-style usernames and
 * actual profile pictures — memes, movie/TV, sports, game logos, anime, Pokemon.
 * ELOs span all rank tiers. ~Half have isDiamondPro.
 */

'use strict';

// ── Image sources ───────────────────────────────────────────────────────────
// KYM CDN (memes, movie/TV, sports, games, anime)
const IMG = {
    // Memes
    doge:             'https://i.kym-cdn.com/photos/images/original/000/581/296/c09.jpg',
    wojak:            'https://i.kym-cdn.com/entries/icons/original/000/018/433/wojak.jpg',
    nyanCat:          'https://i.kym-cdn.com/entries/icons/original/000/005/608/nyan-cat-01-625x450.jpg',
    pepe:             'https://i.kym-cdn.com/entries/icons/original/000/017/618/pepefroggie.jpg',
    trollface:        'https://i.kym-cdn.com/entries/icons/original/000/000/091/TrollFace.jpg',
    thisIsFine:       'https://i.kym-cdn.com/entries/icons/original/000/018/012/this_is_fine.jpeg',
    gigachad:         'https://i.kym-cdn.com/entries/icons/original/000/026/152/gigachadd.jpg',
    galaxyBrain:      'https://i.kym-cdn.com/entries/icons/original/000/022/266/brain.png',
    stonks:           'https://i.kym-cdn.com/entries/icons/original/000/029/959/Screen_Shot_2019-06-05_at_1.26.32_PM.jpg',
    grumpyCat:        'https://i.kym-cdn.com/entries/icons/original/000/011/365/GRUMPYCAT.jpg',
    rickroll:         'https://i.kym-cdn.com/entries/icons/original/000/000/007/bd6.jpg',

    // Movie / TV
    shrek:            'https://i.kym-cdn.com/entries/icons/original/000/012/178/shrek.jpg',
    surprisedPikachu: 'https://i.kym-cdn.com/entries/icons/original/000/027/475/Screen_Shot_2018-10-25_at_11.02.15_AM.png',
    boromir:          'https://i.kym-cdn.com/entries/icons/original/000/000/143/493654d6ef.jpg',
    walterWhite:      'https://i.kym-cdn.com/entries/icons/original/000/041/177/cover7.jpg',
    jokerSerious:     'https://i.kym-cdn.com/entries/icons/original/000/003/189/Why_So_Serious_Banner.jpg',
    jokerSchemer:     'https://i.kym-cdn.com/entries/icons/original/000/013/052/schemer.PNG',
    darkKnight:       'https://i.kym-cdn.com/entries/icons/original/000/000/058/1231821095902.jpg',
    thanos:           'https://i.kym-cdn.com/entries/icons/original/000/029/464/anuss.jpg',
    babyYoda:         'https://i.kym-cdn.com/entries/icons/original/000/031/827/bright.jpg',
    bateman:          'https://i.kym-cdn.com/entries/icons/original/000/027/096/cover8.jpg',
    squidGame:        'https://i.kym-cdn.com/entries/icons/original/000/038/412/maxresdefault_(1).jpg',
    spongebob:        'https://i.kym-cdn.com/entries/icons/original/000/006/297/800px-autopx-scale-to-width-down.jpg',

    // Anime
    naruto:           'https://i.kym-cdn.com/entries/icons/original/000/015/163/narutoooh.jpg',
    dragonBall:       'https://i.kym-cdn.com/entries/icons/original/000/006/464/4StarDragonball.png',

    // Sports
    lebron:           'https://i.kym-cdn.com/entries/icons/original/000/015/995/USATSI_10778805.jpg',
    ronaldoSiuu:      'https://i.kym-cdn.com/entries/icons/original/000/039/420/CR7_siiii.jpg',
    messiRonaldo:     'https://i.kym-cdn.com/entries/icons/original/000/042/771/messironaldo.jpg',
    cryingMJ:         'https://i.kym-cdn.com/entries/icons/original/000/017/966/cryingmj.jpg',

    // Games — Minecraft
    minecraft:        'https://i.kym-cdn.com/entries/icons/original/000/004/361/Minecraft-Free-Download-PC-Mac.jpg',
    creeper:          'https://i.kym-cdn.com/entries/icons/original/000/004/349/creeper.jpg',
    enderman:         'https://i.kym-cdn.com/entries/icons/original/000/007/041/41389174.png',
    steve:            'https://minecraft.wiki/images/Steve_SSBU.png',

    // Games — Other
    amongUs:          'https://i.kym-cdn.com/entries/icons/original/000/035/151/among_us.jpg',
    fortnite:         'https://i.kym-cdn.com/entries/icons/original/000/024/820/maxresdefault.jpg',
    lol:              'https://i.kym-cdn.com/entries/icons/original/000/006/511/league.jpg',
    roblox:           'https://i.kym-cdn.com/entries/icons/original/000/006/429/rblxlogo.png',
    gta:              'https://i.kym-cdn.com/entries/icons/original/000/007/434/Grand-Theft-Auto.jpg',
    csgo:             'https://i.kym-cdn.com/entries/icons/original/000/015/181/unknown.png',
    zelda:            'https://i.kym-cdn.com/entries/icons/original/000/007/809/zelda.jpg',
    sonic:            'https://i.kym-cdn.com/entries/icons/original/000/008/595/sonichedgehogwallpaper169.jpg',
    eldenRing:        'https://i.kym-cdn.com/entries/icons/original/000/031/974/capsule_616x353.jpg',
    valorant:         'https://i.kym-cdn.com/entries/icons/original/000/031/539/logo.jpg',
    apex:             'https://i.kym-cdn.com/entries/icons/original/000/028/483/3495714-trailer_apexlegends_gameplayshort_20190204.jpg',
    overwatch:        'https://i.kym-cdn.com/entries/icons/original/000/019/337/overwatchlogo.png',
};

// Pokemon official artwork (popular profile pic choices)
function pokemon(id) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

const BOT_PROFILES = [
    // ── Bronze (ELO 400–950) — 20 bots, 5 diamond ──────────────────────────
    { username: 'notarobot404',   nameVariants: ['notarobot404',   'nr404',         'n0tarobot'],      elo: 435,  isDiamondPro: false, photoURL: IMG.trollface        },
    { username: 'just_vibing23',  nameVariants: ['just_vibing23',  'justvibing',    'vibing_ok'],      elo: 478,  isDiamondPro: false, photoURL: IMG.creeper          },
    { username: 'gamer_lasha',    nameVariants: ['gamer_lasha',    'lashaG',        'lasha_gg'],       elo: 512,  isDiamondPro: false, photoURL: IMG.doge             },
    { username: 'quiznoob99',     nameVariants: ['quiznoob99',     'qnoob99',       'noob_mode'],      elo: 548,  isDiamondPro: true,  photoURL: IMG.spongebob        },
    { username: 'mia_chen_irl',   nameVariants: ['mia_chen_irl',   'miac_irl',      'realmiachen'],    elo: 583,  isDiamondPro: false, photoURL: IMG.amongUs          },
    { username: 'sleepy_trivia',  nameVariants: ['sleepy_trivia',  'sleepytriv',    'trivia_zzz'],     elo: 614,  isDiamondPro: false, photoURL: IMG.thisIsFine       },
    { username: 'idk_man_lol',    nameVariants: ['idk_man_lol',    'idkman',        'idk404'],         elo: 651,  isDiamondPro: false, photoURL: IMG.nyanCat          },
    { username: 'giorgi.quiz',    nameVariants: ['giorgi.quiz',    'g_giorgi',      'giorgiq'],        elo: 679,  isDiamondPro: false, photoURL: IMG.roblox           },
    { username: 'tryhard_nika',   nameVariants: ['tryhard_nika',   'nika_th',       'nikatryh'],       elo: 713,  isDiamondPro: true,  photoURL: IMG.fortnite         },
    { username: 'randomguy_47',   nameVariants: ['randomguy_47',   'rguy47',        'rando_47'],       elo: 742,  isDiamondPro: false, photoURL: IMG.cryingMJ         },
    { username: 'marco_pls',      nameVariants: ['marco_pls',      'marcopls',      'marco_rly'],      elo: 762,  isDiamondPro: false, photoURL: IMG.minecraft        },
    { username: 'annapv_xo',      nameVariants: ['annapv_xo',      'anna_xo',       'xo_annap'],       elo: 791,  isDiamondPro: true,  photoURL: IMG.grumpyCat        },
    { username: 'felixwrld',      nameVariants: ['felixwrld',      'felixx',        'f3lix'],          elo: 823,  isDiamondPro: false, photoURL: IMG.enderman         },
    { username: 'sara.knows',     nameVariants: ['sara.knows',     'sara_ngl',      'saraknows'],      elo: 843,  isDiamondPro: false, photoURL: IMG.sonic            },
    { username: 'danbthegamer',   nameVariants: ['danbthegamer',   'dan_b_gg',      'danbtg'],         elo: 862,  isDiamondPro: true,  photoURL: IMG.ronaldoSiuu      },
    { username: 'priyas_here',    nameVariants: ['priyas_here',    'priyash',       'p_here'],         elo: 881,  isDiamondPro: false, photoURL: IMG.steve            },
    { username: 'tomek_k',        nameVariants: ['tomek_k',        'tomekk',        'to_mek'],         elo: 901,  isDiamondPro: false, photoURL: IMG.pepe             },
    { username: 'elenav_rn',      nameVariants: ['elenav_rn',      'elena_rn',      'evrn'],           elo: 921,  isDiamondPro: true,  photoURL: IMG.babyYoda         },
    { username: 'midnightsnacks', nameVariants: ['midnightsnacks', 'mnsnacks',      'mid_snacks'],     elo: 936,  isDiamondPro: false, photoURL: IMG.gta              },
    { username: 'yolo_quiz_tbh',  nameVariants: ['yolo_quiz_tbh',  'yoloquiz',      'quiz_tbh'],       elo: 951,  isDiamondPro: false, photoURL: IMG.rickroll         },

    // ── Silver (ELO 1002–1190) — 15 bots, 7 diamond ────────────────────────
    { username: 'luka.gg',        nameVariants: ['luka.gg',        'lukagg',        'luka_gg_'],       elo: 1008, isDiamondPro: false, photoURL: IMG.shrek            },
    { username: 'mia_leveled_up', nameVariants: ['mia_leveled_up', 'mia_lvlup',     'mialvl'],         elo: 1024, isDiamondPro: true,  photoURL: IMG.valorant         },
    { username: 'mariamtea',      nameVariants: ['mariamtea',      'mariam_t',      'mtea_'],          elo: 1041, isDiamondPro: false, photoURL: IMG.surprisedPikachu },
    { username: 'alexrk__',       nameVariants: ['alexrk__',       'alex__rk',      'a_rk99'],         elo: 1056, isDiamondPro: true,  photoURL: IMG.walterWhite      },
    { username: 'sophie_drip',    nameVariants: ['sophie_drip',    'soph_drip',     'drip_soph'],      elo: 1071, isDiamondPro: false, photoURL: IMG.lol              },
    { username: 'niko_bounce',    nameVariants: ['niko_bounce',    'nikobounce',    'n1ko_b'],         elo: 1086, isDiamondPro: true,  photoURL: IMG.stonks           },
    { username: 'yuki.m',         nameVariants: ['yuki.m',         'yuki_m_',       'yuki__'],         elo: 1102, isDiamondPro: false, photoURL: pokemon(94)          }, // Gengar
    { username: 'ibrahim_ofc',    nameVariants: ['ibrahim_ofc',    'ibra_ofc',      'ofc_ibrahim'],    elo: 1113, isDiamondPro: true,  photoURL: IMG.messiRonaldo     },
    { username: 'clara.h',        nameVariants: ['clara.h',        'clarah__',      'clara_hh'],       elo: 1126, isDiamondPro: false, photoURL: IMG.zelda            },
    { username: 'ryanactually',   nameVariants: ['ryanactually',   'ryan_act',      'actual_ryan'],    elo: 1141, isDiamondPro: true,  photoURL: IMG.bateman          },
    { username: 'zaramint',       nameVariants: ['zaramint',       'zara_mint',     'zara.m'],         elo: 1152, isDiamondPro: false, photoURL: IMG.naruto           },
    { username: 'ben.fox.io',     nameVariants: ['ben.fox.io',     'benfoxio',      'fox_ben'],        elo: 1161, isDiamondPro: true,  photoURL: IMG.lebron           },
    { username: 'leila.kr',       nameVariants: ['leila.kr',       'leilakr',       'leila_kr'],       elo: 1172, isDiamondPro: false, photoURL: IMG.overwatch        },
    { username: 'hugo_lmao',      nameVariants: ['hugo_lmao',      'hugolmao',      'hug0_l'],         elo: 1178, isDiamondPro: true,  photoURL: IMG.darkKnight       },
    { username: 'ninab_xd',       nameVariants: ['ninab_xd',       'nina_xd',       'ninabxd'],        elo: 1190, isDiamondPro: false, photoURL: pokemon(6)           }, // Charizard

    // ── Gold (ELO 1204–1388) — 15 bots, 8 diamond ──────────────────────────
    { username: 'chenwei_facts',  nameVariants: ['chenwei_facts',  'cw_facts',      'facts_cw'],       elo: 1204, isDiamondPro: false, photoURL: IMG.csgo             },
    { username: 'oksana.pro',     nameVariants: ['oksana.pro',     'oksanapro',     'okspro'],         elo: 1221, isDiamondPro: true,  photoURL: pokemon(448)         }, // Lucario
    { username: 'maxschr_gg',     nameVariants: ['maxschr_gg',     'max_sch_gg',    'm4xschr'],        elo: 1243, isDiamondPro: true,  photoURL: IMG.jokerSerious     },
    { username: 'aisha.mind',     nameVariants: ['aisha.mind',     'aishamind',     'mind_aisha'],     elo: 1257, isDiamondPro: false, photoURL: IMG.eldenRing        },
    { username: 'patricknreal',   nameVariants: ['patricknreal',   'pat_nreal',     'realpatn'],       elo: 1272, isDiamondPro: true,  photoURL: IMG.squidGame        },
    { username: 'fatima_rizes',   nameVariants: ['fatima_rizes',   'fat_rizes',     'f_rizes'],        elo: 1286, isDiamondPro: false, photoURL: IMG.apex             },
    { username: 'soren_plays',    nameVariants: ['soren_plays',    'sorplays',      's0ren_gg'],       elo: 1301, isDiamondPro: true,  photoURL: IMG.gigachad         },
    { username: 'meiyang_x',      nameVariants: ['meiyang_x',      'mei_yx',        'yangmei_'],       elo: 1317, isDiamondPro: false, photoURL: IMG.dragonBall       },
    { username: 'jakewfast',      nameVariants: ['jakewfast',      'jake_wf',       'w_jakefast'],     elo: 1326, isDiamondPro: true,  photoURL: IMG.thanos           },
    { username: 'freyahgg',       nameVariants: ['freyahgg',       'freya_hgg',     'hgg_freya'],      elo: 1341, isDiamondPro: false, photoURL: pokemon(150)         }, // Mewtwo
    { username: 'arjun_mindset',  nameVariants: ['arjun_mindset',  'arjunmind',     'mindset_arj'],    elo: 1352, isDiamondPro: true,  photoURL: IMG.boromir          },
    { username: 'chloe_bstats',   nameVariants: ['chloe_bstats',   'chloeb_st',     'bstats_chloe'],   elo: 1361, isDiamondPro: false, photoURL: pokemon(149)         }, // Dragonite
    { username: 'oscar.k',        nameVariants: ['oscar.k',        'oscar_k_',      'osck__'],         elo: 1367, isDiamondPro: true,  photoURL: IMG.jokerSchemer     },
    { username: 'ingrid_sharp',   nameVariants: ['ingrid_sharp',   'ingsharp',      'i_sharp'],        elo: 1374, isDiamondPro: false, photoURL: pokemon(133)         }, // Eevee
    { username: 'tomchen_iq',     nameVariants: ['tomchen_iq',     'tc_iq',         'iq_tomchen'],     elo: 1388, isDiamondPro: true,  photoURL: IMG.galaxyBrain      },

    // ── Platinum (ELO 1412–1582) — 10 bots, 7 diamond ──────────────────────
    { username: 'victorh_wins',   nameVariants: ['victorh_wins',   'vh_wins',       'wins_vh'],        elo: 1412, isDiamondPro: true,  photoURL: pokemon(384)         }, // Rayquaza
    { username: 'layla.apex',     nameVariants: ['layla.apex',     'laylaapex',     'apex_layla'],     elo: 1431, isDiamondPro: false, photoURL: IMG.wojak            },
    { username: 'dmtrv_',         nameVariants: ['dmtrv_',         'dmitrv__',      'd_mtrv'],         elo: 1452, isDiamondPro: true,  photoURL: pokemon(658)         }, // Greninja
    { username: 'gracew_ranked',  nameVariants: ['gracew_ranked',  'gw_ranked',     'ranked_gw'],      elo: 1471, isDiamondPro: true,  photoURL: pokemon(25)          }, // Pikachu
    { username: 'reza.moves',     nameVariants: ['reza.moves',     'rezamoves',     'moves_reza'],     elo: 1491, isDiamondPro: false, photoURL: pokemon(143)         }, // Snorlax
    { username: 'astrid_bmode',   nameVariants: ['astrid_bmode',   'abmode',        'bmode_ast'],      elo: 1513, isDiamondPro: true,  photoURL: pokemon(491)         }, // Darkrai
    { username: 'kwame_locks',    nameVariants: ['kwame_locks',    'kwamelocks',    'locks_kwame'],    elo: 1532, isDiamondPro: true,  photoURL: pokemon(248)         }, // Tyranitar
    { username: 'diana.clutch',   nameVariants: ['diana.clutch',   'dclutch',       'clutch_dc'],      elo: 1551, isDiamondPro: false, photoURL: pokemon(445)         }, // Garchomp
    { username: 'stef_meta',      nameVariants: ['stef_meta',      'stefmeta',      'meta_stef'],      elo: 1566, isDiamondPro: true,  photoURL: pokemon(212)         }, // Scizor
    { username: 'yunak_plat',     nameVariants: ['yunak_plat',     'yuna_plat',     'plat_yuna'],      elo: 1582, isDiamondPro: true,  photoURL: pokemon(131)         }, // Lapras

    // ── Diamond (ELO 1618–1751) — 5 bots, all diamond ───────────────────────
    { username: 'rafael_surge',   nameVariants: ['rafael_surge',   'rsurge',        'surge_raf'],      elo: 1618, isDiamondPro: true,  photoURL: pokemon(151)         }, // Mew
    { username: 'hana.w',         nameVariants: ['hana.w',         'hana__w',       'w_hana'],         elo: 1651, isDiamondPro: true,  photoURL: pokemon(571)         }, // Zoroark
    { username: 'andrei_precise', nameVariants: ['andrei_precise', 'ap_andrei',     'precise_ap'],     elo: 1692, isDiamondPro: true,  photoURL: pokemon(373)         }, // Salamence
    { username: 'zoestark_',      nameVariants: ['zoestark_',      'zoe_stark_',    'stark_zoe'],      elo: 1723, isDiamondPro: true,  photoURL: pokemon(59)          }, // Arcanine
    { username: 'kaimori',        nameVariants: ['kaimori',        'kai.mori',      'mori_kai'],       elo: 1751, isDiamondPro: true,  photoURL: pokemon(306)         }, // Aggron

    // ── Master (ELO 1822–1951) — 3 bots, all diamond ────────────────────────
    { username: 'nikolai_gmode',  nameVariants: ['nikolai_gmode',  'n_gmode',       'gmode_nik'],      elo: 1822, isDiamondPro: true,  photoURL: pokemon(330)         }, // Flygon
    { username: 'amara_decoded',  nameVariants: ['amara_decoded',  'a_decoded',     'decoded_am'],     elo: 1881, isDiamondPro: true,  photoURL: pokemon(52)          }, // Meowth
    { username: 'leo_storm_',     nameVariants: ['leo_storm_',     'leostorm_',     'storm_leo'],      elo: 1951, isDiamondPro: true,  photoURL: pokemon(197)         }, // Umbreon

    // ── Grandmaster (ELO 2055+) — 2 bots, all diamond ───────────────────────
    { username: 'vega.x',         nameVariants: ['vega.x',         'vega_x_',       'x_vega'],         elo: 2055, isDiamondPro: true,  photoURL: pokemon(94)          }, // Gengar
    { username: 'axiom_r',        nameVariants: ['axiom_r',        'ax10m_r',       'r_axiom'],        elo: 2153, isDiamondPro: true,  photoURL: pokemon(1)           }, // Bulbasaur
];

// Attach isBot flag and _baseName for name rotation
module.exports = BOT_PROFILES.map(b => ({
    ...b,
    isBot: true,
    _baseName: b.username,
}));
