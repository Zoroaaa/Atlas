/**
 * 归属判定回归集（附录 A）。
 *
 * 这 8 条是「改完之后不能再错」的底线用例，任何一条变红都说明打分或硬约束退化。
 * 期望值来自人工判定，不接受「当前实现输出什么就写什么」。
 */
import { describe, it, expect } from 'vitest';
import { groupResourcesBySubjectV2 } from '@/utils/subject-resolver';
import { parseReleaseTitle } from '@/utils/release-title';

interface Work {
  id: string;
  title: string;
  originalTitle?: string;
  year?: string;
  mediaType?: 'movie' | 'tv';
  totalEpisodes?: number;
  aliases?: string[];
}
interface Res {
  id: string;
  title: string;
}

const config = {
  subjectId: (s: Work) => s.id,
  subjectTitles: (s: Work) => [s.title, s.originalTitle ?? '', ...(s.aliases ?? [])].filter(Boolean),
  subjectYear: (s: Work) => s.year,
  subjectMediaType: (s: Work) => s.mediaType,
  subjectTotalEpisodes: (s: Work) => s.totalEpisodes,
  resourceTitle: (r: Res) => r.title,
  resourceId: (r: Res) => r.id,
};

const run = (subjects: Work[], resources: Res[]) =>
  groupResourcesBySubjectV2(subjects, resources, config);

const ownerOf = (result: ReturnType<typeof run>, resourceId: string) => {
  for (const group of result.groups) {
    if (group.resources.some(r => r.id === resourceId)) return group.subject.id;
  }
  return undefined;
};

describe('续作与基础作品', () => {
  const subjects: Work[] = [
    { id: 'base', title: '鬼灭之刃', aliases: ['Kimetsu no Yaiba'], totalEpisodes: 26 },
    { id: 'yukaku', title: '鬼灭之刃 游郭篇', aliases: ['Kimetsu no Yaiba Yuukaku-hen'], totalEpisodes: 11 },
  ];

  it('游郭篇资源归游郭篇，而不是被基础作品吞掉', () => {
    const res: Res[] = [{
      id: 'a',
      title: '[LoliHouse] 鬼灭之刃 游郭篇 / Kimetsu no Yaiba - Yuukaku-hen - 05 [WebRip 1080p]',
    }];
    expect(ownerOf(run(subjects, res), 'a')).toBe('yukaku');
  });

  it('基础作品资源归基础作品', () => {
    const res: Res[] = [{
      id: 'b',
      title: '[LoliHouse] 鬼灭之刃 / Kimetsu no Yaiba - 12 [WebRip 1080p]',
    }];
    expect(ownerOf(run(subjects, res), 'b')).toBe('base');
  });

  it('结果与作品入参顺序无关', () => {
    const res: Res[] = [{
      id: 'a',
      title: '[LoliHouse] 鬼灭之刃 游郭篇 / Kimetsu no Yaiba - Yuukaku-hen - 05 [WebRip 1080p]',
    }];
    expect(ownerOf(run([...subjects].reverse(), res), 'a')).toBe('yukaku');
  });
});

describe('同名不同年', () => {
  const subjects: Work[] = [
    { id: 'dune-2021', title: '沙丘', originalTitle: 'Dune', year: '2021', mediaType: 'movie' },
    { id: 'dune-1984', title: '沙丘', originalTitle: 'Dune', year: '1984', mediaType: 'movie' },
  ];

  it('1984 版资源归 1984，不会被排在前面的 2021 抢走', () => {
    const res: Res[] = [{ id: 'old', title: 'Dune.1984.1080p.BluRay.x264-GRP' }];
    expect(ownerOf(run(subjects, res), 'old')).toBe('dune-1984');
  });

  it('2021 版资源归 2021', () => {
    const res: Res[] = [{ id: 'new', title: 'Dune.2021.2160p.WEB-DL.DDP5.1.HDR.x265-NTb' }];
    expect(ownerOf(run(subjects, res), 'new')).toBe('dune-2021');
  });
});

