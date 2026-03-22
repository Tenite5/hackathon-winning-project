/**
 * @file src/data/botProfiles.js
 * @description 70 bot accounts with internet-style usernames and locally-hosted
 * profile pictures (memes, movie/TV, sports, games, anime).
 * Images served from /images/bots/. ELOs span all rank tiers. ~Half have isDiamondPro.
 */

'use strict';

function img(name) { return `/images/bots/${name}`; }

const BOT_PROFILES = [
    // ── Bronze (ELO 400–950) — 20 bots, 5 diamond ──────────────────────────
    { username: 'xX_shadow_Xx',    nameVariants: ['xX_shadow_Xx',    'sh4dow_x',       'shadowXx'],       elo: 435,  isDiamondPro: false, photoURL: img('trollface.jpg')      },
    { username: 'noobmaster69',    nameVariants: ['noobmaster69',    'n00bmaster',     'noobm4ster'],     elo: 478,  isDiamondPro: false, photoURL: img('creeper.jpg')        },
    { username: 'gg_ez_lol',       nameVariants: ['gg_ez_lol',       'gg_ez_',         'ez_gg'],          elo: 512,  isDiamondPro: false, photoURL: img('doge.jpg')           },
    { username: 'big_chungus',     nameVariants: ['big_chungus',     'bigchungus_',    'chungus420'],     elo: 548,  isDiamondPro: true,  photoURL: img('spongebob.jpg')      },
    { username: 'yeet_delete',     nameVariants: ['yeet_delete',     'yeetdel',        'yeet_or_die'],    elo: 583,  isDiamondPro: false, photoURL: img('amongus.jpg')        },
    { username: 'touch_grass_',    nameVariants: ['touch_grass_',    'touchgrass',     'gr4ss_toucher'],  elo: 614,  isDiamondPro: false, photoURL: img('thisisfine.jpeg')    },
    { username: 'error_404_',      nameVariants: ['error_404_',      'err404',         '404_not_found'],  elo: 651,  isDiamondPro: false, photoURL: img('nyancat.jpg')        },
    { username: 'send_memes',      nameVariants: ['send_memes',      'sendmemes_',     'meme_dealer'],    elo: 679,  isDiamondPro: false, photoURL: img('roblox.png')         },
    { username: 'sk8rboi_',        nameVariants: ['sk8rboi_',        'sk8r_boi',       'sk8rboy'],        elo: 713,  isDiamondPro: true,  photoURL: img('fortnite.jpg')       },
    { username: 'bruh_moment',     nameVariants: ['bruh_moment',     'bruhh_',         'bruh_mnt'],       elo: 742,  isDiamondPro: false, photoURL: img('cryingmj.jpg')       },
    { username: 'ctrl_alt_del',    nameVariants: ['ctrl_alt_del',    'ctrlaltdel',     'ctrl_del'],       elo: 762,  isDiamondPro: false, photoURL: img('minecraft.jpg')      },
    { username: 'pizza_is_life',   nameVariants: ['pizza_is_life',   'pizzalife',      'pizza4life'],     elo: 791,  isDiamondPro: true,  photoURL: img('grumpycat.jpg')      },
    { username: 'no_cap_fr',       nameVariants: ['no_cap_fr',       'nocapfr',        'no_cap_ong'],     elo: 823,  isDiamondPro: false, photoURL: img('enderman.png')       },
    { username: 'vibe_check',      nameVariants: ['vibe_check',      'vibecheck_',     'vib3_ch3ck'],     elo: 843,  isDiamondPro: false, photoURL: img('sonic.jpg')          },
    { username: 'cope_harder',     nameVariants: ['cope_harder',     'copeharder',     'c0pe_'],          elo: 862,  isDiamondPro: true,  photoURL: img('ronaldo.jpg')        },
    { username: 'caffeine_iv',     nameVariants: ['caffeine_iv',     'caffeineiv',     'caf_iv'],         elo: 881,  isDiamondPro: false, photoURL: img('steve.png')          },
    { username: '2am_thoughts',    nameVariants: ['2am_thoughts',    '2amthoughts',    'thoughts_2am'],   elo: 901,  isDiamondPro: false, photoURL: img('pepe.jpg')           },
    { username: 'literally_1984',  nameVariants: ['literally_1984',  'lit_1984',       'its_1984'],       elo: 921,  isDiamondPro: true,  photoURL: img('babyyoda.jpg')       },
    { username: 'sus_amogus',      nameVariants: ['sus_amogus',      'susamogus',      'amogus_sus'],     elo: 936,  isDiamondPro: false, photoURL: img('gta.jpg')            },
    { username: 'ratio_king',      nameVariants: ['ratio_king',      'ratioking',      'king_ratio'],     elo: 951,  isDiamondPro: false, photoURL: img('rickroll.jpg')       },

    // ── Silver (ELO 1002–1190) — 15 bots, 7 diamond ────────────────────────
    { username: 'skill_issue_',    nameVariants: ['skill_issue_',    'skillissue',     'sk1ll_issue'],    elo: 1008, isDiamondPro: false, photoURL: img('shrek.jpg')          },
    { username: 'built_diff',      nameVariants: ['built_diff',      'builtdiff_',     'built_dif'],      elo: 1024, isDiamondPro: true,  photoURL: img('valorant.jpg')       },
    { username: 'frostbyte_',      nameVariants: ['frostbyte_',      'fr0stbyte',      'frostb_'],        elo: 1041, isDiamondPro: false, photoURL: img('surprisedpika.png')  },
    { username: 'main_char_nrg',   nameVariants: ['main_char_nrg',   'maincharnrg',    'mc_nrg'],         elo: 1056, isDiamondPro: true,  photoURL: img('walterwhite.jpg')    },
    { username: 'nighthawk_x',     nameVariants: ['nighthawk_x',     'n1ghthawk',      'nighthwk'],       elo: 1071, isDiamondPro: false, photoURL: img('lol.jpg')            },
    { username: 'rent_free',       nameVariants: ['rent_free',       'rentfree_',      'r3nt_free'],      elo: 1086, isDiamondPro: true,  photoURL: img('stonks.jpg')         },
    { username: 'stealth_mode',    nameVariants: ['stealth_mode',    'stealthmode',    'st34lth'],        elo: 1102, isDiamondPro: false, photoURL: img('naruto.jpg')         },
    { username: 'dog_water_',      nameVariants: ['dog_water_',      'dogwater',       'd0g_water'],      elo: 1113, isDiamondPro: true,  photoURL: img('messiron.jpg')       },
    { username: 'sudo_rm_rf',      nameVariants: ['sudo_rm_rf',      'sudormrf',       'sudo_rm'],        elo: 1126, isDiamondPro: false, photoURL: img('zelda.jpg')          },
    { username: 'certified_W',     nameVariants: ['certified_W',     'certifiedW',     'cert_W'],         elo: 1141, isDiamondPro: true,  photoURL: img('bateman.jpg')        },
    { username: 'its_morbin_time', nameVariants: ['its_morbin_time', 'morbintime',     'morbin_t'],       elo: 1152, isDiamondPro: false, photoURL: img('overwatch.png')      },
    { username: 'L_plus_ratio',    nameVariants: ['L_plus_ratio',    'Lplusratio',     'L_ratio'],        elo: 1161, isDiamondPro: true,  photoURL: img('lebron.jpg')         },
    { username: 'based_take',      nameVariants: ['based_take',      'basedtake',      'b4sed'],          elo: 1172, isDiamondPro: false, photoURL: img('jojo.jpg')           },
    { username: 'sussy_baka',      nameVariants: ['sussy_baka',      'sussybaka_',     'sussy_b'],        elo: 1178, isDiamondPro: true,  photoURL: img('darkknight.jpg')     },
    { username: 'alt_f4',          nameVariants: ['alt_f4',          'altf4_',         'alt_F4_gg'],      elo: 1190, isDiamondPro: false, photoURL: img('csgo.png')           },

    // ── Gold (ELO 1204–1388) — 15 bots, 8 diamond ──────────────────────────
    { username: 'diff_gap',        nameVariants: ['diff_gap',        'diffgap',        'gap_diff'],       elo: 1204, isDiamondPro: false, photoURL: img('apex.jpg')           },
    { username: 'zero_chill',      nameVariants: ['zero_chill',      'zerochill',      '0_chill'],        elo: 1221, isDiamondPro: true,  photoURL: img('demonslayer.jpeg')   },
    { username: 'lowkey_goated',   nameVariants: ['lowkey_goated',   'lowkeygoated',   'lk_goated'],      elo: 1243, isDiamondPro: true,  photoURL: img('gigachad.jpg')       },
    { username: 'AFK_farmer',      nameVariants: ['AFK_farmer',      'afkfarmer',      'afk_farm'],       elo: 1257, isDiamondPro: false, photoURL: img('terraria.jpg')       },
    { username: 'w_collector',     nameVariants: ['w_collector',     'wcollector',     'W_getter'],       elo: 1272, isDiamondPro: true,  photoURL: img('onepiece.jpg')       },
    { username: 'npc_energy',      nameVariants: ['npc_energy',      'npcenergy',      'npc_nrg'],        elo: 1286, isDiamondPro: false, photoURL: img('npcwojak.jpg')       },
    { username: 'diff_breed',      nameVariants: ['diff_breed',      'diffbreed',      'dif_bred'],       elo: 1301, isDiamondPro: true,  photoURL: img('dragonball.png')     },
    { username: 'just_cracked',    nameVariants: ['just_cracked',    'justcracked',    'cracked_'],       elo: 1317, isDiamondPro: false, photoURL: img('doom.jpg')           },
    { username: 'plot_armor',      nameVariants: ['plot_armor',      'plotarmor',      'pl0t_armor'],     elo: 1326, isDiamondPro: true,  photoURL: img('joker.jpg')          },
    { username: 'down_bad_',       nameVariants: ['down_bad_',       'downbad',        'd0wn_bad'],       elo: 1341, isDiamondPro: false, photoURL: img('fifa.png')           },
    { username: 'sigma_grind',     nameVariants: ['sigma_grind',     'sigmagrind',     's1gma_g'],        elo: 1352, isDiamondPro: true,  photoURL: img('godofwar.jpg')       },
    { username: 'oof_size_large',  nameVariants: ['oof_size_large',  'oofsizlrg',      'oof_large'],      elo: 1361, isDiamondPro: false, photoURL: img('disastergirl.jpg')   },
    { username: 'galaxy_brain',    nameVariants: ['galaxy_brain',    'galaxybrain',    'glxy_brain'],     elo: 1367, isDiamondPro: true,  photoURL: img('galaxybrain.png')    },
    { username: 'woke_up_chose',   nameVariants: ['woke_up_chose',   'wokeupchose',    'chose_viol'],     elo: 1374, isDiamondPro: false, photoURL: img('fnaf.jpg')           },
    { username: 'no_diff_gg',      nameVariants: ['no_diff_gg',      'nodiffgg',       'nodiff_'],        elo: 1388, isDiamondPro: true,  photoURL: img('eldenring.jpg')      },

    // ── Platinum (ELO 1412–1582) — 10 bots, 7 diamond ──────────────────────
    { username: 'spawn_kill',      nameVariants: ['spawn_kill',      'spawnkill_',     'sp4wn_k'],        elo: 1412, isDiamondPro: true,  photoURL: img('cod.png')            },
    { username: 'nerf_me_pls',     nameVariants: ['nerf_me_pls',     'nerfmepls',      'nerf_pls'],       elo: 1431, isDiamondPro: false, photoURL: img('genshin.jpg')        },
    { username: 'final_boss_',     nameVariants: ['final_boss_',     'finalboss',      'f1nal_boss'],     elo: 1452, isDiamondPro: true,  photoURL: img('thanos.jpg')         },
    { username: 'try_me_bro',      nameVariants: ['try_me_bro',      'trymebro',       'try_me_'],        elo: 1471, isDiamondPro: true,  photoURL: img('onepunchman.png')    },
    { username: 'hard_stuck',      nameVariants: ['hard_stuck',      'hardstuck_',     'h4rd_stuck'],     elo: 1491, isDiamondPro: false, photoURL: img('undertale.png')      },
    { username: 'peak_gaming',     nameVariants: ['peak_gaming',     'peakgaming',     'p3ak_gm'],        elo: 1513, isDiamondPro: true,  photoURL: img('deathnote.jpg')      },
    { username: 'diff_maker',      nameVariants: ['diff_maker',      'diffmaker',      'dif_mkr'],        elo: 1532, isDiamondPro: true,  photoURL: img('rickmorty.jpeg')     },
    { username: 'ego_check',       nameVariants: ['ego_check',       'egocheck_',      'ego_chk'],        elo: 1551, isDiamondPro: false, photoURL: img('wednesday.jpg')      },
    { username: 'built_4_this',    nameVariants: ['built_4_this',    'built4this',     'b4this'],         elo: 1566, isDiamondPro: true,  photoURL: img('squidgame.jpg')      },
    { username: 'elo_terrorist',   nameVariants: ['elo_terrorist',   'eloterrorist',   'elo_trr'],        elo: 1582, isDiamondPro: true,  photoURL: img('harrypotter.jpg')    },

    // ── Diamond (ELO 1618–1751) — 5 bots, all diamond ───────────────────────
    { username: 'diff_is_clear',   nameVariants: ['diff_is_clear',   'diffisclear',    'clr_diff'],       elo: 1618, isDiamondPro: true,  photoURL: img('starwars.jpg')       },
    { username: 'gg_go_next',      nameVariants: ['gg_go_next',      'gggonext',       'go_next_gg'],     elo: 1651, isDiamondPro: true,  photoURL: img('joker2.PNG')         },
    { username: 'hold_this_L',     nameVariants: ['hold_this_L',     'holdthisL',      'hold_L'],         elo: 1692, isDiamondPro: true,  photoURL: img('monke.jpg')          },
    { username: 'wake_up_babe',    nameVariants: ['wake_up_babe',    'wakeupbabe',     'wakeup_'],        elo: 1723, isDiamondPro: true,  photoURL: img('johnwick.jpg')       },
    { username: 'too_ez_4_me',     nameVariants: ['too_ez_4_me',     'tooez4me',       '2ez4me'],         elo: 1751, isDiamondPro: true,  photoURL: img('theoffice.jpg')      },

    // ── Master (ELO 1822–1951) — 3 bots, all diamond ────────────────────────
    { username: 'ur_diff',         nameVariants: ['ur_diff',         'urdiff_',        'ur_dif'],         elo: 1822, isDiamondPro: true,  photoURL: img('wojak.jpg')          },
    { username: 'one_trick_god',   nameVariants: ['one_trick_god',   'onetrickgod',    '1trick_god'],     elo: 1881, isDiamondPro: true,  photoURL: img('boromir.jpg')        },
    { username: 'clapped_u',       nameVariants: ['clapped_u',       'clappedu_',      'clapped_gg'],     elo: 1951, isDiamondPro: true,  photoURL: img('womanyelling.jpg')   },

    // ── Grandmaster (ELO 2055+) — 2 bots, all diamond ───────────────────────
    { username: 'actually_goated', nameVariants: ['actually_goated', 'goated_fr',      'goated_gg'],      elo: 2055, isDiamondPro: true,  photoURL: img('successkid.jpg')     },
    { username: 'apex_predator',   nameVariants: ['apex_predator',   'apexpred_',      'ap3x_pred'],      elo: 2153, isDiamondPro: true,  photoURL: img('steve2.jpg')         },
];

// Attach isBot flag and _baseName for name rotation
module.exports = BOT_PROFILES.map(b => ({
    ...b,
    isBot: true,
    _baseName: b.username,
}));