describe('短词不误命中', () => {
  const subjects: Work[] = [
    { id: 'her', title: '她', originalTitle: 'Her', year: '2013', mediaType: 'movie' },
  ];

  it('The Mother / Where the Crawdads Sing 都不归入 Her', () => {
    const res: Res[] = [
      { id: 'm', title: 'The.Mother.2023.1080p.WEBRip.x264-GRP' },
      { id: 'w', title: 'Where.the.Crawdads.Sing.2022.1080p.WEBRip' },
    ];
    const result = run(subjects, res);
    expect(ownerOf(result, 'm')).toBeUndefined();
    expect(ownerOf(result, 'w')).toBeUndefined();
  });

  it('TPB 实测列表里只有真正的 Her 归入，其余全部 ungrouped', () => {
    const res: Res[] = [
      { id: 'real1', title: 'Her (2013) 1080p BrRip x264 - YIFY' },
      { id: 'real2', title: 'Her.2013.1080p.BluRay.DDP5.1.x265.10bit-GalaxyRG265' },
      { id: 'other1', title: 'Bring Her Back 2025 1080p AMZN WEB-DL DDP5 1 Atmos H 264-BYNDR' },
      { id: 'other2', title: 'Her.Private.Hell.2026.1080p.WEBRip.10Bit.DDP5.1.x265-NeoNoir' },
      { id: 'other3', title: 'Death Becomes Her 1992 Remastered 1080p BluRay HEVC x265 5.1 BONE' },
      { id: 'other4', title: 'The Cook, the Thief, His Wife & Her Lover (1989) 1080p BrRip' },
    ];
    const result = run(subjects, res);
    expect(ownerOf(result, 'real1')).toBe('her');
    expect(ownerOf(result, 'real2')).toBe('her');
    for (const id of ['other1', 'other2', 'other3', 'other4']) {
      expect(ownerOf(result, id)).toBeUndefined();
    }
  });

  it('两字拉丁标题 It 只认同年资源，不认 It Follows', () => {
    const subjects: Work[] = [
      { id: 'it', title: '小丑回魂', originalTitle: 'It', year: '2017', mediaType: 'movie' },
    ];
    const res: Res[] = [
      { id: 'right', title: 'It.2017.1080p.BluRay.x264-GRP' },
      { id: 'wrong', title: 'It.Follows.2014.1080p.BluRay.x264-GRP' },
    ];
    const result = run(subjects, res);
    expect(ownerOf(result, 'right')).toBe('it');
    expect(ownerOf(result, 'wrong')).toBeUndefined();
  });

  it('电影不接受剧集包（媒体类型互斥）', () => {
    const subjects: Work[] = [
      { id: 'her', title: '她', originalTitle: 'Her', year: '2013', mediaType: 'movie' },
    ];
    const res: Res[] = [{ id: 'tv', title: 'All Her Fault S01E03 1080p WEB H264-SYLiX' }];
    expect(ownerOf(run(subjects, res), 'tv')).toBeUndefined();
  });
});

describe('两字 CJK 与罗马音', () => {
  it('银魂 能命中「银魂 / Gintama」这种写法', () => {
    const subjects: Work[] = [{ id: 'gintama', title: '银魂', totalEpisodes: 367 }];
    const res: Res[] = [{ id: 'x', title: '[Group] 银魂 / Gintama - 300 [BDRip 1080p]' }];
    expect(ownerOf(run(subjects, res), 'x')).toBe('gintama');
  });

  it('补上别名后罗马音资源能归位', () => {
    const subjects: Work[] = [{
      id: 'frieren',
      title: '葬送的芙莉莲',
      aliases: ['葬送のフリーレン', 'Sousou no Frieren', 'Frieren: Beyond Journey\'s End'],
      totalEpisodes: 28,
    }];
    const res: Res[] = [
      { id: 'a', title: '[SubsPlease] Sousou no Frieren - 05 (1080p)' },
      { id: 'b', title: '[Erai-raws] Frieren Beyond Journey\'s End - 05 [1080p]' },
    ];
    const result = run(subjects, res);
    expect(ownerOf(result, 'a')).toBe('frieren');
    expect(ownerOf(result, 'b')).toBe('frieren');
  });

  it('没有别名时罗马音资源进 ungrouped（改前行为，作为对照）', () => {
    const subjects: Work[] = [{ id: 'frieren', title: '葬送的芙莉莲', totalEpisodes: 28 }];
    const res: Res[] = [{ id: 'a', title: '[SubsPlease] Sousou no Frieren - 05 (1080p)' }];
    expect(ownerOf(run(subjects, res), 'a')).toBeUndefined();
  });
});

describe('剧集命名防回退', () => {
  it('Stranger Things S04E09 归入剧集', () => {
    const subjects: Work[] = [{
      id: 'st', title: '怪奇物语', originalTitle: 'Stranger Things', mediaType: 'tv',
    }];
    const res: Res[] = [{ id: 'x', title: 'Stranger.Things.S04E09.1080p.WEB.H264-GRP' }];
    expect(ownerOf(run(subjects, res), 'x')).toBe('st');
  });

  it('集数超上限的资源被否决（第 300 集不能挂到 12 集番）', () => {
    const subjects: Work[] = [{ id: 'short', title: '某番', aliases: ['Some Show'], totalEpisodes: 12 }];
    const res: Res[] = [{ id: 'x', title: 'Some.Show - 300 [1080p]' }];
    expect(ownerOf(run(subjects, res), 'x')).toBeUndefined();
  });
});

describe('真实发布名（DMHY 实测）', () => {
  const subjects: Work[] = [{
    id: 'frieren',
    title: '葬送的芙莉莲',
    aliases: ['葬送のフリーレン', 'Sousou no Frieren', 'Frieren: Beyond Journey\'s End'],
    totalEpisodes: 28,
  }];

  it('撇号/无撇号、SxxExx、合集区间都能归位', () => {
    const res: Res[] = [
      { id: 'a', title: 'Frieren.Beyond.Journeys.End.S01E01.REPACK2.1080p.WEBRip.Dual-Audio.x264' },
      { id: 'b', title: 'Sousou no Frieren - S01E23v2 - MULTi 1080p WEB x264 -NanDesuKa' },
      { id: 'c', title: '[9volt] Sousou no Frieren - 17-28 (Cour 2) [1080p]' },
      { id: 'd', title: 'Frieren.Beyond.Journeys.End.S01.1080p.NF.WEB-DL.AAC2.0.H.264' },
      { id: 'e', title: '[Judas] Sousou no Frieren (Frieren Beyond Journey`s End) (Season 1) [1080p]' },
    ];
    const result = run(subjects, res);
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      expect(ownerOf(result, id)).toBe('frieren');
    }
  });

  it('合集被标记为 batch，但不影响归属', () => {
    const p = parseReleaseTitle('[9volt] Sousou no Frieren - 17-28 (Cour 2) [1080p]');
    expect(p.isBatch).toBe(true);
    expect(p.episodeRange).toEqual([17, 28]);
  });
});

describe('parseReleaseTitle 字段抽取', () => {
  it('抽取季集、分辨率、来源、编码、组、字幕', () => {
    const p = parseReleaseTitle('[LoliHouse] 鬼灭之刃 游郭篇 / Kimetsu no Yaiba - Yuukaku-hen - 05 [WebRip 1080p][简繁]');
    expect(p.group).toBe('LoliHouse');
    expect(p.resolution).toBe('1080p');
    expect(p.mediaSource).toBe('WEBRIP');
    expect(p.episode).toBe(5);
    expect(p.subtitle).toContain('zh-Hans+zh-Hant');
    expect(p.segments).toContain('鬼灭之刃 游郭篇');
  });

  it('识别 SxxExx 与年份', () => {
    const p = parseReleaseTitle('Stranger.Things.S04E09.1080p.WEB.H264-GRP');
    expect(p.season).toBe(4);
    expect(p.episode).toBe(9);
    expect(p.resolution).toBe('1080p');
    expect(p.segments).toEqual(['stranger things']);
  });

  it('识别合集区间', () => {
    const p = parseReleaseTitle('[Group] Some Anime [01-12][1080p]');
    expect(p.isBatch).toBe(true);
    expect(p.episodeRange).toEqual([1, 12]);
  });

  it('不把 4 位年份当集数', () => {
    const p = parseReleaseTitle('Dune.1984.1080p.BluRay.x264-GRP');
    expect(p.year).toBe(1984);
    expect(p.episode).toBeUndefined();
  });
});
